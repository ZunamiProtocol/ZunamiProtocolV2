//SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import '@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol';
import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';

import '../interfaces/IStrategy.sol';
import './ZunamiPoolOwnable.sol';

contract VaultStrat is IStrategy, ZunamiPoolOwnable {
    using SafeERC20 for IERC20Metadata;

    error WrongRation(uint256 userDepositRatio);

    function deposit(uint256[5] memory amounts) external returns (uint256) {
        uint256 depositedAmount;
        for (uint256 i = 0; i < 3; i++) {
            if (amounts[i] > 0) {
                depositedAmount += amounts[i] * zunamiPool.tokenDecimalsMultipliers()[i];
            }
        }

        return depositedAmount;
    }

    function withdraw(
        address receiver,
        uint256 userDepositRatio, // multiplied by 1e18
        uint256[5] memory minTokenAmounts
    ) external onlyZunamiPool returns (bool) {
        if (userDepositRatio == 0 || userDepositRatio > PRICE_DENOMINATOR)
            revert WrongRation(userDepositRatio);

        transferPortionTokensTo(receiver, userDepositRatio);

        return true;
    }

    function withdrawAll() external onlyZunamiPool {
        transferAllTokensTo(address(zunamiPool));
    }

    function totalHoldings() external view returns (uint256) {
        uint256 tokensHoldings = 0;
        for (uint256 i = 0; i < 5; i++) {
            IERC20Metadata token = zunamiPool.tokens()[i];
            if (address(token) == address(0)) break;
            tokensHoldings +=
                token.balanceOf(address(this)) *
                zunamiPool.tokenDecimalsMultipliers()[i];
        }
        return tokensHoldings;
    }

    function claimRewards(
        address receiver,
        IERC20Metadata[] memory rewardTokens
    ) external onlyZunamiPool {}

    function calcTokenAmount(
        uint256[5] memory tokenAmounts,
        bool isDeposit
    ) external view returns (uint256 sharesAmount) {
        return 0;
    }

    function transferAllTokensTo(address receiver) internal {
        uint256 tokenStratBalance;
        IERC20Metadata token_;
        for (uint256 i = 0; i < 5; i++) {
            token_ = zunamiPool.tokens()[i];
            tokenStratBalance = token_.balanceOf(address(this));
            if (tokenStratBalance > 0) {
                token_.safeTransfer(receiver, tokenStratBalance);
            }
        }
    }

    function transferPortionTokensTo(address withdrawer, uint256 userDepositRatio) internal {
        uint256 transferAmountOut;
        for (uint256 i = 0; i < 5; i++) {
            transferAmountOut =
                (zunamiPool.tokens()[i].balanceOf(address(this)) * userDepositRatio) /
                1e18;
            if (transferAmountOut > 0) {
                zunamiPool.tokens()[i].safeTransfer(withdrawer, transferAmountOut);
            }
        }
    }
}
