// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import { IERC20 } from '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import { IERC20 } from '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import { IStrategy } from './IStrategy.sol';

interface IPool is IERC20 {
    error WrongDeposit(uint256 sid, uint256[5] amounts);
    error NoStrategies();
    error NotStartedStrategy(uint256 sid);
    error NotEnabledStrategy(uint256 sid);
    error WrongAmount();
    error WrongWithdrawParams(uint256 sid);
    error WrongRatio();
    error ZeroAddress();
    error DuplicatedStrategy();
    error IncorrectArguments();
    error WrongWithdrawPercent();
    error WrongReceiver();
    error IncorrectSid();
    error WrongLength();

    struct StrategyInfo {
        IStrategy strategy;
        uint256 startTime;
        uint256 minted;
        bool enabled;
    }

    event Deposited(
        address indexed depositor,
        uint256 depositedValue,
        uint256[5] amounts,
        uint256 deposited,
        uint256 indexed sid
    );

    event Withdrawn(address indexed withdrawer, uint256 withdrawn, uint256 indexed sid);

    event FailedWithdrawal(address indexed withdrawer, uint256[5] amounts, uint256 withdrawn);

    event AddedStrategy(uint256 indexed sid, address indexed strategyAddr, uint256 startTime);
    event ClaimedRewards(address indexed receiver, IERC20[] rewardTokens);
    event EnabledStrategy(address indexed pool);
    event DisableStrategy(address indexed pool);
    event UpdatedToken(
        uint256 indexed tid,
        address indexed token,
        uint256 tokenDecimalMultiplier,
        address tokenOld
    );

    function tokens() external view returns (IERC20[5] memory);

    function token(uint256 tid) external view returns (IERC20);

    function tokenDecimalsMultipliers() external view returns (uint256[5] memory);

    function strategyInfo(uint256 sid) external view returns (StrategyInfo memory);

    function claimRewards(address receiver, IERC20[] memory rewardTokens) external;

    function totalHoldings() external view returns (uint256);

    function strategyCount() external view returns (uint256);

    function deposit(
        uint256 sid,
        uint256[5] memory amounts,
        address receiver
    ) external returns (uint256);

    function depositStrategy(uint256 sid, uint256[5] memory amounts) external returns (uint256);

    function withdraw(
        uint256 sid,
        uint256 stableAmount,
        uint256[5] memory minTokenAmounts,
        address receiver
    ) external;
}
