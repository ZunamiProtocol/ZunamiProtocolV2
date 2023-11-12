//SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import '@openzeppelin/contracts/token/ERC20/IERC20.sol';

interface IERC20Supplied is IERC20 {
    function mint(address to, uint256 amount) external;

    function burn(uint256 value) external;
}
