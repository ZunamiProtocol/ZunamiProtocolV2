//SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import { IERC20 } from '@openzeppelin/contracts/token/ERC20/IERC20.sol';

interface IStrategy {
    function deposit(uint256[5] memory amounts) external returns (uint256);

    function withdraw(
        address receiver,
        uint256 userDepositRatio, // multiplied by 1e18
        uint256[5] memory minTokenAmounts
    ) external returns (bool);

    function withdrawAll(uint256[5] memory minTokenAmounts) external;

    function totalHoldings() external view returns (uint256);

    function claimRewards(address receiver, IERC20[] memory rewardTokens) external;

    function calcTokenAmount(
        uint256[5] memory tokenAmounts,
        bool isDeposit
    ) external view returns (uint256 sharesAmount);
}
