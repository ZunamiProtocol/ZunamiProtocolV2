//SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import '../../ZunamiPoolCompoundController.sol';

contract ZunamiPoolControllerApsZunETH is ZunamiPoolCompoundController {
    constructor(
        address pool
    ) ZunamiPoolCompoundController(pool, 'Zunami ETH APS LP', 'lpApsZunETH') {}
}
