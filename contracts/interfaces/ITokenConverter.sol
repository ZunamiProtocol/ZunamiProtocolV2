//SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

interface ITokenConverter {
    function handle(address from, address to, uint256 amount, uint256 slippage) external;
}
