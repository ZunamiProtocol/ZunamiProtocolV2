//SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import '../CurveStratBase.sol';
import './interfaces/IStakeDaoVault.sol';

abstract contract StakeDaoCurveStratBase is CurveStratBase {
    using SafeERC20 for IERC20;

    IStakeDaoVault public immutable vault;

    constructor(
        IERC20[POOL_ASSETS] memory _tokens,
        uint256[POOL_ASSETS] memory _tokenDecimalsMultipliers,
        address _vaultAddr,
        address _poolAddr,
        address _poolTokenAddr
    ) CurveStratBase(_tokens, _tokenDecimalsMultipliers, _poolAddr, _poolTokenAddr) {
        if (_vaultAddr == address(0)) revert ZeroAddress();
        vault = IStakeDaoVault(_vaultAddr);
    }

    function depositBooster(uint256 amount) internal override {
        poolToken.safeIncreaseAllowance(address(vault), amount);
        vault.deposit(address(this), amount, true);
    }

    function removeLiquidity(
        uint256 amount,
        uint256[POOL_ASSETS] memory minTokenAmounts,
        bool removeAll
    ) internal virtual override {
        vault.withdraw(amount);
        super.removeLiquidity(amount, minTokenAmounts, removeAll);
    }

    function claimCollectedRewards() internal virtual override {
        vault.liquidityGauge().claim_rewards();
    }
}
