//SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import '../../ZunamiPool.sol';
import '../../utils/Constants.sol';

contract ZunamiPoolZunETH is ZunamiPool {
    uint256 public constant ZUNAMI_WETH_TOKEN_ID = 0;
    uint256 public constant ZUNAMI_FRXETH_TOKEN_ID = 1;

    constructor() ZunamiPool('Zunami ETH', 'zunETH') {
        address[POOL_ASSETS] memory tokens;
        tokens[ZUNAMI_WETH_TOKEN_ID] = Constants.WETH_ADDRESS;
        tokens[ZUNAMI_FRXETH_TOKEN_ID] = Constants.FRX_ETH_ADDRESS;

        uint256[POOL_ASSETS] memory tokenDecimalMultipliers;
        tokenDecimalMultipliers[ZUNAMI_WETH_TOKEN_ID] = 1;
        tokenDecimalMultipliers[ZUNAMI_FRXETH_TOKEN_ID] = 1;

        _setTokens(tokens, tokenDecimalMultipliers);
    }
}
