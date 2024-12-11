// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.23;

import '@openzeppelin/contracts/access/Ownable2Step.sol';

import '../../../@chainlink/contracts/src/v0.8/Denominations.sol';
import '../../../@chainlink/contracts/src/v0.8/interfaces/FeedRegistryInterface.sol';

import '../../interfaces/IOracle.sol';
import '../../interfaces/vendor/ICurvePoolOraclePrice.sol';

contract ZunBTCChainlinkOracle is IOracle {
    error WrongToken();

    FeedRegistryInterface internal constant _feedRegistry =
        FeedRegistryInterface(0x47Fb2585D2C56Fe188D0E6ec628a38b74fCeeeDf);

    address internal constant ZUNBTC_ADDRESS = 0x0FA308AE0ddE633b6eDE22ba719E7E0Bc45FC6dB;

    IOracle private immutable _genericOracle;

    constructor(address genericOracle) {
        _genericOracle = IOracle(genericOracle);
    }

    function isTokenSupported(address token) public pure override returns (bool) {
        return token == ZUNBTC_ADDRESS;
    }

    function getUSDPrice(address token) external view returns (uint256) {
        if (!isTokenSupported(token)) revert WrongToken();
        return _getPrice(Denominations.BTC, Denominations.USD);
    }

    function _getPrice(
        address token,
        address denomination
    ) internal view returns (uint256) {
        try _feedRegistry.latestRoundData(token, denomination) returns (
            uint80 roundID_,
            int256 price_,
            uint256,
            uint256 timeStamp_,
            uint80 answeredInRound_
        ) {
            require(timeStamp_ != 0, 'round not complete');
            require(price_ != 0, 'negative price');
            require(answeredInRound_ >= roundID_, 'stale price');
            return _scaleFrom(uint256(price_), _feedRegistry.decimals(token, denomination));
        } catch Error(string memory reason) {
            revert(reason);
        }
    }

    function _scaleFrom(uint256 value, uint8 decimals) internal pure returns (uint256) {
        if (decimals == 18) return value;
        if (decimals > 18) return value / 10 ** (decimals - 18);
        else return value * 10 ** (18 - decimals);
    }
}
