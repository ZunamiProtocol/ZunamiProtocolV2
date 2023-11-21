//SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import '../../ZunamiPool.sol';
import '../../utils/Constants.sol';

contract ZunamiPoolApsZETH is ZunamiPool {
    uint256 public constant ZUNAMI_WETH_TOKEN_ID = 0;
    uint256 public constant ZUNAMI_FRXETH_TOKEN_ID = 1;

    constructor() ZunamiPool('Zunami ETH APS', 'apsZETH') {
        address[] memory tokens = new address[](1);
        tokens[0] = Constants.ZETH_ADDRESS;

        uint256[] memory tokenDecimalMultipliers = new uint256[](1);
        tokenDecimalMultipliers[0] = 1;

        _setTokens(tokens, tokenDecimalMultipliers);
    }
}
