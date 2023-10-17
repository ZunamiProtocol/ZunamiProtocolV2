//SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import '@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol';
import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';
import '@openzeppelin/contracts/utils/Pausable.sol';
import '@openzeppelin/contracts/access/extensions/AccessControlDefaultAdminRules.sol';

import './interfaces/IStrategy.sol';
import './interfaces/IPool.sol';
import './interfaces/IRewardManager.sol';

import './Constants.sol';

abstract contract ZunamiPoolController is Pausable, AccessControlDefaultAdminRules {
    using SafeERC20 for IERC20Metadata;

    uint8 public constant POOL_ASSETS = 5;

    uint256 public defaultDepositPid;
    uint256 public defaultWithdrawPid;

    address public rewardCollector;

    IPool public pool;
    IERC20Metadata[] public rewardTokens;

    event RewardCollectorChanged(address oldFeeCollector, address newFeeCollector);
    event SetDefaultDepositPid(uint256 pid);
    event SetDefaultWithdrawPid(uint256 pid);
    event SetRewardTokens(IERC20Metadata[] rewardTokens);

    constructor(address pool_) AccessControlDefaultAdminRules(24 hours, msg.sender) {
        require(pool_ != address(0), 'Zero pool');

        rewardCollector = msg.sender;

        pool = IPool(pool_);
    }

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    function setDefaultDepositPid(uint256 _newPoolId) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_newPoolId < pool.poolCount(), 'wrong pid');

        defaultDepositPid = _newPoolId;
        emit SetDefaultDepositPid(_newPoolId);
    }

    function setDefaultWithdrawPid(uint256 _newPoolId) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_newPoolId < pool.poolCount(), 'wrong pid');

        defaultWithdrawPid = _newPoolId;
        emit SetDefaultWithdrawPid(_newPoolId);
    }

    function setRewardTokens(
        IERC20Metadata[] memory rewardTokens_
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        rewardTokens = rewardTokens_;
        emit SetRewardTokens(rewardTokens);
    }

    function changeRewardCollector(address _rewardCollector) external onlyRole(DEFAULT_ADMIN_ROLE) {
        emit RewardCollectorChanged(rewardCollector, _rewardCollector);
        rewardCollector = _rewardCollector;
    }

    function claimRewards() external {
        pool.claimRewards(rewardCollector, rewardTokens);
    }

    function deposit(
        uint256[POOL_ASSETS] memory amounts,
        address receiver
    ) external whenNotPaused returns (uint256 shares) {
        if (receiver == address(0)) {
            receiver = _msgSender();
        }

        for (uint256 i = 0; i < amounts.length; i++) {
            if (amounts[i] > 0) {
                IERC20Metadata(pool.tokens()[i]).safeTransferFrom(
                    _msgSender(),
                    address(pool),
                    amounts[i]
                );
            }
        }

        return pool.deposit(defaultDepositPid, amounts, receiver);
    }

    function withdraw(
        uint256 shares,
        uint256[POOL_ASSETS] memory minTokenAmounts,
        address receiver
    ) external whenNotPaused {
        IERC20Metadata(address(pool)).safeTransferFrom(msg.sender, address(this), shares);
        pool.withdraw(defaultWithdrawPid, shares, minTokenAmounts, receiver);
    }
}
