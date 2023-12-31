//SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import '../../ZunamiPool.sol';
import '../../utils/Constants.sol';

contract ZunamiPoolZunETH is ZunamiPool {
    uint256 public constant ZUNAMI_WETH_TOKEN_ID = 0;
    uint256 public constant ZUNAMI_FRXETH_TOKEN_ID = 1;

    constructor() ZunamiPool('Zunami ETH', 'zunETH') {
        address[] memory tokens = new address[](2);
        tokens[ZUNAMI_WETH_TOKEN_ID] = Constants.WETH_ADDRESS;
        tokens[ZUNAMI_FRXETH_TOKEN_ID] = Constants.FRX_ETH_ADDRESS;

        uint256[] memory tokenDecimalMultipliers = new uint256[](2);
        tokenDecimalMultipliers[ZUNAMI_WETH_TOKEN_ID] = 1;
        tokenDecimalMultipliers[ZUNAMI_FRXETH_TOKEN_ID] = 1;

        _setTokens(tokens, tokenDecimalMultipliers);
    }
}
