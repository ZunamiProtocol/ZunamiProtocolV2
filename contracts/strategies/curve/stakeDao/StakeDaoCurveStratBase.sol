//SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../CurveStratBase.sol";
import "./interfaces/IStakeDaoVault.sol";

abstract contract StakeDaoCurveStratBase is CurveStratBase {
    using SafeERC20 for IERC20Metadata;

    IStakeDaoVault public immutable vault;

    constructor(
        address _vaultAddr,
        address _poolAddr,
        address _poolTokenAddr,
        address _oracleAddr
    ) CurveStratBase(_poolAddr, _poolTokenAddr, _oracleAddr) {
        vault = IStakeDaoVault(_vaultAddr);
    }

    function depositLiquidity(uint256 amount) internal override {
        poolToken.safeIncreaseAllowance(address(vault), amount);
        vault.deposit(address(this), amount, true);
    }

    function removeLiquidity(uint256 amount, uint256[5] memory minTokenAmounts) internal override virtual {
        vault.withdraw(amount);
        super.removeLiquidity(amount, minTokenAmounts);
    }

    function removeAllLiquidity() internal override {
        vault.withdraw(vault.liquidityGauge().balanceOf(address(this)));
        super.removeAllLiquidity();
    }

    function claimCollectedRewards() internal override virtual {
        vault.liquidityGauge().claim_rewards();
    }

    function getLiquidityBalance() internal view override virtual returns(uint256) {
        return vault.liquidityGauge().balanceOf(address(this));
    }
}
