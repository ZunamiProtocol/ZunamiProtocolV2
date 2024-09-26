//SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';

import '../../../../interfaces/ITokenConverter.sol';
import '../StakeDaoCurveStratBase.sol';

contract TokenCrvUsdStakeDaoCurveStratBase is StakeDaoCurveStratBase {
    using SafeERC20 for IERC20;

    uint256 public constant ZUNAMI_DAI_TOKEN_ID = 0;
    uint256 public constant ZUNAMI_USDC_TOKEN_ID = 1;
    uint256 public constant ZUNAMI_USDT_TOKEN_ID = 2;

    uint128 public constant CURVE_POOL_TOKEN_ID = 0;
    int128 public constant CURVE_POOL_TOKEN_ID_INT = int128(CURVE_POOL_TOKEN_ID);

    IERC20 public immutable curvePoolToken;

    ITokenConverter public converter;
    event SetTokenConverter(address tokenConverter);

    constructor(
        IERC20[POOL_ASSETS] memory _tokens,
        uint256[POOL_ASSETS] memory _tokenDecimalsMultipliers,
        address _vaultAddr,
        address _poolAddr,
        address _poolLpAddr,
        address _curvePoolTokenAddr
    )
        StakeDaoCurveStratBase(
            _tokens,
            _tokenDecimalsMultipliers,
            _vaultAddr,
            _poolAddr,
            _poolLpAddr
        )
    {
        if (_curvePoolTokenAddr == address(0)) revert ZeroAddress();
        curvePoolToken = IERC20(_curvePoolTokenAddr);
    }

    function setTokenConverter(address converterAddr) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (address(converterAddr) == address(0)) revert ZeroAddress();
        converter = ITokenConverter(converterAddr);
        emit SetTokenConverter(converterAddr);
    }

    function convertCurvePoolTokenAmounts(
        uint256[POOL_ASSETS] memory amounts
    ) internal view override returns (uint256[2] memory amounts2) {
        if (
            amounts[ZUNAMI_USDT_TOKEN_ID] == 0 &&
            amounts[ZUNAMI_USDC_TOKEN_ID] == 0 &&
            amounts[ZUNAMI_DAI_TOKEN_ID] == 0
        ) return [uint256(0), 0];

        amounts2[CURVE_POOL_TOKEN_ID] =
            valuateStable(tokens[ZUNAMI_DAI_TOKEN_ID], curvePoolToken, amounts[ZUNAMI_DAI_TOKEN_ID]) +
            valuateStable(tokens[ZUNAMI_USDC_TOKEN_ID], curvePoolToken, amounts[ZUNAMI_USDC_TOKEN_ID]) +
            valuateStable(tokens[ZUNAMI_USDT_TOKEN_ID], curvePoolToken, amounts[ZUNAMI_USDT_TOKEN_ID]);
    }

    function valuateStable(
        IERC20 fromStable,
        IERC20 toStable,
        uint256 amount
    ) internal view returns (uint256) {
        return converter.valuate(address(fromStable), address(toStable), amount);
    }

    function convertAndApproveTokens(
        address pool,
        uint256[POOL_ASSETS] memory amounts
    ) internal override returns (uint256[2] memory amounts2) {

        convertStable(tokens[ZUNAMI_DAI_TOKEN_ID], curvePoolToken, amounts[ZUNAMI_DAI_TOKEN_ID]);
        convertStable(tokens[ZUNAMI_USDC_TOKEN_ID], curvePoolToken, amounts[ZUNAMI_USDC_TOKEN_ID]);
        convertStable(tokens[ZUNAMI_USDT_TOKEN_ID], curvePoolToken, amounts[ZUNAMI_USDT_TOKEN_ID]);

        amounts2[CURVE_POOL_TOKEN_ID] = curvePoolToken.balanceOf(address(this));
        curvePoolToken.safeIncreaseAllowance(pool, amounts2[CURVE_POOL_TOKEN_ID]);
    }

    function getCurveRemovingTokenIndex() internal pure override returns (int128) {
        return CURVE_POOL_TOKEN_ID_INT;
    }

    function getZunamiRemovingTokenIndex() internal view override returns (uint256) {
        return ZUNAMI_USDT_TOKEN_ID;
    }

    function getRemovingLiquidityMinAmount(uint256[POOL_ASSETS] memory minTokenAmounts) internal view override returns (uint256) {
        return convertCurvePoolTokenAmounts(minTokenAmounts)[CURVE_POOL_TOKEN_ID];
    }

    function convertRemovedAmount(uint256 receivedAmount) internal override {
        if (receivedAmount == 0) return;

        convertStable(curvePoolToken, tokens[getZunamiRemovingTokenIndex()], receivedAmount);
    }

    function convertStable(IERC20 fromToken, IERC20 toToken, uint256 fromAmount) internal {
        if (address(fromToken) == address(toToken)) return;
        if (fromAmount == 0) return;

        fromToken.safeTransfer(address(converter), fromAmount);
        converter.handle(address(fromToken), address(toToken), fromAmount, 0);
    }
}
