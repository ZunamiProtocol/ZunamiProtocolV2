//SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import '../../../../../Constants.sol';
import '../CrvUsdStakeDaoCurveStratBase.sol';

contract UsdtCrvUsdStakeDaoCurve is CrvUsdStakeDaoCurveStratBase {
    constructor(
        address oracleAddr
    )
        CrvUsdStakeDaoCurveStratBase(
            Constants.SDT_CRVUSD_USDT_VAULT_ADDRESS,
            Constants.CRV_CRVUSD_USDT_ADDRESS,
            Constants.CRV_CRVUSD_USDT_LP_ADDRESS,
            oracleAddr,
            ZUNAMI_USDT_TOKEN_ID
        )
    {}
}
