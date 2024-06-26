// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.23;

interface IOracle {

    error ZeroAddress();
    error UnsupportedToken();


    /// @notice returns the price in USD of symbol.
    function getUSDPrice(address token) external view returns (uint256);

    /// @notice returns if the given token is supported for pricing.
    function isTokenSupported(address token) external view returns (bool);
}
