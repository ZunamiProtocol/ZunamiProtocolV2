// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import '../../utils/Constants.sol';
import '../../strategies/VaultStrat.sol';

contract ZunETHApsVaultStrat is VaultStrat {
    constructor()
        VaultStrat(
            [
                IERC20(Constants.zunETH_ADDRESS),
                IERC20(address(0)),
                IERC20(address(0)),
                IERC20(address(0)),
                IERC20(address(0))
            ],
            [uint256(1), 0, 0, 0, 0]
        )
    {}
}
