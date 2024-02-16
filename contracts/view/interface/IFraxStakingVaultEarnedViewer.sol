// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

interface IFraxStakingVaultEarnedViewer {
    function earned(
        address _stakingAddress,
        address _wrapper,
        address _extrarewards,
        address _vault
    ) external returns (address[] memory token_addresses, uint256[] memory total_earned);
}
