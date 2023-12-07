//SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import '../../utils/Constants.sol';
import {VaultStrat} from "../../strategies/VaultStrat.sol";

contract VaultStratZunUSD is VaultStrat {
    constructor() VaultStrat(
        [ZUNAMI_DAI_TOKEN_ID, ZUNAMI_USDC_TOKEN_ID, ZUNAMI_USDT_TOKEN_ID], [1, 1e12, 1e12]
    ) {}
}
