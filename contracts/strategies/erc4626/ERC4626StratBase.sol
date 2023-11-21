//SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import '@openzeppelin/contracts/interfaces/IERC4626.sol';
import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';

import '../ZunamiStratBase.sol';
import { IOracle } from '../../lib/ConicOracle/interfaces/IOracle.sol';

abstract contract ERC4626StratBase is ZunamiStratBase {
    using SafeERC20 for IERC20;

    IERC4626 public immutable vault;
    IERC20 public immutable vaultAsset;

    constructor(
        IERC20[POOL_ASSETS] memory tokens_,
        uint256[POOL_ASSETS] memory tokenDecimalsMultipliers_,
        address vaultAddr,
        address vaultAssetAddr
    ) ZunamiStratBase(tokens_, tokenDecimalsMultipliers_) {
        vault = IERC4626(vaultAddr);
        vaultAsset = IERC20(vaultAssetAddr);
    }

    function getLiquidityTokenPrice() internal view virtual override returns (uint256) {
        return (oracle.getUSDPrice(address(vaultAsset)) * vault.convertToAssets(1e18)) / 1e18;
    }

    function getLiquidityBalance() internal view virtual override returns (uint256) {
        return vault.balanceOf(address(this));
    }

    function checkDepositSuccessful(
        uint256[POOL_ASSETS] memory amounts
    ) internal view override returns (bool) {
        uint256[POOL_ASSETS] memory tokenDecimals = tokenDecimalsMultipliers;

        uint256 amountsTotal;
        for (uint256 i = 0; i < 5; i++) {
            amountsTotal += amounts[i] * tokenDecimals[i];
        }

        uint256 amountsMin = (amountsTotal * minDepositAmount) / DEPOSIT_DENOMINATOR;

        uint256 depositedLp = vault.convertToShares(convertVaultAssetAmounts(amounts));

        return (depositedLp * getLiquidityTokenPrice()) / PRICE_DENOMINATOR >= amountsMin;
    }

    function convertVaultAssetAmounts(
        uint256[5] memory amounts
    ) internal view virtual returns (uint256 amount);

    function depositLiquidity(
        uint256[POOL_ASSETS] memory amounts
    ) internal override returns (uint256 poolTokenAmount) {
        uint256 amount = convertAndApproveTokens(address(vault), amounts);
        poolTokenAmount = vault.deposit(amount, address(this));
    }

    function convertAndApproveTokens(
        address vault,
        uint256[POOL_ASSETS] memory amounts
    ) internal virtual returns (uint256 amount);

    function calcTokenAmount(
        uint256[POOL_ASSETS] memory tokenAmounts,
        bool
    ) public view override returns (uint256 sharesAmount) {
        return vault.convertToAssets(convertVaultAssetAmounts(tokenAmounts));
    }

    function calcRemovingLiquidityAmount(
        uint256 poolTokenRatio, // multiplied by 1e18
        uint256[POOL_ASSETS] memory minTokenAmounts
    ) internal view override returns (bool success, uint256 removingLPTokenAmount) {
        removingLPTokenAmount = (getLiquidityBalance() * poolTokenRatio) / RATIO_MULTIPLIER;
        success = removingLPTokenAmount >= calcTokenAmount(minTokenAmounts, false);
    }

    function removeLiquidity(
        uint256 amount,
        uint256[POOL_ASSETS] memory
    ) internal virtual override {
        vault.redeem(amount, address(this), address(this));
    }

    function removeAllLiquidity() internal virtual override {
        vault.redeem(vault.balanceOf(address(this)), address(this), address(this));
    }

    function claimCollectedRewards() internal override {
        // TODO: decide how take rebased yield
        // 1/ track deposited amount
        // 2/ on withdraw - compare with deposited and remove rebased part
    }
}
