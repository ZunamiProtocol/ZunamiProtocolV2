// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.23;

import '../../interfaces/IOracle.sol';
import '../../libraries/ScaledMath.sol';
import '../../interfaces/ICurvePriceOracleNG.sol';

contract ZunBTCOracle is IOracle {
    using ScaledMath for uint256;

    // Tokens
    address internal constant _ZUNBTC = address(0x0FA308AE0ddE633b6eDE22ba719E7E0Bc45FC6dB);
    address internal constant _TBTC = address(0x18084fbA666a33d37592fA2633fD49a74DD93a88);

    // Curve pools
    address internal constant _ZUNBTC_TBTC = address(0x6fBc5Ddc181240Cb1d9bcEc6Fdea429036818035);

    IOracle internal immutable _genericOracle;

    constructor(address genericOracle_) {
        if (genericOracle_ == address(0)) revert ZeroAddress();
        _genericOracle = IOracle(genericOracle_);
    }

    function getUSDPrice(address token_) external view override returns (uint256) {
        if (!isTokenSupported(token_)) revert UnsupportedToken();
        return _getZunETHPriceForCurvePool(_ZUNBTC_TBTC, _TBTC);
    }

    function isTokenSupported(address token_) public pure override returns (bool) {
        return token_ == _ZUNBTC;
    }

    function _getZunETHPriceForCurvePool(
        address curvePool_,
        address token_
    ) internal view returns (uint256) {
        uint256 tokenPrice_ = _genericOracle.getUSDPrice(token_);
        uint256 zunBTCPerToken_ = ICurvePriceOracleNG(curvePool_).price_oracle(0);

        return tokenPrice_.divDown(zunBTCPerToken_);
    }
}
