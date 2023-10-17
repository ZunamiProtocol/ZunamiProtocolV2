// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { IERC20 } from '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import { IERC20Metadata } from '@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol';
import { IStrategy } from './IStrategy.sol';

interface IPool is IERC20 {
    struct PoolInfo {
        IStrategy strategy;
        uint256 startTime;
        uint256 deposited;
        bool enabled;
    }

    event Deposited(
        address indexed depositor,
        uint256 depositedValue,
        uint256[5] amounts,
        uint256 deposited,
        uint256 pid
    );

    event Withdrawn(address indexed withdrawer, uint256 withdrawn, uint256 pid);

    event FailedWithdrawal(address indexed withdrawer, uint256[5] amounts, uint256 withdrawn);

    event AddedPool(uint256 pid, address strategyAddr, uint256 startTime);
    event ClaimedRewards(address receiver, IERC20Metadata[] rewardTokens);
    event ToggledEnabledPoolStatus(address pool, bool newStatus);
    event UpdatedToken(
        uint256 tid,
        address token,
        uint256 tokenDecimalMultiplier,
        address tokenOld
    );

    function tokens() external view returns (IERC20Metadata[5] memory);

    function tokenDecimalsMultipliers() external view returns (uint256[5] memory);

    function poolInfo(uint256 pid) external view returns (PoolInfo memory);

    function claimRewards(address receiver, IERC20Metadata[] memory rewardTokens) external;

    function totalHoldings() external view returns (uint256);

    function poolCount() external view returns (uint256);

    function deposit(
        uint256 pid,
        uint256[5] memory amounts,
        address receiver
    ) external returns (uint256);

    function withdraw(
        uint256 pid,
        uint256 stableAmount,
        uint256[5] memory minTokenAmounts,
        address receiver
    ) external;
}
