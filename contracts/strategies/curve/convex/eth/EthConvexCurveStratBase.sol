//SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import '../ConvexCurveStratBase.sol';

contract EthConvexCurveStratBase is ConvexCurveStratBase {
    uint256 public constant ZUNAMI_WETH_TOKEN_ID = 0;
    uint256 public constant ZUNAMI_FRXETH_TOKEN_ID = 1;

    uint128 public constant CURVE_POOL_TOKEN_ID = 1;
    int128 public constant CURVE_POOL_TOKEN_ID_INT = int128(CURVE_POOL_TOKEN_ID);

    constructor(
        address _poolAddr,
        address _poolLpAddr,
        address _oracleAddr,
        address _cvxBooster,
        address _cvxRewardsAddr,
        uint256 _cvxPID
    )
        ConvexCurveStratBase(
            _poolAddr,
            _poolLpAddr,
            _oracleAddr,
            _cvxBooster,
            _cvxRewardsAddr,
            _cvxPID
        )
    {}

    function convertLiquidityTokenAmount(
        uint256[5] memory amounts
    ) internal view override returns (uint256[2] memory amounts2) {}

    function convertAndApproveTokens(
        address pool,
        uint256[5] memory amounts
    ) internal override returns (uint256[2] memory amounts2) {}

    function getCurveRemovingTokenIndex() internal pure override returns (int128) {
        return CURVE_POOL_TOKEN_ID_INT;
    }
}
