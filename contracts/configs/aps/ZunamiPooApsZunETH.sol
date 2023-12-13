//SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import '../../ZunamiPool.sol';
import '../../utils/Constants.sol';

contract ZunamiPoolApsZunETH is ZunamiPool {
    constructor() ZunamiPool('Zunami ETH APS', 'apsZunETH') {
        address[] memory tokens = new address[](1);
        tokens[0] = Constants.zunETH_ADDRESS;

        uint256[] memory tokenDecimalMultipliers = new uint256[](1);
        tokenDecimalMultipliers[0] = 1;

        _setTokens(tokens, tokenDecimalMultipliers);
    }
}
