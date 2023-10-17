//SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import '@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol';
import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';

import '../../../../interfaces/IStableConverter.sol';
import '../StakeDaoCurveStratBase.sol';

contract CrvUsdStakeDaoCurveStratBase is StakeDaoCurveStratBase {
    using SafeERC20 for IERC20Metadata;

    uint256 public constant ZUNAMI_DAI_TOKEN_ID = 0;
    uint256 public constant ZUNAMI_USDC_TOKEN_ID = 1;
    uint256 public constant ZUNAMI_USDT_TOKEN_ID = 2;

    uint128 public constant CURVE_POOL_TOKEN_ID = 0;
    int128 public constant CURVE_POOL_TOKEN_ID_INT = int128(CURVE_POOL_TOKEN_ID);

    uint256 public immutable zunamiTokenIndex;
    IStableConverter public stableConverter;

    event SetStableConverter(address stableConverter);

    constructor(
        address _vaultAddr,
        address _poolAddr,
        address _poolLpAddr,
        address _oracleAddr,
        uint256 _zunamiTokenIndex
    ) StakeDaoCurveStratBase(_vaultAddr, _poolAddr, _poolLpAddr, _oracleAddr) {
        zunamiTokenIndex = _zunamiTokenIndex;
    }

    function setStableConverter(address stableConverterAddr) external onlyOwner {
        stableConverter = IStableConverter(stableConverterAddr);
        emit SetStableConverter(stableConverterAddr);
    }

    function convertLiquidityTokenAmount(
        uint256[5] memory amounts
    ) internal view override returns (uint256[2] memory amounts2) {
        if (
            amounts[ZUNAMI_USDT_TOKEN_ID] == 0 &&
            amounts[ZUNAMI_USDC_TOKEN_ID] == 0 &&
            amounts[ZUNAMI_DAI_TOKEN_ID] == 0
        ) return [uint256(0), 0];

        amounts2[CURVE_POOL_TOKEN_ID] =
            amounts[zunamiTokenIndex] +
            valuateStable(ZUNAMI_DAI_TOKEN_ID, zunamiTokenIndex, amounts[ZUNAMI_DAI_TOKEN_ID]) +
            valuateStable(ZUNAMI_USDC_TOKEN_ID, zunamiTokenIndex, amounts[ZUNAMI_USDC_TOKEN_ID]) +
            valuateStable(ZUNAMI_USDT_TOKEN_ID, zunamiTokenIndex, amounts[ZUNAMI_USDT_TOKEN_ID]);
    }

    function valuateStable(
        uint256 fromZunamiIndex,
        uint256 toZunamiIndex,
        uint256 amount
    ) internal view returns (uint256) {
        if (fromZunamiIndex == toZunamiIndex) return 0;

        IERC20Metadata[5] memory zunamiTokens = zunamiPool.tokens();

        return
            stableConverter.valuate(
                address(zunamiTokens[fromZunamiIndex]),
                address(zunamiTokens[toZunamiIndex]),
                amount
            );
    }

    function convertAndApproveTokens(
        address pool,
        uint256[5] memory amounts
    ) internal override returns (uint256[2] memory amounts2) {
        IERC20Metadata token = zunamiPool.tokens()[zunamiTokenIndex];

        convertStable(ZUNAMI_DAI_TOKEN_ID, zunamiTokenIndex, amounts[ZUNAMI_DAI_TOKEN_ID]);
        convertStable(ZUNAMI_USDC_TOKEN_ID, zunamiTokenIndex, amounts[ZUNAMI_USDC_TOKEN_ID]);
        convertStable(ZUNAMI_USDT_TOKEN_ID, zunamiTokenIndex, amounts[ZUNAMI_USDT_TOKEN_ID]);

        amounts2[CURVE_POOL_TOKEN_ID] = token.balanceOf(address(this));
        token.safeIncreaseAllowance(address(pool), amounts2[CURVE_POOL_TOKEN_ID]);
    }

    function getCurveRemovingTokenIndex() internal pure override returns (int128) {
        return CURVE_POOL_TOKEN_ID_INT;
    }

    function convertStable(
        uint256 fromZunamiIndex,
        uint256 toZunamiIndex,
        uint256 fromAmount
    ) internal {
        if (fromZunamiIndex == toZunamiIndex) return;

        IERC20Metadata fromToken = zunamiPool.tokens()[fromZunamiIndex];
        fromToken.safeTransfer(address(stableConverter), fromAmount);

        stableConverter.handle(
            address(fromToken),
            address(zunamiPool.tokens()[toZunamiIndex]),
            fromAmount,
            0
        );
    }
}
