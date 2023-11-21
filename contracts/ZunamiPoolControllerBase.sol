//SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';
import '@openzeppelin/contracts/utils/Pausable.sol';
import '@openzeppelin/contracts/access/AccessControl.sol';
import '@openzeppelin/contracts/utils/ReentrancyGuard.sol';

import './interfaces/IPool.sol';
import './RewardTokenManager.sol';

abstract contract ZunamiPoolControllerBase is
    Pausable,
    AccessControl,
    ReentrancyGuard,
    RewardTokenManager
{
    using SafeERC20 for IERC20;

    error ZeroAddress();
    error WrongSid();

    uint8 public constant POOL_ASSETS = 5;

    uint256 public defaultDepositSid;
    uint256 public defaultWithdrawSid;

    IPool public pool;

    event SetDefaultDepositSid(uint256 sid);
    event SetDefaultWithdrawSid(uint256 sid);

    constructor(address pool_) {
        if (pool_ == address(0)) revert ZeroAddress();
        pool = IPool(pool_);

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    function setRewardTokens(IERC20[] memory rewardTokens_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _setRewardTokens(rewardTokens_);
    }

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    function setDefaultDepositSid(uint256 _newPoolId) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (_newPoolId >= pool.strategyCount()) revert WrongSid();

        defaultDepositSid = _newPoolId;
        emit SetDefaultDepositSid(_newPoolId);
    }

    function setDefaultWithdrawSid(uint256 _newPoolId) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (_newPoolId >= pool.strategyCount()) revert WrongSid();

        defaultWithdrawSid = _newPoolId;
        emit SetDefaultWithdrawSid(_newPoolId);
    }

    function claimPoolRewards(address collector) internal {
        pool.claimRewards(collector, rewardTokens);
    }

    function deposit(
        uint256[POOL_ASSETS] memory amounts,
        address receiver
    ) external whenNotPaused nonReentrant returns (uint256 shares) {
        if (receiver == address(0)) {
            receiver = _msgSender();
        }

        for (uint256 i = 0; i < amounts.length; i++) {
            if (amounts[i] > 0) {
                IERC20(pool.tokens()[i]).safeTransferFrom(_msgSender(), address(pool), amounts[i]);
            }
        }

        return depositPool(amounts, receiver);
    }

    function depositPool(
        uint256[POOL_ASSETS] memory amounts,
        address receiver
    ) internal virtual returns (uint256);

    function depositDefaultPool(
        uint256[POOL_ASSETS] memory amounts,
        address receiver
    ) internal returns (uint256) {
        return pool.deposit(defaultDepositSid, amounts, receiver);
    }

    function withdraw(
        uint256 shares,
        uint256[POOL_ASSETS] memory minTokenAmounts,
        address receiver
    ) external whenNotPaused nonReentrant {
        if (receiver == address(0)) {
            receiver = _msgSender();
        }
        withdrawPool(_msgSender(), shares, minTokenAmounts, receiver);
    }

    function withdrawDefaultPool(
        uint256 shares,
        uint256[POOL_ASSETS] memory minTokenAmounts,
        address receiver
    ) internal virtual {
        pool.withdraw(defaultWithdrawSid, shares, minTokenAmounts, receiver);
    }

    function withdrawPool(
        address user,
        uint256 shares,
        uint256[POOL_ASSETS] memory minTokenAmounts,
        address receiver
    ) internal virtual;
}
