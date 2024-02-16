// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

interface IRewardViewer {
    error ZeroAddress();

    event SetFraxStakingVaultEarnedViewer(address _address);
}
