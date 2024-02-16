// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

interface IGauge {
    function distribute(uint256 amount) external;
}
