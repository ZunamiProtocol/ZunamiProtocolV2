// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.23;

import '@openzeppelin/contracts/access/Ownable2Step.sol';

import '../../interfaces/IOracle.sol';
import '../../interfaces/vendor/ICurvePoolOraclePrice.sol';

contract FrxETHOracle is IOracle, Ownable2Step {
    error WrongToken();

    address internal constant FRXETH_ADDRESS = 0x5E8422345238F34275888049021821E8E08CAa1f;
    address internal constant CURVE_ETH_FRXETH_ADDRESS = 0xa1F8A6807c402E4A15ef4EBa36528A3FED24E577;
    ICurvePoolOraclePrice internal constant CURVE_ETH_FRXETH_ORACLE =
        ICurvePoolOraclePrice(CURVE_ETH_FRXETH_ADDRESS);
    address public constant CHAINLINK_FEED_REGISTRY_ETH_ADDRESS =
        0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;

    IOracle private immutable _genericOracle;

    constructor(address genericOracle) Ownable(msg.sender) {
        _genericOracle = IOracle(genericOracle);
    }

    function isTokenSupported(address token) public pure override returns (bool) {
        return token == FRXETH_ADDRESS;
    }

    function getUSDPrice(address token) external view returns (uint256) {
        if (!isTokenSupported(token)) revert WrongToken();
        return
            (_genericOracle.getUSDPrice(CHAINLINK_FEED_REGISTRY_ETH_ADDRESS) *
                CURVE_ETH_FRXETH_ORACLE.price_oracle()) / 1e18;
    }
}
