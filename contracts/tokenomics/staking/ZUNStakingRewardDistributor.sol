//SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';
import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol';

import './BaseStakingRewardDistributor.sol';
import './IZUNStakingRewardDistributor.sol';

contract ZUNStakingRewardDistributor is IZUNStakingRewardDistributor, BaseStakingRewardDistributor {
    using SafeERC20 for IERC20;

    error LockDoesNotExist();
    error Unlocked();

    bytes32 public constant RECAPITALIZATION_ROLE = keccak256('RECAPITALIZATION_ROLE');

    uint16 public constant EXIT_PERCENT = 150; // 15%
    uint16 public constant PERCENT_DENOMINATOR = 1e3;

    uint256 public constant RATION_DENOMINATOR = 1e18;

    uint32 public constant BLOCKS_IN_4_MONTHS = (4 * 30 * 24 * 60 * 60) / 12;

    struct LockInfo {
        uint128 amount;
        uint128 untilBlock;
    }

    mapping(address => LockInfo[]) public userLocks;

    uint256 public recapitalizedAmount;

    address public earlyExitReceiver;

    event Deposited(address indexed user, uint256 lockIndex, uint256 amount, uint256 untilBlock);
    event Withdrawn(
        address indexed user,
        uint256 lockIndex,
        uint256 amount,
        uint256 amountReduced,
        uint256 transferedAmount
    );
    event EarlyExitReceiverChanged(address receiver);
    event WithdrawnToken(uint256 amount);
    event ReturnedToken(uint256 amount);

    function initializeExtension() internal override {
        setEarlyExitReceiver(msg.sender);
    }

    function setEarlyExitReceiver(address _receiver) public onlyRole(DEFAULT_ADMIN_ROLE) {
        if (_receiver == address(0)) revert ZeroAddress();
        earlyExitReceiver = _receiver;
        emit EarlyExitReceiverChanged(_receiver);
    }

    function getRecapitalizationRatio() public view returns (uint256) {
        if (recapitalizedAmount == 0) {
            return RATION_DENOMINATOR;
        }
        return ((totalAmount - recapitalizedAmount) * RATION_DENOMINATOR) / totalAmount;
    }

    function _reduceByStakedAmount(
        uint256 _tokenBalance
    ) internal view override returns (uint256 reducedTokenBalance) {
        reducedTokenBalance = _tokenBalance + recapitalizedAmount - totalAmount;
    }

    function withdrawToken(uint256 amount) external onlyRole(RECAPITALIZATION_ROLE) {
        if (amount == 0) revert ZeroAmount();

        if (amount >= totalAmount - recapitalizedAmount) revert WrongAmount();
        recapitalizedAmount += amount;
        token.safeTransfer(msg.sender, amount);

        emit WithdrawnToken(amount);
    }

    function returnToken(uint256 amount) external onlyRole(RECAPITALIZATION_ROLE) {
        if (amount == 0) revert ZeroAmount();

        if (amount > recapitalizedAmount) revert WrongAmount();
        recapitalizedAmount -= amount;
        token.safeTransferFrom(msg.sender, address(this), amount);

        emit ReturnedToken(amount);
    }

    // Deposit tokens to staking for reward token allocation.
    function deposit(uint256 _amount, address _receiver) external nonReentrant {
        _deposit(_amount, _receiver);
    }

    function depositWithPermit(
        uint256 _amount,
        address _receiver,
        uint256 _deadline,
        uint8 _v,
        bytes32 _r,
        bytes32 _s
    ) external nonReentrant {
        IERC20Permit tokenPermit = IERC20Permit(address(token));
        // the use of `try/catch` allows the permit to fail and makes the code tolerant to frontrunning.
        try
            tokenPermit.permit(msg.sender, address(this), _amount, _deadline, _v, _r, _s)
        {} catch {}
        _deposit(_amount, _receiver);
    }

    function _deposit(uint256 _amount, address _receiver) internal {
        if (_amount == 0) revert ZeroAmount();

        if (_receiver == address(0)) {
            _receiver = msg.sender;
        }

        _checkpointRewards(_receiver, totalSupply(), false, address(0));

        token.safeTransferFrom(address(msg.sender), address(this), _amount);

        uint256 ratio = getRecapitalizationRatio();
        if (ratio < RATION_DENOMINATOR) {
            uint256 amountReduced = (_amount * ratio) / RATION_DENOMINATOR;
            recapitalizedAmount += _amount - amountReduced;
        }
        totalAmount += _amount;

        _mint(_receiver, _amount);

        uint128 untilBlock = uint128(block.number + BLOCKS_IN_4_MONTHS);
        uint256 lockIndex = userLocks[_receiver].length;
        userLocks[_receiver].push(LockInfo(uint128(_amount), untilBlock));
        emit Deposited(_receiver, lockIndex, _amount, untilBlock);
    }

    // Withdraw tokens from rewardToken staking.
    function withdraw(
        uint256 _lockIndex,
        bool _claimRewards,
        address _tokenReceiver
    ) external nonReentrant {
        LockInfo[] storage locks = userLocks[msg.sender];
        if (locks.length <= _lockIndex) revert LockDoesNotExist();

        LockInfo storage lock = locks[_lockIndex];
        uint256 untilBlock = lock.untilBlock;
        if (untilBlock == 0) revert Unlocked();
        uint256 amount = lock.amount;

        if (_tokenReceiver == address(0)) {
            _tokenReceiver = msg.sender;
        }

        _checkpointRewards(msg.sender, totalSupply(), _claimRewards, address(0));

        uint256 ratio = getRecapitalizationRatio();
        _burn(msg.sender, amount);
        totalAmount -= amount;

        uint256 amountReduced = amount;
        if (ratio < RATION_DENOMINATOR) {
            amountReduced = (amount * ratio) / RATION_DENOMINATOR;
            if (amount - amountReduced > recapitalizedAmount) {
                recapitalizedAmount = 0;
            } else {
                recapitalizedAmount -= (amount - amountReduced);
            }
        }

        // Set untilBlock to 0 to mark the lock as withdrawn.
        lock.untilBlock = 0;

        uint256 transferredAmount = amountReduced;
        if (block.number < untilBlock) {
            transferredAmount =
                (amountReduced * (PERCENT_DENOMINATOR - EXIT_PERCENT)) /
                PERCENT_DENOMINATOR;

            token.safeTransfer(earlyExitReceiver, amountReduced - transferredAmount);
        }
        token.safeTransfer(address(_tokenReceiver), transferredAmount);

        emit Withdrawn(msg.sender, _lockIndex, amount, amountReduced, transferredAmount);
    }
}
