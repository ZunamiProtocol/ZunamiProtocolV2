//SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import '../../ZunamiPoolCompoundController.sol';

contract ZunamiPoolControllerApsZunUSD is ZunamiPoolCompoundController {
    constructor(
        address pool
    ) ZunamiPoolCompoundController(pool, 'Zunami USD APS LP', 'apsZunUSDLP') {}
}
