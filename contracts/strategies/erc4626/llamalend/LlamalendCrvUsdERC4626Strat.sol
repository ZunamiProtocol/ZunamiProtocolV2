//SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import '../../../utils/Constants.sol';
import './CrvUsdERC4626StratBase.sol';

contract LlamalendCrvUsdERC4626Strat is CrvUsdERC4626StratBase {
    constructor()
        CrvUsdERC4626StratBase(
            [
                IERC20(Constants.DAI_ADDRESS),
                IERC20(Constants.USDC_ADDRESS),
                IERC20(Constants.USDT_ADDRESS),
                IERC20(address(0)),
                IERC20(address(0))
            ],
            [uint256(1), 1e12, 1e12, 0, 0],
            Constants.LLAMALEND_CRVUSD_ADDRESS,
            Constants.CRVUSD_ADDRESS
        )
    {}
}
