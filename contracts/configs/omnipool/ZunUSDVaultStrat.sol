// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.22;

import '../../utils/Constants.sol';
import '../../strategies/VaultStrat.sol';

contract ZunUSDVaultStrat is VaultStrat {
    constructor()
        VaultStrat(
            [
                IERC20(Constants.DAI_ADDRESS),
                IERC20(Constants.USDC_ADDRESS),
                IERC20(Constants.USDT_ADDRESS),
                IERC20(address(0)),
                IERC20(address(0))
            ],
            [uint256(1), 1e12, 1e12, 0, 0]
        )
    {}
}
