//SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import '../ZunamiPoolController.sol';

contract ZunamiPooControllerZETH is ZunamiPoolController {
    constructor(address pool) ZunamiPoolController(pool) {}
}
