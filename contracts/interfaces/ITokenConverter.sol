//SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

interface ITokenConverter {
    function handle(
        address tokenIn,
        address tokenOut,
        uint256 amount,
        uint256 minAmountOut
    ) external returns (uint256);
}
