// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import { IERC20 } from '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import './IPool.sol';

interface IPoolController is IERC20 {
    function pool() external view returns (IPool);

    function deposit(uint256[5] memory amounts, address receiver) external returns (uint256);

    function withdraw(
        uint256 stableAmount,
        uint256[5] memory minTokenAmounts,
        address receiver
    ) external;
}
