//SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';

import './ZunamiPoolThroughController.sol';

contract ZunamiPoolThroughRedemptionFeeController is ZunamiPoolThroughController {
    using SafeERC20 for IERC20;

    error FeeWronglyHigh();

    uint256 public constant FEE_DENOMINATOR = 1000000; // 100.0000%
    uint256 public constant MAX_FEE = 50000; // 5%

    uint256 public withdrawFee;
    address public feeDistributor;

    event WithdrawFeeChanged(uint256 withdrawFee);
    event FeeDistributorChanged(address feeDistributor);

    constructor(address pool_) ZunamiPoolThroughController(pool_) {}

    function changeWithdrawFee(uint256 withdrawFee_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (withdrawFee_ > MAX_FEE) revert FeeWronglyHigh();
        withdrawFee = withdrawFee_;

        emit WithdrawFeeChanged(withdrawFee_);
    }

    function changeFeeDistributor(address feeDistributor_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (feeDistributor_ == address(0)) revert ZeroAddress();
        feeDistributor = feeDistributor_;

        emit FeeDistributorChanged(feeDistributor_);
    }

    function withdrawPool(
        address user,
        uint256 shares,
        uint256[POOL_ASSETS] memory minTokenAmounts,
        address receiver
    ) internal virtual override {
        IERC20(address(pool)).safeTransferFrom(user, address(this), shares);

        uint256 nominalFee = _calcFee(msg.sender, shares);
        if (nominalFee > 0 && feeDistributor != address(0)) {
            IERC20(address(pool)).safeTransfer(feeDistributor, nominalFee);
            shares -= nominalFee;
        }

        withdrawDefaultPool(shares, minTokenAmounts, receiver);
    }

    function _calcFee(address caller, uint256 value) internal view returns (uint256 nominalFee) {
        uint256 withdrawFee_ = withdrawFee;
        if (withdrawFee_ > 0 && !hasRole(ISSUER_ROLE, caller)) {
            nominalFee = (value * withdrawFee_) / FEE_DENOMINATOR;
        }
    }
}
