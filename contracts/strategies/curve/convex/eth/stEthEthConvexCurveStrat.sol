//SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import '../../../../utils/Constants.sol';
import './EthConvexCurveStratBase.sol';

contract stEthEthConvexCurveStrat is EthConvexCurveStratBase {
    constructor()
        EthConvexCurveStratBase(
            [
                IERC20(Constants.WETH_ADDRESS),
                IERC20(Constants.FRX_ETH_ADDRESS),
                IERC20(address(0)),
                IERC20(address(0)),
                IERC20(address(0))
            ],
            [uint256(1), 1, 0, 0, 0],
            Constants.CRV_ETH_stETH_ADDRESS,
            Constants.CRV_ETH_stETH_LP_ADDRESS,
            Constants.CRV_BOOSTER_ADDRESS,
            Constants.CVX_ETH_stETH_REWARDS_ADDRESS,
            Constants.CVX_ETH_stETH_PID
        )
    {}
}
