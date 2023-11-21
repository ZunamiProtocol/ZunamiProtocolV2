// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.22;

interface IStakingRewardDistributor {
    function rewardTokenTidByAddress(address rewardToken) external view returns (uint256);

    function distribute(uint256 tid, uint256 amount) external;

    function withdrawPoolToken(address token, uint256 amount) external;
}
