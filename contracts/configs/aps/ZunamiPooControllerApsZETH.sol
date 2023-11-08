//SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import '../../ZunamiPoolCompoundController.sol';

contract ZunamiPooControllerApsZETH is ZunamiPoolCompoundController {
    constructor(
        address pool
    ) ZunamiPoolCompoundController(pool, 'Zunami ETH APS LP', 'apsUZD LP') {}
}