//SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import '@openzeppelin/contracts/token/ERC20/ERC20.sol';
import '@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol';

contract ZunamiToken is ERC20, ERC20Permit {
    constructor(address receiver) ERC20('Zunami Token', 'ZUN') ERC20Permit('Zunami Token') {
        _mint(receiver, 100_000_000 * 10 ** decimals());
    }
}
