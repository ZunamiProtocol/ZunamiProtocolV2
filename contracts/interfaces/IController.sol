// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

interface IController {
    function deposit(uint256[5] memory amounts, address receiver) external returns (uint256 shares);

    function withdraw(uint256 shares, uint256[5] memory minTokenAmounts, address receiver) external;
}
