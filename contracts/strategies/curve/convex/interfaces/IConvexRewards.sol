//SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

interface IConvexRewards {
    function balanceOf(address account) external view returns (uint256);

    function earned(address account) external view returns (uint256);

    function rewardRate() external view returns (uint256);

    function totalSupply() external view returns (uint256);

    function withdrawAllAndUnwrap(bool claim) external;

    function withdrawAndUnwrap(uint256 amount, bool claim) external;

    function getReward() external returns (bool);

    function extraRewardsLength() external view returns (uint256);

    function extraRewards(uint256 id) external view returns (address extraRewardsAddress);

    function rewardToken() external view returns (address);
}
