// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IRewardDistributor {
    function distribute(uint256 tid, uint256 amount) external;

    function rewardTokenTidByAddress(address token) external returns (uint56 tid);
}
