//SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';
import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/access/AccessControl.sol';
import '@openzeppelin/contracts/access/Ownable.sol';
import '@openzeppelin/contracts/utils/ReentrancyGuard.sol';

import './IERC20Supplied.sol';
import './IStakingRewardDistributor.sol';

contract StakingRewardDistributor is IStakingRewardDistributor, AccessControl, ReentrancyGuard {
    using SafeERC20 for IERC20;

    error WrongAmount();

    // Create a new role identifier for the distributor role
    bytes32 public constant DISTRIBUTOR_ROLE = keccak256('DISTRIBUTOR_ROLE');
    bytes32 public constant RECAPITALIZATION_ROLE = keccak256('RECAPITALIZATION_ROLE');

    uint256 private constant ACC_REWARD_PRECISION = 1e12;

    uint256 public constant EXIT_PERCENT = 150; // 15%
    uint256 public constant PERCENT_DENOMINATOR = 1e3;

    uint256 public constant BLOCKS_IN_2_WEEKS = (14 * 24 * 60 * 60) / 12; //TODO: decide where replace with variable
    //TODO: decide where replace with variable
    uint256 public constant BLOCKS_IN_4_MONTHS = (4 * 30 * 24 * 60 * 60) / 12;

    // Info of each user per pool.
    struct UserPoolInfo {
        uint256 amount; // How many tokens the user has provided.
        uint256[] accruedRewards; // Reward accrued.
        uint256 depositedBlock;
    }

    // Info of each pool.
    struct PoolInfo {
        IERC20 token; // Address of token contract.
        IERC20Supplied stakingToken; // Address of staking token contract.
        uint256 allocPoint; // How many allocation points assigned to this pool.
        uint256[] accRewardsPerShare; // Accumulated reward token per share, times ACC_REWARD_PRECISION. See below.
        uint256[] lastRewardBlocks; // Last block number that reward tokens distribution occurs.
    }

    struct RewardTokenInfo {
        IERC20 token;
        uint256 rewardPerBlock; // rewardToken tokens created per block.
        uint256 distributionBlock; // distribution start block
    }

    // The reward token token infos
    RewardTokenInfo[] public rewardTokenInfo;
    mapping(address => uint256) public rewardTokenTidByAddress;

    // Accumulated rewards
    // tid => user => claimable balance
    mapping(uint256 => mapping(address => uint256)) public rewards;

    // Claimed rewards
    // tid => user => claimed balance
    mapping(uint256 => mapping(address => uint256)) public claimedRewards;

    // Info of each pool.
    PoolInfo[] public poolInfo;
    // Pid of each pool by its address
    mapping(address => uint256) public poolPidByAddress;
    // Info of each user that stakes tokens.
    mapping(uint256 => mapping(address => UserPoolInfo)) public userPoolInfo;
    // Total allocation points. Must be the sum of all allocation points in all pools.
    uint256 public totalAllocPoint = 0;

    uint256[] public totalAmounts;

    address public earlyExitReceiver;

    event RewardTokenAdded(address indexed token, uint256 indexed tid);
    event PoolAdded(address indexed token, uint256 indexed pid, uint256 allocPoint);
    event Claimed(address indexed user, uint256 amount);
    event Deposited(address indexed user, uint256 indexed pid, uint256 amount);
    event EmergencyWithdrawn(
        address indexed user,
        uint256 indexed pid,
        uint256 amount,
        uint256 amountAdjusted
    );
    event RewardPerBlockSet(uint256 indexed tid, uint256 rewardPerBlock);
    event PoolSet(address indexed token, uint256 indexed pid, uint256 allocPoint);
    event Withdrawn(
        address indexed user,
        uint256 indexed pid,
        uint256 amount,
        uint256 amountAdjusted
    );
    event EarlyExitReceiverChanged(address receiver);

    constructor() {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    function setEarlyExitReceiver(address _receiver) external onlyRole(DEFAULT_ADMIN_ROLE) {
        earlyExitReceiver = _receiver;
        emit EarlyExitReceiverChanged(_receiver);
    }

    function addRewardToken(IERC20 _token) external onlyRole(DEFAULT_ADMIN_ROLE) {
        uint256 tid = rewardTokenInfo.length;
        rewardTokenInfo.push(
            RewardTokenInfo({ token: _token, rewardPerBlock: 0, distributionBlock: 0 })
        );
        rewardTokenTidByAddress[address(_token)] = tid;

        emit RewardTokenAdded(address(_token), tid);
    }

    // Add a new token to the pool. Can only be called by the owner.
    function addPool(
        uint256 _allocPoint,
        IERC20 _token,
        IERC20Supplied _stakingToken,
        bool _withUpdate
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(!isPoolAdded(_token), 'add: token already added');

        if (_withUpdate) {
            updateAllPools();
        }

        uint256[] memory lastRewardBlocks = new uint256[](rewardTokenInfo.length);
        uint256[] memory accRewardsPerShare = new uint256[](rewardTokenInfo.length);
        uint256 length = rewardTokenInfo.length;
        for (uint256 tid = 0; tid < length; ++tid) {
            lastRewardBlocks[tid] = rewardTokenInfo[tid].distributionBlock > 0 &&
                block.number >= rewardTokenInfo[tid].distributionBlock &&
                block.number <= rewardTokenInfo[tid].distributionBlock + BLOCKS_IN_2_WEEKS
                ? block.number
                : 0;
            accRewardsPerShare[tid] = 0;
        }

        totalAllocPoint += _allocPoint;

        uint256 pid = poolInfo.length;
        poolInfo.push(
            PoolInfo({
                token: _token,
                stakingToken: _stakingToken,
                allocPoint: _allocPoint,
                lastRewardBlocks: lastRewardBlocks,
                accRewardsPerShare: accRewardsPerShare
            })
        );
        poolPidByAddress[address(_token)] = pid;

        emit PoolAdded(address(_token), pid, _allocPoint);
    }

    function getPoolTokenRatio(uint256 pid) public view returns (uint256) {
        return (poolInfo[pid].token.balanceOf(address(this)) * 1e18) / totalAmounts[pid];
    }

    function withdrawPoolToken(
        address token,
        uint256 amount
    ) external onlyRole(RECAPITALIZATION_ROLE) {
        uint256 pid = poolPidByAddress[token];
        PoolInfo memory poolInfo_ = poolInfo[pid];
        if (amount >= poolInfo_.token.balanceOf(address(this))) revert WrongAmount();
        poolInfo_.token.safeTransfer(msg.sender, amount);
    }

    // Start 2 week per block distribution for stakers
    function distribute(uint256 tid, uint256 amount) external onlyRole(DISTRIBUTOR_ROLE) {
        RewardTokenInfo storage reward = rewardTokenInfo[tid];

        reward.token.safeTransferFrom(msg.sender, address(this), amount);

        if (reward.rewardPerBlock > 0) {
            updateAllPools();
        }

        if (
            reward.distributionBlock == 0 ||
            block.number > reward.distributionBlock + BLOCKS_IN_2_WEEKS
        ) {
            reward.distributionBlock = block.number;
            reward.rewardPerBlock = amount / BLOCKS_IN_2_WEEKS;
        } else {
            uint256 remainDistributionBlocks = block.number - reward.distributionBlock;

            reward.rewardPerBlock =
                (amount + (remainDistributionBlocks * reward.rewardPerBlock) / 1e18) /
                BLOCKS_IN_2_WEEKS;

            reward.rewardPerBlock = block.number;
        }

        emit RewardPerBlockSet(tid, reward.rewardPerBlock);
    }

    // Update reward variables for all pools
    function updateAllPools() public nonReentrant {
        uint256 length = poolInfo.length;
        for (uint256 pid = 0; pid < length; ++pid) {
            updatePool(pid);
        }
    }

    // Update reward variables of the given pool to be up-to-date.
    function updatePool(uint256 _pid) public nonReentrant {
        PoolInfo storage pool = poolInfo[_pid];
        uint256 currentBlock = block.number;
        uint256 lpSupply = pool.token.balanceOf(address(this));

        uint256 length = rewardTokenInfo.length;
        for (uint256 tid = 0; tid < length; ++tid) {
            RewardTokenInfo memory rewardToken = rewardTokenInfo[tid];
            uint256 distributionBlock = rewardToken.distributionBlock;

            if (currentBlock > distributionBlock + BLOCKS_IN_2_WEEKS) {
                currentBlock = distributionBlock + BLOCKS_IN_2_WEEKS;
            }
            if (currentBlock <= pool.lastRewardBlocks[tid]) {
                continue;
            }

            if (lpSupply == 0) {
                pool.lastRewardBlocks[tid] = currentBlock;
                continue;
            }

            uint256 blockLasted = currentBlock - pool.lastRewardBlocks[tid];

            uint256 reward = (blockLasted * rewardToken.rewardPerBlock * pool.allocPoint) /
                totalAllocPoint;

            pool.accRewardsPerShare[tid] += (reward * ACC_REWARD_PRECISION) / lpSupply;

            pool.lastRewardBlocks[tid] = currentBlock;
        }
    }

    // Deposit tokens to staking for reward token allocation.
    function deposit(uint256 _pid, uint256 _amount) external nonReentrant {
        updatePool(_pid);

        UserPoolInfo storage userPool = userPoolInfo[_pid][msg.sender];

        if (_amount > 0) {
            poolInfo[_pid].token.safeTransferFrom(address(msg.sender), address(this), _amount);

            userPool.amount += _amount;
            totalAmounts[_pid] += _amount;

            IERC20Supplied stakingToken = poolInfo[_pid].stakingToken;
            if (address(stakingToken) != address(0)) {
                stakingToken.mint(msg.sender, _amount);
            }
        }

        uint256 length = rewardTokenInfo.length;
        for (uint256 tid = 0; tid < length; ++tid) {
            accrueReward(tid, _pid);
            userPool.accruedRewards[tid] = calcReward(
                tid,
                poolInfo[_pid],
                userPoolInfo[_pid][msg.sender]
            );
        }

        userPool.depositedBlock = block.number;
        emit Deposited(msg.sender, _pid, _amount);
    }

    // claim rewards
    function claim(uint256 _tid) external nonReentrant {
        uint256 i;
        for (i = 0; i < poolInfo.length; ++i) {
            updatePool(i);
            accrueReward(_tid, i);
            UserPoolInfo storage userPool = userPoolInfo[i][msg.sender];
            userPool.accruedRewards[_tid] = calcReward(_tid, poolInfo[i], userPool);
        }
        uint256 claimable = rewards[_tid][msg.sender] - claimedRewards[_tid][msg.sender];
        if (claimable > 0) {
            _safeRewardTransfer(rewardTokenInfo[_tid].token, msg.sender, claimable);
        }
        claimedRewards[_tid][msg.sender] += claimable;
        emit Claimed(msg.sender, claimable);
    }

    function accrueReward(uint256 tid, uint256 _pid) internal {
        UserPoolInfo memory userPool = userPoolInfo[_pid][msg.sender];
        if (userPool.amount == 0) {
            return;
        }
        rewards[tid][msg.sender] +=
            calcReward(tid, poolInfo[_pid], userPool) -
            userPool.accruedRewards[tid];
    }

    function calcReward(
        uint256 tid,
        PoolInfo memory pool,
        UserPoolInfo memory userPool
    ) internal pure returns (uint256) {
        return (userPool.amount * pool.accRewardsPerShare[tid]) / ACC_REWARD_PRECISION;
    }

    // Safe rewardToken transfer function.
    function _safeRewardTransfer(IERC20 rewardToken, address _to, uint256 _amount) internal {
        uint256 balance = rewardToken.balanceOf(address(this));
        if (_amount > balance) {
            rewardToken.safeTransfer(_to, balance);
        } else {
            rewardToken.safeTransfer(_to, _amount);
        }
    }

    // Withdraw without caring about rewards. EMERGENCY ONLY.
    function withdrawEmergency(uint256 _pid) external {
        PoolInfo storage pool = poolInfo[_pid];
        UserPoolInfo storage userPool = userPoolInfo[_pid][msg.sender];
        uint256 amountAdjusted = (userPool.amount * getPoolTokenRatio(_pid)) / 1e18;

        pool.token.safeTransfer(address(msg.sender), amountAdjusted);
        emit EmergencyWithdrawn(msg.sender, _pid, userPool.amount, amountAdjusted);
        totalAmounts[_pid] -= userPool.amount;
        userPool.amount = 0;

        IERC20Supplied stakingToken = pool.stakingToken;
        if (address(stakingToken) != address(0)) {
            stakingToken.burn(userPool.amount);
        }

        uint256 length = rewardTokenInfo.length;
        for (uint256 tid = 0; tid < length; ++tid) {
            userPool.accruedRewards[tid] = 0;
        }
    }

    // Update the given pool's reward token allocation point. Can only be called by the owner.
    function reallocatePool(
        uint256 _pid,
        uint256 _allocPoint,
        bool _withUpdate
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (_withUpdate) {
            updateAllPools();
        }
        totalAllocPoint = totalAllocPoint - poolInfo[_pid].allocPoint + _allocPoint;
        poolInfo[_pid].allocPoint = _allocPoint;

        emit PoolSet(address(poolInfo[_pid].token), _pid, _allocPoint);
    }

    // Withdraw tokens from rewardToken staking.
    function withdraw(uint256 _pid, uint256 _amount) external nonReentrant {
        require(userPoolInfo[_pid][msg.sender].amount >= _amount, 'withdraw: not enough amount');
        updatePool(_pid);
        UserPoolInfo storage userPool = userPoolInfo[_pid][msg.sender];
        uint256 amountAdjusted = (_amount * getPoolTokenRatio(_pid)) / 1e18;
        if (_amount > 0) {
            userPool.amount -= _amount;
            totalAmounts[_pid] -= _amount;

            uint256 transferAmount = amountAdjusted;
            if (userPool.depositedBlock > block.number - BLOCKS_IN_4_MONTHS) {
                transferAmount =
                    (amountAdjusted * (PERCENT_DENOMINATOR - EXIT_PERCENT)) /
                    PERCENT_DENOMINATOR;
                poolInfo[_pid].token.safeTransfer(
                    earlyExitReceiver,
                    amountAdjusted - transferAmount
                );
            }
            poolInfo[_pid].token.safeTransfer(address(msg.sender), transferAmount);

            IERC20Supplied stakingToken = poolInfo[_pid].stakingToken;
            if (address(stakingToken) != address(0)) {
                stakingToken.burn(_amount);
            }
        }

        uint256 length = rewardTokenInfo.length;
        for (uint256 tid = 0; tid < length; ++tid) {
            accrueReward(tid, _pid);
            userPool.accruedRewards[tid] = calcReward(
                tid,
                poolInfo[_pid],
                userPoolInfo[_pid][msg.sender]
            );
        }
        emit Withdrawn(msg.sender, _pid, _amount, amountAdjusted);
    }

    // Number of pools.
    function poolCount() external view returns (uint256) {
        return poolInfo.length;
    }

    // Number of reward tokens.
    function rewardTokenCount() external view returns (uint256) {
        return rewardTokenInfo.length;
    }

    function isPoolAdded(IERC20 _token) public view returns (bool) {
        uint256 pid = poolPidByAddress[address(_token)];
        return poolInfo.length > pid && address(poolInfo[pid].token) == address(_token);
    }

    function isRewardTokenAdded(IERC20 _token) public view returns (bool) {
        uint256 tid = rewardTokenTidByAddress[address(_token)];
        return
            rewardTokenInfo.length > tid && address(rewardTokenInfo[tid].token) == address(_token);
    }

    function getPendingReward(
        uint256 _tid,
        uint256 _pid,
        address _user
    ) external view returns (uint256 total) {
        RewardTokenInfo memory token = rewardTokenInfo[_tid];
        PoolInfo memory pool = poolInfo[_pid];

        uint256 currentBlock = block.number;

        uint256 lpSupply = pool.token.balanceOf(address(this));
        if (lpSupply == 0) {
            return 0;
        }
        uint256 blockLasted = currentBlock - pool.lastRewardBlocks[_tid];
        uint256 reward = (blockLasted * token.rewardPerBlock * pool.allocPoint) / totalAllocPoint;
        uint256 accRewardPerShare = pool.accRewardsPerShare[_tid] +
            ((reward * ACC_REWARD_PRECISION) / lpSupply);

        UserPoolInfo memory userPool = userPoolInfo[_pid][_user];
        total =
            ((userPool.amount * accRewardPerShare) / ACC_REWARD_PRECISION) -
            userPool.accruedRewards[_tid];
    }

    function getAllPools() external view returns (PoolInfo[] memory) {
        return poolInfo;
    }

    function withdrawStuckToken(IERC20 _token) external onlyRole(DEFAULT_ADMIN_ROLE) {
        uint256 tokenBalance = _token.balanceOf(address(this));
        if (tokenBalance > 0) {
            _token.safeTransfer(_msgSender(), tokenBalance);
        }
    }
}
