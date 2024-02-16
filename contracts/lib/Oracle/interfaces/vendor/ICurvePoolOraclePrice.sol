// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

interface ICurvePoolOraclePrice {
    function price_oracle() external view returns (uint256);
}
