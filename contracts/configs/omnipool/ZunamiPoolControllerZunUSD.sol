//SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import '../../ZunamiPoolThroughRedemptionFeeController.sol';

contract ZunamiPoolControllerZunUSD is ZunamiPoolThroughRedemptionFeeController {
    constructor(address pool) ZunamiPoolThroughRedemptionFeeController(pool) {}
}
