//SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';
import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol';

import './IERC20Supplied.sol';
import './IStakingRewardDistributor.sol';
import './IERC20UpdateCallback.sol';

contract StakingRewardDistributor is
    IStakingRewardDistributor,
    IERC20UpdateCallback,
    UUPSUpgradeable,
    AccessControlUpgradeable,
    ReentrancyGuardUpgradeable
{
    using SafeERC20 for IERC20;

    error WrongAmount();
    error TokenAlreadyAdded();
    error ZeroAddress();
    error WrongStakingToken();
    error WrongPoolId();

    // Create a new role identifier for the distributor role
    bytes32 public constant DISTRIBUTOR_ROLE = keccak256('DISTRIBUTOR_ROLE');
    bytes32 public constant RECAPITALIZATION_ROLE = keccak256('RECAPITALIZATION_ROLE');

    uint256 private constant ACC_REWARD_PRECISION = 1e12;

    uint256 public constant EXIT_PERCENT = 150; // 15%
    uint256 public constant PERCENT_DENOMINATOR = 1e3;

    //TODO: decide where replace with variable
    uint256 public constant BLOCKS_IN_2_WEEKS = (14 * 24 * 60 * 60) / 12;
    //TODO: decide where replace with variable
    uint256 public constant BLOCKS_IN_4_MONTHS = (4 * 30 * 24 * 60 * 60) / 12;

    // Info of each user per pool.
    struct UserPoolInfo {
        uint256 amount; // How many tokens the user has provided.
        mapping(uint256 => uint256) accruedRewards; // Reward accrued.
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
    // Pid of each pool by its staking address
    mapping(address => uint256) public poolPidByStakingAddress;
    // Info of each user that stakes tokens.
    mapping(uint256 => mapping(address => UserPoolInfo)) public userPoolInfo;
    // Total allocation points. Must be the sum of all allocation points in all pools.
    uint256 public totalAllocPoint;

    mapping(uint256 => uint256) public totalAmounts;
    mapping(uint256 => uint256) public recapitalizedAmounts;

    address public earlyExitReceiver;

    event RewardTokenAdded(address indexed token, uint256 indexed tid);
    event PoolAdded(address indexed token, uint256 indexed pid, uint256 allocPoint);
    event Claimed(address indexed user, uint256 indexed tid, uint256 amount);
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

    function initialize() public initializer {
        __UUPSUpgradeable_init();
        __AccessControl_init();
        __ReentrancyGuard_init();

        _grantRole(DEFAULT_ADMIN_ROLE, _msgSender());
    }

    function _authorizeUpgrade(address) internal override onlyRole(DEFAULT_ADMIN_ROLE) {}

    function version() public pure returns (uint256) {
        return 1;
    }

    function setEarlyExitReceiver(address _receiver) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (_receiver == address(0)) revert ZeroAddress();
        earlyExitReceiver = _receiver;
        emit EarlyExitReceiverChanged(_receiver);
    }

    function addRewardToken(IERC20 _token) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (address(_token) == address(0)) revert ZeroAddress();
        if (isRewardTokenAdded(address(_token))) revert TokenAlreadyAdded();

        uint256 tid = rewardTokenInfo.length;
        rewardTokenInfo.push(
            RewardTokenInfo({ token: _token, rewardPerBlock: 0, distributionBlock: 0 })
        );
        rewardTokenTidByAddress[address(_token)] = tid;

        uint256 length = poolInfo.length;
        for (uint256 pid; pid < length; ++pid) {
            poolInfo[pid].lastRewardBlocks.push(0);
            poolInfo[pid].accRewardsPerShare.push(0);
        }

        emit RewardTokenAdded(address(_token), tid);
    }

    // Add a new token to the pool. Can only be called by the owner.
    function addPool(
        uint256 _allocPoint,
        IERC20 _token,
        IERC20Supplied _stakingToken,
        bool _withUpdate
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (_allocPoint == 0) revert WrongAmount();
        if (address(_token) == address(0)) revert ZeroAddress();

        if (isPoolAdded(_token)) revert TokenAlreadyAdded();

        if (_withUpdate) {
            updateAllPools();
        }

        uint256[] memory lastRewardBlocks = new uint256[](rewardTokenInfo.length);
        uint256[] memory accRewardsPerShare = new uint256[](rewardTokenInfo.length);
        uint256 length = rewardTokenInfo.length;
        for (uint256 tid; tid < length; ++tid) {
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

        if (address(_stakingToken) != address(0)) {
            poolPidByStakingAddress[address(_stakingToken)] = pid;
            _stakingToken.setUpdateCallback(address(this));
        }

        emit PoolAdded(address(_token), pid, _allocPoint);
    }

    function onERC20Update(address from, address to, uint256 value) external override {
        if (
            from != address(0) && to != address(0) && from != address(this) && to != address(this)
        ) {
            uint256 pid = poolPidByStakingAddress[msg.sender];
            PoolInfo memory pool = poolInfo[pid];
            if (msg.sender != address(pool.stakingToken)) revert WrongStakingToken();

            updatePool(pid);

            uint256 rewardTokenInfoLength = rewardTokenInfo.length;
            for (uint256 tid; tid < rewardTokenInfoLength; ++tid) {
                accrueReward(tid, pid);
            }

            UserPoolInfo storage userPoolFrom = userPoolInfo[pid][from];
            UserPoolInfo storage userPoolTo = userPoolInfo[pid][to];

            unchecked {
                userPoolFrom.amount -= value;
                userPoolTo.amount += value;
            }

            for (uint256 tid; tid < rewardTokenInfoLength; ++tid) {
                userPoolFrom.accruedRewards[tid] = calcReward(tid, pool, userPoolFrom);
                emit Withdrawn(from, pid, value, value);

                userPoolTo.accruedRewards[tid] = calcReward(tid, pool, userPoolTo);
                userPoolTo.depositedBlock = block.number;
                emit Deposited(to, pid, value);
            }
        }
    }

    function getPoolTokenRatio(uint256 pid) public view returns (uint256) {
        return ((totalAmounts[pid] - recapitalizedAmounts[pid]) * 1e18) / totalAmounts[pid];
    }

    function withdrawPoolToken(
        address token,
        uint256 amount
    ) external onlyRole(RECAPITALIZATION_ROLE) {
        uint256 pid = poolPidByAddress[token];
        PoolInfo memory poolInfo_ = poolInfo[pid];
        if (amount >= totalAmounts[pid] - recapitalizedAmounts[pid]) revert WrongAmount();
        recapitalizedAmounts[pid] += amount;
        poolInfo_.token.safeTransfer(msg.sender, amount);
    }

    function returnPoolToken(
        address token,
        uint256 amount
    ) external onlyRole(RECAPITALIZATION_ROLE) {
        uint256 pid = poolPidByAddress[token];
        PoolInfo memory poolInfo_ = poolInfo[pid];
        if (amount > recapitalizedAmounts[pid]) revert WrongAmount();
        recapitalizedAmounts[pid] -= amount;
        poolInfo_.token.safeTransferFrom(msg.sender, address(this), amount);
    }

    // Start 2 week per block distribution for stakers
    function distribute(uint256 tid, uint256 amount) external onlyRole(DISTRIBUTOR_ROLE) {
        RewardTokenInfo storage reward = rewardTokenInfo[tid];

        reward.token.safeTransferFrom(msg.sender, address(this), amount);

        // finalized previous distribution
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
            uint256 remainDistributionBlocks = reward.distributionBlock +
                BLOCKS_IN_2_WEEKS -
                block.number;

            reward.rewardPerBlock =
                (amount + (remainDistributionBlocks * reward.rewardPerBlock)) /
                BLOCKS_IN_2_WEEKS;

            reward.distributionBlock = block.number;
        }

        // init a new distribution
        updateAllPools();

        emit RewardPerBlockSet(tid, reward.rewardPerBlock);
    }

    // Update reward variables for all pools
    function updateAllPools() public nonReentrant {
        uint256 length = poolInfo.length;
        for (uint256 pid; pid < length; ++pid) {
            updatePool(pid);
        }
    }

    // Update reward variables of the given pool to be up-to-date.
    function updatePool(uint256 _pid) public {
        if (_pid >= poolInfo.length) revert WrongPoolId();

        PoolInfo storage pool = poolInfo[_pid];
        uint256 lpSupply = totalAmounts[_pid];

        uint256 length = rewardTokenInfo.length;
        for (uint256 tid; tid < length; ++tid) {
            uint256 currentBlock = block.number;

            RewardTokenInfo memory rewardToken = rewardTokenInfo[tid];
            uint256 distributionBlock = rewardToken.distributionBlock;

            // distribution hasn't started yet
            if (distributionBlock == 0) continue;

            // distribution has ended, set last reward block to end block to distribute all
            if (currentBlock > distributionBlock + BLOCKS_IN_2_WEEKS) {
                currentBlock = distributionBlock + BLOCKS_IN_2_WEEKS;
            }

            // if zero supply, set to current block
            if (lpSupply == 0) {
                pool.lastRewardBlocks[tid] = currentBlock;
                continue;
            }

            // if last reward block is current block, skip
            if (currentBlock <= pool.lastRewardBlocks[tid]) {
                continue;
            }

            if (pool.lastRewardBlocks[tid] == 0) pool.lastRewardBlocks[tid] = currentBlock;

            uint256 blockLasted = currentBlock - pool.lastRewardBlocks[tid];
            if (blockLasted > BLOCKS_IN_2_WEEKS) blockLasted = BLOCKS_IN_2_WEEKS;

            uint256 reward = (blockLasted * rewardToken.rewardPerBlock * pool.allocPoint) /
                totalAllocPoint;

            pool.accRewardsPerShare[tid] += (reward * ACC_REWARD_PRECISION) / lpSupply;

            pool.lastRewardBlocks[tid] = currentBlock;
        }
    }

    // Deposit tokens to staking for reward token allocation.
    function deposit(uint256 _pid, uint256 _amount) external nonReentrant {
        if (_pid >= poolInfo.length) revert WrongPoolId();
        updatePool(_pid);

        uint256 length = rewardTokenInfo.length;
        for (uint256 tid; tid < length; ++tid) {
            accrueReward(tid, _pid);
        }

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

        for (uint256 tid; tid < length; ++tid) {
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
        if (_tid >= rewardTokenInfo.length) revert WrongPoolId();

        uint256 i;
        for (i; i < poolInfo.length; ++i) {
            updatePool(i);
            accrueReward(_tid, i);
            UserPoolInfo storage userPool = userPoolInfo[i][msg.sender];
            userPool.accruedRewards[_tid] = calcReward(_tid, poolInfo[i], userPool);
        }
        uint256 claimable = rewards[_tid][msg.sender] - claimedRewards[_tid][msg.sender];
        if (claimable > 0) {
            claimable = _safeRewardTransfer(rewardTokenInfo[_tid].token, msg.sender, claimable);
        }
        claimedRewards[_tid][msg.sender] += claimable;
        emit Claimed(msg.sender, _tid, claimable);
    }

    function claimAll() external nonReentrant {
        uint256 i;
        for (i; i < poolInfo.length; ++i) {
            updatePool(i);
            UserPoolInfo storage userPool = userPoolInfo[i][msg.sender];
            for (uint256 tid; tid < rewardTokenInfo.length; ++tid) {
                accrueReward(tid, i);
                userPool.accruedRewards[tid] = calcReward(tid, poolInfo[i], userPool);
            }
        }
        for (uint256 tid; tid < rewardTokenInfo.length; ++tid) {
            uint256 claimable = rewards[tid][msg.sender] - claimedRewards[tid][msg.sender];
            if (claimable > 0) {
                claimable = _safeRewardTransfer(rewardTokenInfo[tid].token, msg.sender, claimable);
            }
            claimedRewards[tid][msg.sender] += claimable;
            emit Claimed(msg.sender, tid, claimable);
        }
    }

    function accrueReward(uint256 tid, uint256 _pid) internal {
        UserPoolInfo storage userPool = userPoolInfo[_pid][msg.sender];
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
        UserPoolInfo storage userPool
    ) internal view returns (uint256) {
        return (userPool.amount * pool.accRewardsPerShare[tid]) / ACC_REWARD_PRECISION;
    }

    // Safe rewardToken transfer function.
    function _safeRewardTransfer(
        IERC20 rewardToken,
        address _to,
        uint256 _amount
    ) internal returns (uint256 transferred) {
        uint256 balance = rewardToken.balanceOf(address(this));
        transferred = _amount;
        if (transferred > balance) {
            transferred = balance;
        }
        rewardToken.safeTransfer(_to, transferred);
    }

    // Withdraw without caring about rewards. EMERGENCY ONLY.
    function withdrawEmergency(uint256 _pid) external nonReentrant {
        if (_pid >= poolInfo.length) revert WrongPoolId();

        PoolInfo storage pool = poolInfo[_pid];
        UserPoolInfo storage userPool = userPoolInfo[_pid][msg.sender];
        uint256 amountAdjusted = (userPool.amount * getPoolTokenRatio(_pid)) / 1e18;

        uint256 transferAmount = amountAdjusted;

        if (block.number - userPool.depositedBlock <= BLOCKS_IN_4_MONTHS) {
            transferAmount =
                (amountAdjusted * (PERCENT_DENOMINATOR - EXIT_PERCENT)) /
                PERCENT_DENOMINATOR;

            poolInfo[_pid].token.safeTransfer(earlyExitReceiver, amountAdjusted - transferAmount);
        }

        IERC20Supplied stakingToken = pool.stakingToken;
        if (address(stakingToken) != address(0)) {
            stakingToken.burnFrom(msg.sender, userPool.amount);
        }

        emit EmergencyWithdrawn(msg.sender, _pid, userPool.amount, amountAdjusted);
        totalAmounts[_pid] -= userPool.amount;
        userPool.amount = 0;

        uint256 length = rewardTokenInfo.length;
        for (uint256 tid; tid < length; ++tid) {
            userPool.accruedRewards[tid] = 0;
        }

        pool.token.safeTransfer(address(msg.sender), transferAmount);
    }

    // Update the given pool's reward token allocation point. Can only be called by the owner.
    function reallocatePool(
        uint256 _pid,
        uint256 _allocPoint,
        bool _withUpdate
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (_pid >= poolInfo.length) revert WrongPoolId();
        if (_allocPoint == 0) revert WrongAmount();

        if (_withUpdate) {
            updateAllPools();
        }
        totalAllocPoint = totalAllocPoint - poolInfo[_pid].allocPoint + _allocPoint;
        poolInfo[_pid].allocPoint = _allocPoint;

        emit PoolSet(address(poolInfo[_pid].token), _pid, _allocPoint);
    }

    // Withdraw tokens from rewardToken staking.
    function withdraw(uint256 _pid, uint256 _amount) external nonReentrant {
        if (userPoolInfo[_pid][msg.sender].amount < _amount) revert WrongAmount();

        updatePool(_pid);
        uint256 rewardTokenInfoLength = rewardTokenInfo.length;
        for (uint256 tid; tid < rewardTokenInfoLength; ++tid) {
            accrueReward(tid, _pid);
        }

        UserPoolInfo storage userPool = userPoolInfo[_pid][msg.sender];
        uint256 amountAdjusted = (_amount * getPoolTokenRatio(_pid)) / 1e18;
        if (_amount > 0) {
            userPool.amount -= _amount;
            totalAmounts[_pid] -= _amount;

            uint256 transferAmount = amountAdjusted;

            if (block.number - userPool.depositedBlock <= BLOCKS_IN_4_MONTHS) {
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
                IERC20(address(stakingToken)).safeTransferFrom(msg.sender, address(this), _amount);
                stakingToken.burn(_amount);
            }
        }

        for (uint256 tid; tid < rewardTokenInfoLength; ++tid) {
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

    function isRewardTokenAdded(address _token) public view returns (bool) {
        uint256 tid = rewardTokenTidByAddress[_token];
        return rewardTokenInfo.length > tid && address(rewardTokenInfo[tid].token) == _token;
    }

    function getPendingReward(
        uint256 _tid,
        uint256 _pid,
        address _user
    ) external view returns (uint256 total) {
        RewardTokenInfo memory token = rewardTokenInfo[_tid];
        PoolInfo memory pool = poolInfo[_pid];

        uint256 distributionBlock = token.distributionBlock;
        uint256 currentBlock = block.number;
        if (currentBlock > distributionBlock + BLOCKS_IN_2_WEEKS) {
            currentBlock = distributionBlock + BLOCKS_IN_2_WEEKS;
        }

        uint256 lpSupply = totalAmounts[_pid];
        if (lpSupply == 0) {
            return 0;
        }
        uint256 blockLasted = currentBlock - pool.lastRewardBlocks[_tid];
        if (pool.lastRewardBlocks[_tid] == 0) blockLasted = 0;

        uint256 reward = (blockLasted * token.rewardPerBlock * pool.allocPoint) / totalAllocPoint;
        uint256 accRewardPerShare = pool.accRewardsPerShare[_tid] +
            ((reward * ACC_REWARD_PRECISION) / lpSupply);

        UserPoolInfo storage userPool = userPoolInfo[_pid][_user];
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
