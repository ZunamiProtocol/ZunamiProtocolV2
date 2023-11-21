// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.22;

import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';
import '@openzeppelin/contracts/access/AccessControl.sol';
import '../interfaces/IPool.sol';
import './IStakingRewardDistributor.sol';
import '../RewardTokenManager.sol';

contract RecapitalizationManager is AccessControl, RewardTokenManager {
    using SafeERC20 for IERC20;

    error WrongDistributionBlock(uint256 distributionBlock, uint256 nowBlock);
    error WrongTid(uint256 tid);
    error ZeroAddress();

    uint256 public constant ACCUMULATION_PERIOD = (14 * 24 * 60 * 60) / 12; // 2 week in blocks

    uint256 public distributionBlock;
    IStakingRewardDistributor public stakingRewardDistributor;
    IERC20 public immutable zunToken;

    event SetRewardDistributor(address rewardDistributorAddr);

    constructor(address zunToken_) {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        distributionBlock = block.number;

        zunToken = IERC20(zunToken_);
    }

    function setRewardTokens(IERC20[] memory rewardTokens_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _setRewardTokens(rewardTokens_);
    }

    function setRewardDistributor(
        address rewardDistributorAddr
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (rewardDistributorAddr == address(0)) revert ZeroAddress();

        stakingRewardDistributor = IStakingRewardDistributor(rewardDistributorAddr);
        emit SetRewardDistributor(rewardDistributorAddr);
    }

    function distributeRewards() external {
        if (block.number < distributionBlock + ACCUMULATION_PERIOD)
            revert WrongDistributionBlock(distributionBlock, block.number);

        uint256 transferAmount;
        IERC20 token_;
        for (uint256 i = 0; i < rewardTokens.length; i++) {
            token_ = rewardTokens[i];
            if (address(token_) == address(0)) break;
            transferAmount = token_.balanceOf(address(this));
            if (transferAmount > 0) {
                token_.safeTransfer(address(stakingRewardDistributor), transferAmount);
                uint256 tid = stakingRewardDistributor.rewardTokenTidByAddress(address(token_));
                //TODO: check TID not ZERO in distributor
                stakingRewardDistributor.distribute(tid, transferAmount);
            }
        }

        distributionBlock = block.number;
    }

    function recapitalizePoolByRewards(
        IRewardManager rewardManager,
        IPool pool,
        uint256 sid,
        uint256 tid
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        IERC20 depositedToken = pool.token(tid);
        if (address(depositedToken) == address(0)) revert WrongTid(tid);

        _sellRewards(rewardManager, depositedToken);

        _depositToken(pool, sid, tid, depositedToken);

        distributionBlock = block.number;
    }

    function recapitalizePoolByStackedZun(
        uint256 zunAmount,
        IRewardManager rewardManager,
        IPool pool,
        uint256 sid,
        uint256 tid
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        IERC20 depositedToken = pool.token(tid);
        if (address(depositedToken) == address(0)) revert WrongTid(tid);

        stakingRewardDistributor.withdrawPoolToken(address(zunToken), zunAmount);

        _sellToken(rewardManager, zunToken, zunAmount, address(depositedToken));
        _depositToken(pool, sid, tid, depositedToken);
    }

    function capitalizeStakedZunByRewards(
        IRewardManager rewardManager
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _sellRewards(rewardManager, zunToken);
        uint256 zunTokenBalance = zunToken.balanceOf(address(this));
        zunToken.safeTransfer(address(stakingRewardDistributor), zunTokenBalance);

        distributionBlock = block.number;
    }

    function _depositToken(IPool pool, uint256 sid, uint256 tid, IERC20 depositedToken) internal {
        uint256 depositedTokenBalance = depositedToken.balanceOf(address(this));
        depositedToken.safeTransfer(address(pool), depositedTokenBalance);

        uint256[5] memory amounts;
        amounts[tid] = depositedToken.balanceOf(address(this));
        pool.depositStrategy(sid, amounts);
    }
}
