//SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import '../../ZunamiPool.sol';
import '../../utils/Constants.sol';

contract ZunamiPoolApsZunETH is ZunamiPool {
    constructor() ZunamiPool('Zunami ETH APS', 'apsZunETH') {
        address[POOL_ASSETS] memory tokens;
        tokens[0] = Constants.zunETH_ADDRESS;

        uint256[POOL_ASSETS] memory tokenDecimalMultipliers;
        tokenDecimalMultipliers[0] = 1;

        _setTokens(tokens, tokenDecimalMultipliers);
    }
}
