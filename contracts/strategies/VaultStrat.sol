//SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';

import '../interfaces/IStrategy.sol';
import './ZunamiPoolOwnable.sol';

contract VaultStrat is IStrategy, ZunamiPoolOwnable {
    using SafeERC20 for IERC20;

    uint256 public constant RATIO_MULTIPLIER = 1e18;
    uint8 public constant POOL_ASSETS = 5;

    error WrongRatio(uint256 userDepositRatio);

    function deposit(uint256[POOL_ASSETS] memory amounts) external returns (uint256) {
        uint256 depositedAmount;
        for (uint256 i = 0; i < POOL_ASSETS; i++) {
            if (amounts[i] > 0) {
                depositedAmount += amounts[i] * zunamiPool.tokenDecimalsMultipliers()[i];
            }
        }

        return depositedAmount;
    }

    function withdraw(
        address receiver,
        uint256 userDepositRatio,
        uint256[POOL_ASSETS] memory
    ) external onlyZunamiPool returns (bool) {
        if (userDepositRatio == 0 || userDepositRatio > PRICE_DENOMINATOR)
            revert WrongRatio(userDepositRatio);

        transferPortionTokensTo(receiver, userDepositRatio);

        return true;
    }

    function withdrawAll() external onlyZunamiPool {
        transferAllTokensTo(address(zunamiPool));
    }

    function totalHoldings() external view returns (uint256) {
        uint256 tokensHoldings = 0;
        for (uint256 i = 0; i < POOL_ASSETS; i++) {
            IERC20 token = zunamiPool.tokens()[i];
            if (address(token) == address(0)) break;
            tokensHoldings +=
                token.balanceOf(address(this)) *
                zunamiPool.tokenDecimalsMultipliers()[i];
        }
        return tokensHoldings;
    }

    function claimRewards(address receiver, IERC20[] memory rewardTokens) external onlyZunamiPool {}

    function calcTokenAmount(uint256[POOL_ASSETS] memory, bool) external view returns (uint256) {
        return 0;
    }

    function transferAllTokensTo(address receiver) internal {
        uint256 tokenStratBalance;
        IERC20[POOL_ASSETS] memory tokens = zunamiPool.tokens();
        IERC20 token_;
        for (uint256 i = 0; i < POOL_ASSETS; i++) {
            token_ = tokens[i];
            if (address(token_) == address(0)) break;
            tokenStratBalance = token_.balanceOf(address(this));
            if (tokenStratBalance > 0) {
                token_.safeTransfer(receiver, tokenStratBalance);
            }
        }
    }

    function transferPortionTokensTo(address withdrawer, uint256 userDepositRatio) internal {
        uint256 transferAmountOut;
        IERC20[POOL_ASSETS] memory tokens = zunamiPool.tokens();
        IERC20 token_;
        for (uint256 i = 0; i < POOL_ASSETS; i++) {
            token_ = tokens[i];
            if (address(token_) == address(0)) break;
            transferAmountOut =
                (token_.balanceOf(address(this)) * userDepositRatio) /
                RATIO_MULTIPLIER;
            if (transferAmountOut > 0) {
                token_.safeTransfer(withdrawer, transferAmountOut);
            }
        }
    }
}
