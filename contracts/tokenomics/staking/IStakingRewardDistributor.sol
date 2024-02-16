// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

interface IStakingRewardDistributor {
    function rewardTokenTidByAddress(address rewardToken) external view returns (uint256);

    function distribute(uint256 tid, uint256 amount) external;

    function withdrawPoolToken(address token, uint256 amount) external;

    function returnPoolToken(address token, uint256 amount) external;

    function isRewardTokenAdded(address token) external view returns (bool);

    function recapitalizedAmounts(uint256 pid) external view returns (uint256);

    function poolPidByAddress(address token) external view returns (uint256);
}
