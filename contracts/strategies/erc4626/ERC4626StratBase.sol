//SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import '@openzeppelin/contracts/interfaces/IERC4626.sol';
import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';

import '../ZunamiStratBase.sol';

abstract contract ERC4626StratBase is ZunamiStratBase {
    using SafeERC20 for IERC20;

    uint256 public constant SHARES = 1e18;

    IERC4626 public immutable vault;
    IERC20 public immutable vaultAsset;

    uint256 public depositedAssets;

    uint256 public rewardSplittingRate = 25 * 1e16; // 0.25

    error WrongRewardSplittingRatio();

    event RewardSplittingRateSet(uint256 rewardSplittingRate);

    constructor(
        IERC20[POOL_ASSETS] memory tokens_,
        uint256[POOL_ASSETS] memory tokenDecimalsMultipliers_,
        address vaultAddr_,
        address vaultAssetAddr_
    ) ZunamiStratBase(tokens_, tokenDecimalsMultipliers_) {
        if (address(vaultAddr_) == address(0)) revert ZeroAddress();
        if (address(vaultAssetAddr_) == address(0)) revert ZeroAddress();
        vault = IERC4626(vaultAddr_);
        vaultAsset = IERC20(vaultAssetAddr_);
    }

    function setRewardSplittingRate(uint256 _rewardSplittingRate) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (_rewardSplittingRate > RATIO_MULTIPLIER) revert WrongRewardSplittingRatio();
        rewardSplittingRate = _rewardSplittingRate;
        emit RewardSplittingRateSet(rewardSplittingRate);
    }

    function getLiquidityBalance() internal view override returns (uint256) {
        (uint256 rewardShares,) = calculateCollectedRewards();
        return super.getLiquidityBalance() - rewardShares;
    }

    function getLiquidityTokenPrice() internal view virtual override returns (uint256) {
        return (oracle.getUSDPrice(address(vaultAsset)) * vault.convertToAssets(SHARES)) / SHARES;
    }

    function convertVaultAssetAmounts(
        uint256[POOL_ASSETS] memory amounts
    ) internal view virtual returns (uint256 amount);

    function depositLiquidity(
        uint256[POOL_ASSETS] memory amounts
    ) internal virtual override returns (uint256) {
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
        uint256 assets = vault.redeem(amount, address(this), address(this));
        if(depositedAssets > assets) {
            depositedAssets -= assets;
        } else {
            depositedAssets = 0;
        }
    }

    function calculateCollectedRewards() internal view returns (uint256 rewardShares, uint256 splitAssets) {
        uint256 redeemableAssets = vault.previewRedeem(depositedLiquidity);
        if (redeemableAssets > depositedAssets) {
            uint256 rewardAssets = redeemableAssets - depositedAssets;
            // reduce rewards by re-peg rate

            if (rewardSplittingRate > 0) {
                splitAssets = rewardAssets * rewardSplittingRate / RATIO_MULTIPLIER;
                rewardAssets = rewardAssets - splitAssets;
            }
            if (rewardAssets > 0) {
                rewardShares = vault.convertToShares(rewardAssets);
            }
        }
    }

    function claimCollectedRewards() internal virtual override {
        (uint256 rewardShares, uint256 splitAssets) = calculateCollectedRewards();
        if (splitAssets > 0) {
            depositedAssets += splitAssets;
        }
        if (rewardShares > 0) {
            uint256[POOL_ASSETS] memory minTokenAmounts;
            removeLiquidity(rewardShares, minTokenAmounts, false);
            depositedLiquidity -= rewardShares;
        }
    }
}
