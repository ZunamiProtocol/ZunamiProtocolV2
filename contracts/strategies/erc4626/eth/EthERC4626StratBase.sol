//SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import '@openzeppelin/contracts/interfaces/IERC4626.sol';
import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';

import '../../../utils/Constants.sol';
import '../../../interfaces/INativeConverter.sol';
import '../ERC4626StratBase.sol';

contract EthERC4626StratBase is ERC4626StratBase {
    using SafeERC20 for IERC20;

    uint256 public constant ZUNAMI_WETH_TOKEN_ID = 0;
    uint256 public constant ZUNAMI_FRXETH_TOKEN_ID = 1;

    INativeConverter public immutable nativeConverter;

    constructor(
        IERC20[POOL_ASSETS] memory tokens_,
        uint256[POOL_ASSETS] memory tokenDecimalsMultipliers_,
        address vaultAddr,
        address vaultAssetAddr,
        address oracleAddr,
        address nativeConverterAddr
    ) ERC4626StratBase(tokens_, tokenDecimalsMultipliers_, vaultAddr, vaultAssetAddr, oracleAddr) {
        nativeConverter = INativeConverter(nativeConverterAddr);
    }

    function getLiquidityTokenPrice() internal view override returns (uint256) {
        return
            (oracle.getUSDPrice(address(vaultAsset)) * 1e18) /
            oracle.getUSDPrice(Constants.WETH_ADDRESS);
    }

    function convertVaultAssetAmounts(
        uint256[5] memory amounts
    ) internal view override returns (uint256 amount) {
        return
            amounts[ZUNAMI_FRXETH_TOKEN_ID] +
            nativeConverter.valuate(true, amounts[ZUNAMI_WETH_TOKEN_ID]);
    }

    function convertAndApproveTokens(
        address vault,
        uint256[POOL_ASSETS] memory amounts
    ) internal override returns (uint256 amount) {
        amount = amounts[ZUNAMI_FRXETH_TOKEN_ID];
        uint256 wethBalance = amounts[ZUNAMI_WETH_TOKEN_ID];
        if (wethBalance > 0) {
            amount += nativeConverter.handle(true, wethBalance, 0);
        }

        tokens[ZUNAMI_FRXETH_TOKEN_ID].safeIncreaseAllowance(address(vault), amount);
    }
}