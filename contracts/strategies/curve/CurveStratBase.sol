//SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import '@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol';
import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';

import '../../interfaces/ICurvePool2.sol';
import '../ZunamiStratBase.sol';
import { IOracle } from '../../lib/ConicOracle/interfaces/IOracle.sol';

abstract contract CurveStratBase is ZunamiStratBase {
    using SafeERC20 for IERC20Metadata;

    ICurvePool2 public immutable pool;
    IERC20Metadata public immutable poolToken;
    IOracle public immutable oracle;

    constructor(address poolAddr, address poolTokenAddr, address oracleAddr) ZunamiStratBase() {
        pool = ICurvePool2(poolAddr);
        poolToken = IERC20Metadata(poolTokenAddr);
        oracle = IOracle(oracleAddr);
    }

    function convertLiquidityTokenAmount(
        uint256[5] memory amounts
    ) internal view virtual returns (uint256[2] memory);

    function checkDepositSuccessful(
        uint256[5] memory amounts
    ) internal view override returns (bool) {
        uint256[5] memory tokenDecimals = zunamiPool.tokenDecimalsMultipliers();

        uint256 amountsTotal;
        for (uint256 i = 0; i < 5; i++) {
            amountsTotal += amounts[i] * tokenDecimals[i];
        }

        uint256 amountsMin = (amountsTotal * minDepositAmount) / DEPOSIT_DENOMINATOR;

        uint256 depositedLp = pool.calc_token_amount(convertLiquidityTokenAmount(amounts), true);

        return (depositedLp * getLiquidityTokenPrice()) / PRICE_DENOMINATOR >= amountsMin;
    }

    function depositLiquidityPool(
        uint256[5] memory amounts
    ) internal override returns (uint256 poolTokenAmount) {
        uint256[2] memory amounts2 = convertAndApproveTokens(address(pool), amounts);
        poolTokenAmount = pool.add_liquidity(amounts2, 0);

        depositLiquidity(poolTokenAmount);
    }

    function depositLiquidity(uint256 amount) internal virtual;

    function convertAndApproveTokens(
        address pool,
        uint256[5] memory amounts
    ) internal virtual returns (uint256[2] memory amounts2);

    function getLiquidityTokenPrice() internal view override returns (uint256) {
        return oracle.getUSDPrice(address(poolToken));
    }

    function calcTokenAmount(
        uint256[5] memory tokenAmounts,
        bool isDeposit
    ) external view override returns (uint256 sharesAmount) {
        return pool.calc_token_amount(convertLiquidityTokenAmount(tokenAmounts), isDeposit);
    }

    function calcLiquidityTokenAmount(
        uint256 poolTokenRation, // multiplied by 1e18
        uint256[5] memory minTokenAmounts
    ) internal view override returns (bool success, uint256 poolTokenAmount) {
        poolTokenAmount = (getLiquidityBalance() * poolTokenRation) / 1e18;
        success = poolTokenAmount >= this.calcTokenAmount(minTokenAmounts, false);
    }

    function getCurveRemovingTokenIndex() internal pure virtual returns (int128);

    function removeLiquidity(
        uint256 amount,
        uint256[5] memory minTokenAmounts
    ) internal virtual override {
        int128 curveTokenIndex = getCurveRemovingTokenIndex();
        pool.remove_liquidity_one_coin(
            amount,
            curveTokenIndex,
            convertLiquidityTokenAmount(minTokenAmounts)[uint256(int256(curveTokenIndex))]
        );
    }

    function removeAllLiquidity() internal virtual override {
        int128 curveTokenIndex = getCurveRemovingTokenIndex();
        pool.remove_liquidity_one_coin(poolToken.balanceOf(address(this)), curveTokenIndex, 0);
    }
}
