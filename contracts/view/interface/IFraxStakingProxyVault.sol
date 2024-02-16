// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

interface IFraxStakingProxyVault {
    function stakingAddress() external returns (address);

    function rewards() external returns (address);

    function stakingToken() external returns (address);
}
