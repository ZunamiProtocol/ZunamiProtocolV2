//SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';

import '../../interfaces/ICurvePool2.sol';
import '../ZunamiStratBase.sol';

abstract contract CurveStratBase is ZunamiStratBase {
    using SafeERC20 for IERC20;

    ICurvePool2 public immutable pool;
    IERC20 public immutable poolToken;

    constructor(
        IERC20[POOL_ASSETS] memory tokens_,
        uint256[POOL_ASSETS] memory tokenDecimalsMultipliers_,
        address poolAddr,
        address poolTokenAddr
    ) ZunamiStratBase(tokens_, tokenDecimalsMultipliers_) {
        if (poolAddr == address(0)) revert ZeroAddress();
        pool = ICurvePool2(poolAddr);

        if (poolTokenAddr == address(0)) revert ZeroAddress();
        poolToken = IERC20(poolTokenAddr);
    }

    function convertCurvePoolTokenAmounts(
        uint256[POOL_ASSETS] memory amounts
    ) internal view virtual returns (uint256[2] memory);

    function checkDepositSuccessful(
        uint256[POOL_ASSETS] memory amounts
    ) internal view override returns (bool) {
        uint256[POOL_ASSETS] memory tokenDecimals = tokenDecimalsMultipliers;

        uint256 amountsTotal;
        for (uint256 i = 0; i < POOL_ASSETS; i++) {
            amountsTotal += amounts[i] * tokenDecimals[i];
        }

        uint256 amountsMin = (amountsTotal * minDepositAmount) / DEPOSIT_DENOMINATOR;

        uint256 depositedLp = pool.calc_token_amount(convertCurvePoolTokenAmounts(amounts), true);

        return (depositedLp * getLiquidityTokenPrice()) / PRICE_DENOMINATOR >= amountsMin;
    }

    function depositLiquidity(
        uint256[POOL_ASSETS] memory amounts
    ) internal override returns (uint256 poolTokenAmount) {
        uint256[2] memory amounts2 = convertAndApproveTokens(address(pool), amounts);
        poolTokenAmount = depositCurve(amounts2);
        depositBooster(poolTokenAmount);
    }

    function convertAndApproveTokens(
        address pool,
        uint256[POOL_ASSETS] memory amounts
    ) internal virtual returns (uint256[2] memory amounts2);

    function depositCurve(uint256[2] memory amounts2) internal virtual returns (uint256 deposited) {
        return pool.add_liquidity(amounts2, 0);
    }

    function depositBooster(uint256 amount) internal virtual;

    function getLiquidityTokenPrice() internal view virtual override returns (uint256) {
        return oracle.getUSDPrice(address(poolToken));
    }

    function calcTokenAmount(
        uint256[POOL_ASSETS] memory tokenAmounts,
        bool isDeposit
    ) public view override returns (uint256 sharesAmount) {
        return pool.calc_token_amount(convertCurvePoolTokenAmounts(tokenAmounts), isDeposit);
    }

    function getCurveRemovingTokenIndex() internal view virtual returns (int128);

    function getZunamiRemovingTokenIndex() internal view virtual returns (uint256);

    function removeLiquidity(
        uint256 amount,
        uint256[POOL_ASSETS] memory minTokenAmounts,
        bool
    ) internal virtual override {
        int128 curveTokenIndex = getCurveRemovingTokenIndex();
        uint256 removedAmount = pool.remove_liquidity_one_coin(
            amount,
            curveTokenIndex,
            minTokenAmounts[getZunamiRemovingTokenIndex()]
        );
        convertRemovedAmount(removedAmount);
    }

    function convertRemovedAmount(uint256 receivedAmount) internal virtual {}
}
