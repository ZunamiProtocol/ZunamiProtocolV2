//SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';

import '../../../../interfaces/IStableConverter.sol';
import '../StakeDaoCurveStratBase.sol';

contract CrvUsdStakeDaoCurveStratBase is StakeDaoCurveStratBase {
    using SafeERC20 for IERC20;

    uint256 public constant ZUNAMI_DAI_TOKEN_ID = 0;
    uint256 public constant ZUNAMI_USDC_TOKEN_ID = 1;
    uint256 public constant ZUNAMI_USDT_TOKEN_ID = 2;

    uint128 public constant CURVE_POOL_TOKEN_ID = 0;
    int128 public constant CURVE_POOL_TOKEN_ID_INT = int128(CURVE_POOL_TOKEN_ID);

    uint256 public immutable zunamiTokenIndex;
    IStableConverter public stableConverter;

    event SetStableConverter(address stableConverter);

    constructor(
        IERC20[POOL_ASSETS] memory _tokens,
        uint256[POOL_ASSETS] memory _tokenDecimalsMultipliers,
        address _vaultAddr,
        address _poolAddr,
        address _poolLpAddr,
        uint256 _zunamiTokenIndex
    )
        StakeDaoCurveStratBase(
            _tokens,
            _tokenDecimalsMultipliers,
            _vaultAddr,
            _poolAddr,
            _poolLpAddr
        )
    {
        zunamiTokenIndex = _zunamiTokenIndex;
    }

    function setStableConverter(address stableConverterAddr) external onlyOwner {
        stableConverter = IStableConverter(stableConverterAddr);
        emit SetStableConverter(stableConverterAddr);
    }

    function convertCurvePoolTokenAmounts(
        uint256[5] memory amounts
    ) internal view override returns (uint256[2] memory amounts2) {
        if (
            amounts[ZUNAMI_USDT_TOKEN_ID] == 0 &&
            amounts[ZUNAMI_USDC_TOKEN_ID] == 0 &&
            amounts[ZUNAMI_DAI_TOKEN_ID] == 0
        ) return [uint256(0), 0];

        IERC20 token = tokens[zunamiTokenIndex];

        amounts2[CURVE_POOL_TOKEN_ID] =
            amounts[zunamiTokenIndex] +
            valuateStable(tokens[ZUNAMI_DAI_TOKEN_ID], token, amounts[ZUNAMI_DAI_TOKEN_ID]) +
            valuateStable(tokens[ZUNAMI_USDC_TOKEN_ID], token, amounts[ZUNAMI_USDC_TOKEN_ID]) +
            valuateStable(tokens[ZUNAMI_USDT_TOKEN_ID], token, amounts[ZUNAMI_USDT_TOKEN_ID]);
    }

    function valuateStable(
        IERC20 fromStable,
        IERC20 toStable,
        uint256 amount
    ) internal view returns (uint256) {
        if (address(fromStable) == address(toStable)) return 0;

        return stableConverter.valuate(address(fromStable), address(toStable), amount);
    }

    function convertAndApproveTokens(
        address pool,
        uint256[5] memory amounts
    ) internal override returns (uint256[2] memory amounts2) {
        IERC20 token = tokens[zunamiTokenIndex];

        convertStable(tokens[ZUNAMI_DAI_TOKEN_ID], token, amounts[ZUNAMI_DAI_TOKEN_ID]);
        convertStable(tokens[ZUNAMI_USDC_TOKEN_ID], token, amounts[ZUNAMI_USDC_TOKEN_ID]);
        convertStable(tokens[ZUNAMI_USDT_TOKEN_ID], token, amounts[ZUNAMI_USDT_TOKEN_ID]);

        amounts2[CURVE_POOL_TOKEN_ID] = token.balanceOf(address(this));
        token.safeIncreaseAllowance(address(pool), amounts2[CURVE_POOL_TOKEN_ID]);
    }

    function getCurveRemovingTokenIndex() internal pure override returns (int128) {
        return CURVE_POOL_TOKEN_ID_INT;
    }

    function convertStable(IERC20 fromToken, IERC20 toToken, uint256 fromAmount) internal {
        if (address(fromToken) == address(toToken)) return;

        fromToken.safeTransfer(address(stableConverter), fromAmount);
        stableConverter.handle(address(fromToken), address(toToken), fromAmount, 0);
    }
}
