//SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import '@openzeppelin/contracts/interfaces/IERC4626.sol';
import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';

import '../ZunamiStratBase.sol';

abstract contract ERC4626StratBase is ZunamiStratBase {
    using SafeERC20 for IERC20;

    IERC4626 public immutable vault;
    IERC20 public immutable vaultAsset;

    uint256 public depositedAssets;

    constructor(
        IERC20[POOL_ASSETS] memory tokens_,
        uint256[POOL_ASSETS] memory tokenDecimalsMultipliers_,
        address vaultAddr,
        address vaultAssetAddr
    ) ZunamiStratBase(tokens_, tokenDecimalsMultipliers_) {
        if (address(vaultAddr) == address(0)) revert ZeroAddress();
        if (address(vaultAssetAddr) == address(0)) revert ZeroAddress();
        vault = IERC4626(vaultAddr);
        vaultAsset = IERC20(vaultAssetAddr);
    }

    function getLiquidityTokenPrice() internal view virtual override returns (uint256) {
        return (oracle.getUSDPrice(address(vaultAsset)) * vault.convertToAssets(1e18)) / 1e18;
    }

    function checkDepositSuccessful(
        uint256[POOL_ASSETS] memory amounts
    ) internal view override returns (bool) {
        uint256[POOL_ASSETS] memory tokenDecimals = tokenDecimalsMultipliers;

        uint256 amountsTotal;
        for (uint256 i = 0; i < POOL_ASSETS; i++) {
            amountsTotal += amounts[i] * tokenDecimals[i];
        }

        uint256 amountsMin = (amountsTotal * minDepositAmount) / DEPOSIT_DENOMINATOR;

        uint256 depositedLp = vault.convertToShares(convertVaultAssetAmounts(amounts));

        return (depositedLp * getLiquidityTokenPrice()) / PRICE_DENOMINATOR >= amountsMin;
    }

    function convertVaultAssetAmounts(
        uint256[POOL_ASSETS] memory amounts
    ) internal view virtual returns (uint256 amount);

    function depositLiquidity(
        uint256[POOL_ASSETS] memory amounts
    ) internal override returns (uint256) {
        uint256 amount = convertAndApproveTokens(address(vault), amounts);
        depositedAssets += amount;
        return vault.deposit(amount, address(this));
    }

    function convertAndApproveTokens(
        address vault,
        uint256[POOL_ASSETS] memory amounts
    ) internal virtual returns (uint256 amount);

    function calcTokenAmount(
        uint256[POOL_ASSETS] memory tokenAmounts,
        bool
    ) public view override returns (uint256 sharesAmount) {
        return vault.convertToShares(convertVaultAssetAmounts(tokenAmounts));
    }

    function removeLiquidity(
        uint256 amount,
        uint256[POOL_ASSETS] memory,
        bool
    ) internal virtual override {
        vault.redeem(amount, address(this), address(this));
    }

    function claimRewards(address receiver, IERC20[] memory) public override onlyZunamiPool {
        uint256 redeemableAssets = vault.previewRedeem(depositedLiquidity);
        if (redeemableAssets > depositedAssets) {
            uint256 withdrawAssets = redeemableAssets - depositedAssets;
            uint256 withdrawnShares = vault.withdraw(withdrawAssets, receiver, address(this));
            depositedLiquidity -= withdrawnShares;
        }
    }
}
