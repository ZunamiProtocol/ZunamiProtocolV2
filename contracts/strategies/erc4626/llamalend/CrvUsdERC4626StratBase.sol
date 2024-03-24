//SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import '../../../utils/Constants.sol';
import "../../../interfaces/ITokenConverter.sol";
import '../ERC4626StratBase.sol';

contract CrvUsdERC4626StratBase is ERC4626StratBase {
    using SafeERC20 for IERC20;

    uint256 public constant ZUNAMI_DAI_TOKEN_ID = 0;
    uint256 public constant ZUNAMI_USDC_TOKEN_ID = 1;
    uint256 public constant ZUNAMI_USDT_TOKEN_ID = 2;

    IERC20 public constant crvUSD = IERC20(Constants.CRVUSD_ADDRESS);

    ITokenConverter public converter;

    event SetTokenConverter(address converter);

    constructor(
        IERC20[POOL_ASSETS] memory tokens_,
        uint256[POOL_ASSETS] memory tokenDecimalsMultipliers_,
        address vaultAddr,
        address vaultAssetAddr
    ) ERC4626StratBase(tokens_, tokenDecimalsMultipliers_, vaultAddr, vaultAssetAddr) {}

    function setTokenConverter(address converterAddr) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (address(converterAddr) == address(0)) revert ZeroAddress();
        converter = ITokenConverter(converterAddr);
        emit SetTokenConverter(converterAddr);
    }

    function convertVaultAssetAmounts(
        uint256[POOL_ASSETS] memory amounts
    ) internal view override returns (uint256 amount) {
        return
            converter.valuate(Constants.DAI_ADDRESS, Constants.CRVUSD_ADDRESS, amounts[ZUNAMI_DAI_TOKEN_ID]) +
            converter.valuate(Constants.USDC_ADDRESS, Constants.CRVUSD_ADDRESS, amounts[ZUNAMI_USDC_TOKEN_ID]) +
            converter.valuate(Constants.USDT_ADDRESS, Constants.CRVUSD_ADDRESS, amounts[ZUNAMI_USDT_TOKEN_ID]);
    }

    function convertAndApproveTokens(
        address vault,
        uint256[POOL_ASSETS] memory amounts
    ) internal override returns (uint256 amount) {
        for (uint256 i = 0; i < POOL_ASSETS; i++) {
            if (amounts[i] > 0) {
                tokens[i].safeTransfer(address(converter), amounts[i]);
                converter.handle(address(tokens[i]), Constants.CRVUSD_ADDRESS, amounts[i], 0);
            }
        }

        amount = crvUSD.balanceOf(address(this));
        crvUSD.safeIncreaseAllowance(address(vault), amount);
    }

    function removeLiquidity(
        uint256 amount,
        uint256[POOL_ASSETS] memory minAmounts,
        bool isHarvest
    ) internal override {
        super.removeLiquidity(amount, minAmounts, isHarvest);

        uint256 crvUSDBalance = crvUSD.balanceOf(address(this));
        crvUSD.safeTransfer(address(converter), crvUSDBalance);
        converter.handle(Constants.CRVUSD_ADDRESS, Constants.USDT_ADDRESS, crvUSDBalance, 0);
    }
}
