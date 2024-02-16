// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import '../../utils/Constants.sol';
import '../../strategies/VaultStrat.sol';

contract ZunETHVaultStrat is VaultStrat {
    constructor()
        VaultStrat(
            [
                IERC20(Constants.WETH_ADDRESS),
                IERC20(Constants.FRX_ETH_ADDRESS),
                IERC20(address(0)),
                IERC20(address(0)),
                IERC20(address(0))
            ],
            [uint256(1), 1, 0, 0, 0]
        )
    {}
}
