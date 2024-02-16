//SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

interface IERC20UpdateCallback {
    function onERC20Update(address from, address to, uint256 value) external;
}
