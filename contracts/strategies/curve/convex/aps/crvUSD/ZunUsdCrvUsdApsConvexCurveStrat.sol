//SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import '../../../../../utils/Constants.sol';
import './CrvUsdApsConvexCurveStratBase.sol';

contract ZunUsdCrvUsdApsConvexCurveStrat is CrvUsdApsConvexCurveStratBase {
    constructor()
        CrvUsdApsConvexCurveStratBase(
            [
                IERC20(Constants.zunUSD_ADDRESS),
                IERC20(address(0)),
                IERC20(address(0)),
                IERC20(address(0)),
                IERC20(address(0))
            ],
            [uint256(1), 0, 0, 0, 0],
            Constants.CRV_zunUSD_crvUSD_ADDRESS,
            Constants.CRV_zunUSD_crvUSD_LP_ADDRESS,
            Constants.CRV_BOOSTER_ADDRESS,
            Constants.CVX_zunUSD_crvUSD_REWARDS_ADDRESS,
            Constants.CVX_zunUSD_crvUSD_PID,
            Constants.zunUSD_CONTROLLER_ADDRESS,
            Constants.zunUSD_ADDRESS
        )
    {}
}
