// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.22;

interface IFraxStakingProxyVault {
    function stakingAddress() external returns (address);

    function rewards() external returns (address);

    function stakingToken() external returns (address);
}
