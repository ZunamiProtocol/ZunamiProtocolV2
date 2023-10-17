//SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import '../../../../../Constants.sol';
import '../CrvUsdStakeDaoCurveStratBase.sol';

contract UsdcCrvUsdStakeDaoCurve is CrvUsdStakeDaoCurveStratBase {
    constructor(
        address oracleAddr
    )
        CrvUsdStakeDaoCurveStratBase(
            Constants.SDT_CRVUSD_USDC_VAULT_ADDRESS,
            Constants.CRV_CRVUSD_USDC_ADDRESS,
            Constants.CRV_CRVUSD_USDC_LP_ADDRESS,
            oracleAddr,
            ZUNAMI_USDC_TOKEN_ID
        )
    {}
}
