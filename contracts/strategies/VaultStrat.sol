//SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';

import '../interfaces/IStrategy.sol';
import './ZunamiPoolAccessControl.sol';

contract VaultStrat is IStrategy, ZunamiPoolAccessControl {
    using SafeERC20 for IERC20;

    uint256 public constant RATIO_MULTIPLIER = 1e18;
    uint8 public constant POOL_ASSETS = 5;

    error WrongRatio(uint256 userDepositRatio);

    IERC20[POOL_ASSETS] public tokens;
    uint256[POOL_ASSETS] public tokenDecimalsMultipliers;
    uint256[POOL_ASSETS] public depositedTokens;

    constructor(
        IERC20[POOL_ASSETS] memory tokens_,
        uint256[POOL_ASSETS] memory tokenDecimalsMultipliers_
    ) {
        tokens = tokens_;
        tokenDecimalsMultipliers = tokenDecimalsMultipliers_;
    }

    function deposit(
        uint256[POOL_ASSETS] calldata amounts
    ) external onlyZunamiPool returns (uint256) {
        uint256 depositedAmount;
        for (uint256 i = 0; i < POOL_ASSETS; i++) {
            if (amounts[i] > 0) {
                depositedAmount += amounts[i] * tokenDecimalsMultipliers[i];
                depositedTokens[i] += amounts[i];
            }
        }

        return depositedAmount;
    }

    function withdraw(
        address receiver,
        uint256 userDepositRatio,
        uint256[POOL_ASSETS] memory
    ) external onlyZunamiPool returns (bool) {
        if (userDepositRatio == 0 || userDepositRatio > RATIO_MULTIPLIER)
            revert WrongRatio(userDepositRatio);

        transferPortionTokensTo(receiver, userDepositRatio);

        return true;
    }

    function withdrawAll(uint256[POOL_ASSETS] memory) external onlyZunamiPool {
        transferPortionTokensTo(address(zunamiPool), RATIO_MULTIPLIER);
    }

    function totalHoldings() external view returns (uint256) {
        uint256 tokensHoldings = 0;
        for (uint256 i = 0; i < POOL_ASSETS; i++) {
            IERC20 token = tokens[i];
            if (address(token) == address(0)) break;
            tokensHoldings += depositedTokens[i] * tokenDecimalsMultipliers[i];
        }
        return tokensHoldings;
    }

    function claimRewards(address receiver, IERC20[] memory rewardTokens) external onlyZunamiPool {}

    function calcTokenAmount(
        uint256[POOL_ASSETS] memory tokenAmounts,
        bool
    ) external view returns (uint256) {
        uint256 amount = 0;
        for (uint256 i = 0; i < POOL_ASSETS; i++) {
            if (tokenAmounts[i] == 0) continue;
            amount += tokenAmounts[i] * tokenDecimalsMultipliers[i];
        }
        return amount;
    }

    function transferPortionTokensTo(address receiver, uint256 userDepositRatio) internal {
        uint256 transferAmountOut;
        IERC20 token_;
        for (uint256 i = 0; i < POOL_ASSETS; i++) {
            token_ = tokens[i];
            if (address(token_) == address(0)) break;
            transferAmountOut = userDepositRatio == RATIO_MULTIPLIER
                ? depositedTokens[i]
                : (depositedTokens[i] * userDepositRatio) / RATIO_MULTIPLIER;
            if (transferAmountOut > 0) {
                depositedTokens[i] -= transferAmountOut;
                token_.safeTransfer(receiver, transferAmountOut);
            }
        }
    }
}
