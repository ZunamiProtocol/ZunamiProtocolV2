//SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';
import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol';
import '@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20PermitUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20VotesUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol';
import '@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol';

import { IDistributor } from './IDistributor.sol';

//import 'hardhat/console.sol';

abstract contract BaseStakingRewardDistributor is
    IDistributor,
    Initializable,
    ERC20Upgradeable,
    ERC20PermitUpgradeable,
    ERC20VotesUpgradeable,
    AccessControlUpgradeable,
    UUPSUpgradeable,
    ReentrancyGuardUpgradeable
{
    using SafeERC20 for IERC20;

    error TokenAlreadyAdded();
    error ZeroAddress();
    error ZeroAmount();
    error WrongAmount();
    error ZeroSupply();
    error AbsentRewardToken();

    // Create a new role identifier for the distributor role
    bytes32 public constant DISTRIBUTOR_ROLE = keccak256('DISTRIBUTOR_ROLE');

    struct RewardTokenInfo {
        IERC20 token;
        uint256 balance;
        uint256 distribution;
    }

    IERC20 public token; // Address of token contract.

    // The reward token token infos
    RewardTokenInfo[] public rewardTokenInfo;
    mapping(address => uint256) public rewardTokenTidByAddress;

    // Accumulated rewards
    // tid => user => claimable balance
    mapping(uint256 => mapping(address => uint256)) public claimableRewards;

    // Claimed rewards
    // tid => user => claimed balance
    mapping(uint256 => mapping(address => uint256)) public claimedRewards;

    // claimant -> default reward receiver
    mapping(address => address) public rewardsReceiver;

    // Info of each user that stakes tokens.
    mapping(address => mapping(uint256 => uint256)) public userRewardDistribution;

    uint256 public totalAmount;

    event RewardTokenAdded(address indexed token, uint256 indexed tid);
    event RewardsReceiverSet(address indexed claimant, address indexed receiver);
    event Claimed(address indexed user, uint256 indexed tid, uint256 amount);
    event DistributionUpdated(uint256 indexed tid, uint256 distribution);
    event UserDistributionUpdated(uint256 indexed tid, address indexed user, uint256 distribution);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        address _token,
        string memory _name,
        string memory _symbol,
        address _defaultAdmin
    ) public initializer {
        if (_token == address(0)) revert ZeroAddress();
        if (_defaultAdmin == address(0)) revert ZeroAddress();

        __ERC20_init(_name, _symbol);
        __ERC20Permit_init(_name);
        __ERC20Votes_init();
        __AccessControl_init();
        __UUPSUpgradeable_init();
        __ReentrancyGuard_init();

        _grantRole(DEFAULT_ADMIN_ROLE, _defaultAdmin);

        token = IERC20(_token);

        initializeExtension();
    }

    function initializeExtension() internal virtual {}

    function _authorizeUpgrade(address) internal override onlyRole(DEFAULT_ADMIN_ROLE) {}

    function version() public pure returns (uint256) {
        return 1;
    }

    function addRewardToken(IERC20 _token) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (address(_token) == address(0)) revert ZeroAddress();
        if (isRewardTokenAdded(address(_token))) revert TokenAlreadyAdded();

        uint256 tid = rewardTokenInfo.length;
        rewardTokenInfo.push(RewardTokenInfo({ token: _token, balance: 0, distribution: 0 }));
        rewardTokenTidByAddress[address(_token)] = tid;

        emit RewardTokenAdded(address(_token), tid);
    }

    function setRewardsReceiver(address _receiver) external {
        rewardsReceiver[msg.sender] = _receiver;
        emit RewardsReceiverSet(msg.sender, _receiver);
    }

    function _checkpointRewards(
        address _user,
        uint256 _totalSupply,
        bool _claim,
        address _receiver
    ) internal {
        address receiver = _receiver;
        if (_claim && receiver == address(0)) {
            // if receiver is not explicitly declared, check for default reward receiver
            receiver = rewardsReceiver[_user];
            if (receiver == address(0)) {
                // direct claims to user if no default receiver is set
                receiver = _user;
            }
        }

        // calculate new user reward distribution and transfer any owed rewards
        uint256 userBalance = balanceOf(_user);
        uint256 length = rewardTokenInfo.length;
        for (uint256 i = 0; i < length; i++) {
            _checkpointReward(i, _user, receiver, userBalance, _totalSupply, _claim);
        }
    }

    function _reduceByStakedAmount(
        uint256 _tokenBalance
    ) internal view virtual returns (uint256 reducedTokenBalance) {
        reducedTokenBalance = _tokenBalance - totalAmount;
    }

    function _checkpointReward(
        uint256 _tid,
        address _user,
        address _receiver,
        uint256 _userBalance,
        uint256 _totalSupply,
        bool _claim
    ) internal {
        uint256 distribution = _updateDistribution(_tid, _totalSupply);

        uint256 userDistribution = userRewardDistribution[_user][_tid];
        uint256 newClaimable = 0;
        if (userDistribution < distribution) {
            userRewardDistribution[_user][_tid] = distribution;
            emit UserDistributionUpdated(_tid, _user, distribution);
            newClaimable = (_userBalance * (distribution - userDistribution)) / 1e18;
        }

        uint256 totalClaimable = claimableRewards[_tid][_user] + newClaimable;
        if (totalClaimable > 0) {
            if (_claim) {
                _safeRewardTransfer(rewardTokenInfo[_tid].token, _receiver, totalClaimable);
                rewardTokenInfo[_tid].balance -= totalClaimable;
                // update amount claimed
                claimedRewards[_tid][_user] += totalClaimable;
                claimableRewards[_tid][_user] = 0;
                emit Claimed(_receiver, _tid, totalClaimable);
            } else if (newClaimable > 0) {
                // update total_claimable
                claimableRewards[_tid][_user] = totalClaimable;
            }
        }
    }

    function _updateDistribution(
        uint256 _tid,
        uint256 _totalSupply
    ) internal returns (uint256 distribution) {
        RewardTokenInfo storage rewardInfo = rewardTokenInfo[_tid];
        address token_ = address(rewardInfo.token);
        uint256 dI = 0;
        if (_totalSupply != 0) {
            uint256 tokenBalance = IERC20(token_).balanceOf(address(this));
            if (token_ == address(token)) {
                tokenBalance = _reduceByStakedAmount(tokenBalance);
            }
            dI = (1e18 * (tokenBalance - rewardInfo.balance)) / _totalSupply;
            rewardInfo.balance = tokenBalance;
        }

        distribution = rewardInfo.distribution + dI;
        if (dI != 0) {
            rewardInfo.distribution = distribution;
            emit DistributionUpdated(_tid, distribution);
        }
    }

    // Distribute rewards
    function distribute(address _token, uint256 _amount) external onlyRole(DISTRIBUTOR_ROLE) {
        if (totalAmount == 0) revert ZeroSupply();
        if (_amount == 0) revert ZeroAmount();
        if (_token == address(0)) revert ZeroAddress();
        if (!isRewardTokenAdded(_token)) revert AbsentRewardToken();
        uint256 tid = rewardTokenTidByAddress[_token];

        rewardTokenInfo[tid].token.safeTransferFrom(msg.sender, address(this), _amount);
        _updateDistribution(tid, totalSupply());
    }

    // claim rewards
    function claim(address _receiver) external nonReentrant {
        _checkpointRewards(msg.sender, totalSupply(), true, _receiver);
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

    // Number of reward tokens.
    function rewardTokenCount() external view returns (uint256) {
        return rewardTokenInfo.length;
    }

    function isRewardTokenAdded(address _token) public view returns (bool) {
        uint256 tid = rewardTokenTidByAddress[_token];
        return rewardTokenInfo.length > tid && address(rewardTokenInfo[tid].token) == _token;
    }

    function getPendingReward(uint256 _tid, address _user) external view returns (uint256) {
        uint256 newClaimable = 0;
        if (userRewardDistribution[_user][_tid] < rewardTokenInfo[_tid].distribution) {
            newClaimable =
                (balanceOf(_user) *
                    (rewardTokenInfo[_tid].distribution - userRewardDistribution[_user][_tid])) /
                1e18;
        }

        return claimableRewards[_tid][_user] + newClaimable;
    }

    /**
     * @dev Allows the owner to withdraw stuck tokens from the contract.
     * @param _token The IERC20 token to withdraw from.
     * @param _amount The amount of tokens to withdraw. Use type(uint256).max to withdraw all tokens.
     * @notice Only the account with the DEFAULT_ADMIN_ROLE can withdraw tokens.
     * @notice If _amount is set to type(uint256).max, it withdraws all tokens held by the contract.
     */
    function withdrawStuckToken(
        IERC20 _token,
        uint256 _amount
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        uint256 withdrawAmount = _amount == type(uint256).max
            ? _token.balanceOf(address(this))
            : _amount;
        if (withdrawAmount > 0) {
            _token.safeTransfer(_msgSender(), withdrawAmount);
        }
    }

    // ERC20 overrides
    function transfer(
        address recipient,
        uint256 amount
    ) public override nonReentrant returns (bool) {
        return super.transfer(recipient, amount);
    }

    function transferFrom(
        address sender,
        address recipient,
        uint256 amount
    ) public override nonReentrant returns (bool) {
        return super.transferFrom(sender, recipient, amount);
    }

    function _update(
        address from,
        address to,
        uint256 value
    ) internal override(ERC20Upgradeable, ERC20VotesUpgradeable) {
        if (value > 0) {
            uint256 totalSupply = totalSupply();
            _checkpointRewards(from, totalSupply, false, address(0));
            _checkpointRewards(to, totalSupply, false, address(0));
        }
        super._update(from, to, value);
    }

    function nonces(
        address owner
    ) public view override(ERC20PermitUpgradeable, NoncesUpgradeable) returns (uint256) {
        return super.nonces(owner);
    }
}
