//SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import '../../../../../utils/Constants.sol';
import './FrxEthApsConvexCurveStratBase.sol';

contract ZunEthFrxEthApsConvexCurveStratBase is FrxEthApsConvexCurveStratBase {
    constructor()
        FrxEthApsConvexCurveStratBase(
            [
                IERC20(Constants.zunETH_ADDRESS),
                IERC20(address(0)),
                IERC20(address(0)),
                IERC20(address(0)),
                IERC20(address(0))
            ],
            [uint256(1), 0, 0, 0, 0],
            Constants.CRV_zunETH_frxETH_ADDRESS,
            Constants.CRV_zunETH_frxETH_LP_ADDRESS,
            Constants.CRV_BOOSTER_ADDRESS,
            Constants.CVX_zunETH_frxETH_REWARDS_ADDRESS,
            Constants.CVX_zunETH_frxETH_PID,
            Constants.zunETH_CONTROLLER_ADDRESS,
            Constants.zunETH_ADDRESS
        )
    {}
}
