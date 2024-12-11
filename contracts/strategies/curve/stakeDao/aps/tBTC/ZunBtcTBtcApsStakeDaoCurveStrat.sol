//SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import '../../../../../utils/Constants.sol';
import './TBtcApsStakeDaoCurveStratBase.sol';

contract ZunBtcTBtcApsStakeDaoCurveStrat is TBtcApsStakeDaoCurveStratBase {
    constructor()
        TBtcApsStakeDaoCurveStratBase(
            [
                IERC20(Constants.ZUNBTC_ADDRESS),
                IERC20(address(0)),
                IERC20(address(0)),
                IERC20(address(0)),
                IERC20(address(0))
            ],
            [uint256(1), 0, 0, 0, 0],
            Constants.SDT_zunBTC_tBTC_VAULT_ADDRESS,
            Constants.CRV_zunBTC_tBTC_ADDRESS,
            Constants.CRV_zunBTC_tBTC_LP_ADDRESS,
            Constants.ZUNBTC_CONTROLLER_ADDRESS,
            Constants.ZUNBTC_ADDRESS
        )
    {}
}
