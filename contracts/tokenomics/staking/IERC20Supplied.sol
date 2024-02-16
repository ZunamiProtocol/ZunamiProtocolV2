//SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import '@openzeppelin/contracts/token/ERC20/IERC20.sol';

interface IERC20Supplied is IERC20 {
    function setUpdateCallback(address _updateCallback) external;

    function mint(address to, uint256 amount) external;

    function burn(uint256 value) external;

    function burnFrom(address account, uint256 value) external;
}
