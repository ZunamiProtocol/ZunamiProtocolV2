// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';
import './interfaces/IRewardManager.sol';

abstract contract RewardTokenManager {
    using SafeERC20 for IERC20;

    error WrongRewardTokens(IERC20[] rewardTokens);
    error WrongRewardTokensLength(uint256 length);
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

    function _sellRewardsAll(
        IRewardManager rewardManager,
        IERC20 feeToken,
        uint256 rewardTokenFrozen
    ) internal returns (uint256) {
        if (address(rewardManager) == address(0)) revert ZeroRewardManager();

        uint256 rewardsLength_ = rewardTokens.length;
        uint256[] memory rewardBalances = new uint256[](rewardsLength_);
        bool allRewardsEmpty = true;

        for (uint256 i = 0; i < rewardsLength_; i++) {
            IERC20 rewardToken = rewardTokens[i];
            rewardBalances[i] = rewardToken.balanceOf(address(this));
            if (feeToken == rewardToken) {
                rewardBalances[i] -= rewardTokenFrozen;
            }
            if (rewardBalances[i] > 0) {
                allRewardsEmpty = false;
            }
        }
        if (allRewardsEmpty) {
            return 0;
        }

        return _sellRewards(rewardManager, rewardsLength_, feeToken, rewardBalances);
    }

    function _sellRewardsByAmounts(
        IRewardManager rewardManager,
        IERC20 feeToken,
        uint256[] memory rewardAmounts
    ) internal returns (uint256) {
        if (address(rewardManager) == address(0)) revert ZeroRewardManager();
        uint256 rewardsLength_ = rewardTokens.length;
        if (rewardsLength_ != rewardAmounts.length) revert WrongRewardTokensLength(rewardsLength_);

        return _sellRewards(rewardManager, rewardsLength_, feeToken, rewardAmounts);
    }

    function _sellRewards(
        IRewardManager rewardManager,
        uint256 rewardsLength,
        IERC20 feeToken,
        uint256[] memory rewardAmounts
    ) private returns (uint256) {
        uint256 feeTokenBalanceBefore = feeToken.balanceOf(address(this));

        IERC20 rewardToken_;
        for (uint256 i = 0; i < rewardsLength; i++) {
            if (rewardAmounts[i] == 0) continue;
            rewardToken_ = rewardTokens[i];
            //don't sell fee token itself as reward
            if (rewardToken_ == feeToken) {
                //reduce current fee token balance by it's reward balance
                feeTokenBalanceBefore -= rewardAmounts[i];
                continue;
            }
            _sellToken(rewardManager, rewardToken_, rewardAmounts[i], address(feeToken));
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
