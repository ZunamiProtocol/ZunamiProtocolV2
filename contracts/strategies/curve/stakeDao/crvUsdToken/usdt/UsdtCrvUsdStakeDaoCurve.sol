//SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import '../../../../../utils/Constants.sol';
import '../CrvUsdStakeDaoCurveStratBase.sol';

contract UsdtCrvUsdStakeDaoCurve is CrvUsdStakeDaoCurveStratBase {
    constructor()
        CrvUsdStakeDaoCurveStratBase(
            [
                IERC20(Constants.DAI_ADDRESS),
                IERC20(Constants.USDC_ADDRESS),
                IERC20(Constants.USDT_ADDRESS),
                IERC20(address(0)),
                IERC20(address(0))
            ],
            [uint256(1), 1e12, 1e12, 0, 0],
            Constants.SDT_CRVUSD_USDT_VAULT_ADDRESS,
            Constants.CRV_CRVUSD_USDT_ADDRESS,
            Constants.CRV_CRVUSD_USDT_LP_ADDRESS,
            ZUNAMI_USDT_TOKEN_ID
        )
    {}
}
