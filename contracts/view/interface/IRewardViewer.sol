// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.22;

interface IRewardViewer {
    error ZeroAddress();

    event SetFraxStakingVaultEarnedViewer(address _address);
}
