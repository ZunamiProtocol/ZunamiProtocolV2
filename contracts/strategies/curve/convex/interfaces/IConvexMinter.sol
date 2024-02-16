//SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import '@openzeppelin/contracts/token/ERC20/IERC20.sol';

interface IConvexMinter is IERC20 {
    function totalCliffs() external view returns (uint256);

    function reductionPerCliff() external view returns (uint256);
}
