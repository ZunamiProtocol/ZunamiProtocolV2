//SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

interface IVotemarket {

    /// @notice Increase Bounty duration.
    /// @param _bountyId ID of the bounty.
    /// @param _additionnalPeriods Number of periods to add.
    /// @param _increasedAmount Total reward amount to add.
    /// @param _newMaxPricePerVote Total reward amount to add.
    function increaseBountyDuration(
        uint256 _bountyId,
        uint8 _additionnalPeriods,
        uint256 _increasedAmount,
        uint256 _newMaxPricePerVote
    ) external;

    /// @notice Bounty struct requirements.
    struct Bounty {
        // Address of the target gauge.
        address gauge;
        // Manager.
        address manager;
        // Address of the ERC20 used for rewards.
        address rewardToken;
        // Number of periods.
        uint8 numberOfPeriods;
        // Timestamp where the bounty become unclaimable.
        uint256 endTimestamp;
        // Max Price per vote.
        uint256 maxRewardPerVote;
        // Total Reward Added.
        uint256 totalRewardAmount;
        // Blacklisted addresses.
        address[] blacklist;
    }

    function getBounty(uint256 bountyId) external view returns (Bounty memory bounty);

    /// @notice Update Bounty Manager.
    /// @param bountyId ID of the bounty.
    /// @param newManager Address of the new manager.
    function updateManager(uint256 bountyId, address newManager) external;

}
