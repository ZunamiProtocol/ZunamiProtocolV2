// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';
import './interfaces/IRewardManager.sol';

abstract contract RewardTokenManager {
    using SafeERC20 for IERC20;

    error WrongRewardTokens(IERC20[] rewardTokens);
    error ZeroRewardManager();
    error ZeroTokenAddress(uint256 index);

    IERC20[] public rewardTokens;

    event SetRewardTokens(IERC20[] rewardTokens);

    function _setRewardTokens(IERC20[] memory rewardTokens_) internal virtual {
        if (rewardTokens_.length == 0) revert WrongRewardTokens(rewardTokens_);

        for (uint256 i = 0; i < rewardTokens_.length; i++) {
            if (address(rewardTokens_[i]) == address(0)) revert ZeroTokenAddress(i);
        }

        rewardTokens = rewardTokens_;
        emit SetRewardTokens(rewardTokens);
    }

    function _sellRewards(
        IRewardManager rewardManager,
        IERC20 feeToken
    ) internal returns (uint256) {
        if (address(rewardManager) == address(0)) revert ZeroRewardManager();

        uint256 rewardsLength_ = rewardTokens.length;
        uint256[] memory rewardBalances = new uint256[](rewardsLength_);
        bool allRewardsEmpty = true;

        for (uint256 i = 0; i < rewardsLength_; i++) {
            rewardBalances[i] = rewardTokens[i].balanceOf(address(this));
            if (rewardBalances[i] > 0) {
                allRewardsEmpty = false;
            }
        }
        if (allRewardsEmpty) {
            return 0;
        }

        uint256 feeTokenBalanceBefore = feeToken.balanceOf(address(this));

        IERC20 rewardToken_;
        for (uint256 i = 0; i < rewardsLength_; i++) {
            if (rewardBalances[i] == 0) continue;
            rewardToken_ = rewardTokens[i];
            _sellToken(rewardManager, rewardToken_, rewardBalances[i], address(feeToken));
        }

        return feeToken.balanceOf(address(this)) - feeTokenBalanceBefore;
    }

    function _sellToken(
        IRewardManager rewardManager,
        IERC20 sellingToken,
        uint256 sellingTokenAmount,
        address receivedToken
    ) internal {
        sellingToken.safeTransfer(address(rewardManager), sellingTokenAmount);
        rewardManager.handle(address(sellingToken), sellingTokenAmount, receivedToken);
    }
}
