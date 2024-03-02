// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';
import '@openzeppelin/contracts/access/AccessControl.sol';
import '../../interfaces/IPool.sol';
import './IStakingRewardDistributor.sol';
import '../../RewardTokenManager.sol';
import { stEthEthConvexCurveStrat } from '../../strategies/curve/convex/eth/stEthEthConvexCurveStrat.sol';

contract RecapitalizationManager is AccessControl, RewardTokenManager {
    using SafeERC20 for IERC20;

    event RecapitalizedPoolByRewards(
        address rewardManager,
        address pool,
        uint256 sid,
        uint256 tid,
        uint256 rewardDistributionBlock,
        uint256[] rewardAmounts
    );
    event DistributedRewards(uint256 rewardDistributionBlock);
    event RecapitalizedPoolByStackedZun(
        uint256 zunAmount,
        address rewardManager,
        address pool,
        uint256 sid,
        uint256 tid
    );
    event RestoredStakedZunByRewards(
        uint256 zunReturnTokenAmount,
        address rewardManager,
        uint256 rewardDistributionBlock
    );
    event WithdrawnStuckToken(address token, uint256 amount);

    error WrongRewardDistributionBlock(uint256 rewardDistributionBlock, uint256 nowBlock);
    error WrongTid(uint256 tid);
    error ZeroAddress();
    error ZeroParam();

    bytes32 public constant EMERGENCY_ADMIN_ROLE = keccak256('EMERGENCY_ADMIN_ROLE');

    IERC20 public immutable zunToken;

    uint256 public rewardDistributionBlock;
    IStakingRewardDistributor public stakingRewardDistributor;
    uint256 public accumulationPeriod;

    event SetRewardDistributor(address rewardDistributorAddr);
    event SetAccumulationPeriod(uint256 accumulationPeriod);

    constructor(address zunToken_) {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(EMERGENCY_ADMIN_ROLE, msg.sender);
        rewardDistributionBlock = block.number;

        if (zunToken_ == address(0)) revert ZeroAddress();
        zunToken = IERC20(zunToken_);

        setAccumulationPeriod((14 * 24 * 60 * 60) / 12); // 2 week in blocks
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

    function setAccumulationPeriod(
        uint256 _accumulationPeriod
    ) public onlyRole(DEFAULT_ADMIN_ROLE) {
        if (_accumulationPeriod == 0) revert ZeroParam();

        accumulationPeriod = _accumulationPeriod;
        emit SetAccumulationPeriod(_accumulationPeriod);
    }

    function distributeRewards() external {
        if (block.number < rewardDistributionBlock + accumulationPeriod)
            revert WrongRewardDistributionBlock(rewardDistributionBlock, block.number);

        rewardDistributionBlock = block.number;

        uint256 transferAmount;
        IERC20 token_;
        for (uint256 i = 0; i < rewardTokens.length; i++) {
            token_ = rewardTokens[i];
            if (address(token_) == address(0)) break;
            transferAmount = token_.balanceOf(address(this));
            if (
                transferAmount > 0 && stakingRewardDistributor.isRewardTokenAdded(address(token_))
            ) {
                token_.safeIncreaseAllowance(address(stakingRewardDistributor), transferAmount);
                uint256 tid = stakingRewardDistributor.rewardTokenTidByAddress(address(token_));
                stakingRewardDistributor.distribute(tid, transferAmount);
            }
        }

        emit DistributedRewards(rewardDistributionBlock);
    }

    function recapitalizePoolByRewards(
        IRewardManager rewardManager,
        IPool pool,
        uint256 sid,
        uint256 tid,
        uint256[] memory rewardAmounts
    ) external onlyRole(EMERGENCY_ADMIN_ROLE) {
        IERC20 depositedToken = pool.token(tid);
        if (address(depositedToken) == address(0)) revert WrongTid(tid);

        _sellRewards(rewardManager, depositedToken, rewardAmounts);

        _depositToken(pool, sid, tid, depositedToken);

        rewardDistributionBlock = block.number;

        emit RecapitalizedPoolByRewards(
            address(rewardManager),
            address(pool),
            sid,
            tid,
            rewardDistributionBlock,
            rewardAmounts
        );
    }

    function recapitalizePoolByStackedZun(
        uint256 zunAmount,
        IRewardManager rewardManager,
        IPool pool,
        uint256 sid,
        uint256 tid
    ) external onlyRole(EMERGENCY_ADMIN_ROLE) {
        IERC20 depositedToken = pool.token(tid);
        if (address(depositedToken) == address(0)) revert WrongTid(tid);

        stakingRewardDistributor.withdrawPoolToken(address(zunToken), zunAmount);

        _sellToken(rewardManager, zunToken, zunAmount, address(depositedToken));
        _depositToken(pool, sid, tid, depositedToken);

        emit RecapitalizedPoolByStackedZun(
            zunAmount,
            address(rewardManager),
            address(pool),
            sid,
            tid
        );
    }

    function restoreStakedZunByRewards(
        IRewardManager rewardManager
    ) external onlyRole(EMERGENCY_ADMIN_ROLE) {
        _sellRewards(rewardManager, zunToken);
        uint256 zunTokenReturnAmount = zunToken.balanceOf(address(this));
        uint256 pid = stakingRewardDistributor.poolPidByAddress(address(zunToken));
        uint256 recapitalizedAmount = stakingRewardDistributor.recapitalizedAmounts(pid);
        if (zunTokenReturnAmount > recapitalizedAmount) {
            zunTokenReturnAmount = recapitalizedAmount;
        }

        zunToken.safeIncreaseAllowance(address(stakingRewardDistributor), zunTokenReturnAmount);
        stakingRewardDistributor.returnPoolToken(address(zunToken), zunTokenReturnAmount);

        rewardDistributionBlock = block.number;

        emit RestoredStakedZunByRewards(
            zunTokenReturnAmount,
            address(rewardManager),
            rewardDistributionBlock
        );
    }

    /**
     * @dev Allows the owner to withdraw stuck tokens from the contract.
     * @param _token The IERC20 token to withdraw from.
     * @param _amount The amount of tokens to withdraw. Use type(uint256).max to withdraw all tokens.
     * @notice Only the account with the DEFAULT_ADMIN_ROLE can withdraw tokens.
     * @notice If _amount is set to type(uint256).max, it withdraws all tokens held by the contract.
     */
    function withdrawStuckToken(
        IERC20 _token,
        uint256 _amount
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        uint256 withdrawAmount = _amount == type(uint256).max
            ? _token.balanceOf(address(this))
            : _amount;
        if (withdrawAmount > 0) {
            _token.safeTransfer(_msgSender(), withdrawAmount);
        }

        emit WithdrawnStuckToken(address(_token), withdrawAmount);
    }

    function _depositToken(IPool pool, uint256 sid, uint256 tid, IERC20 depositedToken) internal {
        uint256 depositedTokenBalance = depositedToken.balanceOf(address(this));
        depositedToken.safeTransfer(address(pool), depositedTokenBalance);

        uint256[5] memory amounts;
        amounts[tid] = depositedTokenBalance;
        pool.depositStrategy(sid, amounts);
    }
}
