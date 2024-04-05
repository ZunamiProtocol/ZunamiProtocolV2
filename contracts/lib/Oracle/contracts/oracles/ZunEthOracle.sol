// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.23;

import '../../interfaces/IOracle.sol';
import '../../libraries/ScaledMath.sol';

interface ICurvePriceOracleNG {
    function price_oracle(uint256 i) external view returns (uint256);
}

contract ZunEthOracle is IOracle {
    using ScaledMath for uint256;

    // Tokens
    address internal constant _ZUNETH = address(0xc2e660C62F72c2ad35AcE6DB78a616215E2F2222);
    address internal constant _FRXETH = address(0x5E8422345238F34275888049021821E8E08CAa1f);

    // Curve pools
    address internal constant _ZUNETH_FRXETH = address(0x3A65cbaebBFecbeA5D0CB523ab56fDbda7fF9aAA);

    IOracle internal immutable _genericOracle;

    constructor(address genericOracle_) {
        _genericOracle = IOracle(genericOracle_);
    }

    function getUSDPrice(address token_) external view override returns (uint256) {
        require(isTokenSupported(token_), 'token not supported');
        return _getZunUSDPriceForCurvePool(_ZUNETH_FRXETH, _FRXETH);
    }

    function isTokenSupported(address token_) public pure override returns (bool) {
        return token_ == _ZUNETH;
    }

    function _getZunUSDPriceForCurvePool(
        address curvePool_,
        address token_
    ) internal view returns (uint256) {
        uint256 tokenPrice_ = _genericOracle.getUSDPrice(token_);
        uint256 tokenPerZunETH_ = ICurvePriceOracleNG(curvePool_).price_oracle(0);

        return tokenPrice_.mulDown(tokenPerZunETH_);
    }
}
