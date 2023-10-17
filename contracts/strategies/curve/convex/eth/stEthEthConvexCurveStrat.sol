//SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import '../../../../Constants.sol';
import './EthConvexCurveStratBase.sol';

contract stEthEthConvexCurveStrat is EthConvexCurveStratBase {
    constructor(
        address _oracleAddr
    )
        EthConvexCurveStratBase(
            Constants.CRV_ETH_stETH_ADDRESS,
            Constants.CRV_ETH_stETH_LP_ADDRESS,
            _oracleAddr,
            Constants.CRV_BOOSTER_ADDRESS,
            Constants.CVX_ETH_stETH_REWARDS_ADDRESS,
            Constants.CVX_ETH_stETH_PID
        )
    {}
}
