//SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import '../../ZunamiPool.sol';
import '../../utils/Constants.sol';

contract ZunamiPoolApsZunUSD is ZunamiPool {
    constructor() ZunamiPool('Zunami USD APS', 'apsZunUSD') {
        address[POOL_ASSETS] memory tokens;
        tokens[0] = Constants.zunUSD_ADDRESS;

        uint256[POOL_ASSETS] memory tokenDecimalMultipliers;
        tokenDecimalMultipliers[0] = 1;

        _setTokens(tokens, tokenDecimalMultipliers);
    }
}
