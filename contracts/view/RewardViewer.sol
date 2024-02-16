//SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import { IConvexBooster } from '../strategies/curve/convex/interfaces/IConvexBooster.sol';
import { IConvexMinter } from '../strategies/curve/convex/interfaces/IConvexMinter.sol';
import { IConvexRewards } from '../strategies/curve/convex/interfaces/IConvexRewards.sol';
import { IStashTokenWrapper } from './interface/IStashTokenWrapper.sol';
import { IFraxStakingVaultEarnedViewer } from './interface/IFraxStakingVaultEarnedViewer.sol';
import { IRewardViewer } from './interface/IRewardViewer.sol';
import { IFraxStakingProxyVault } from './interface/IFraxStakingProxyVault.sol';
import { Ownable2Step, Ownable } from '@openzeppelin/contracts/access/Ownable2Step.sol';
import { IERC20 } from '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import { IStakeDaoVault } from '../strategies/curve/stakeDao/interfaces/IStakeDaoVault.sol';
import { IStakeDaoGauge } from '../strategies/curve/stakeDao/interfaces/IStakeDaoGauge.sol';

contract RewardViewer is IRewardViewer, Ownable2Step {
    uint256 internal constant CLIFF_COUNT = 1000;
    uint256 internal constant CLIFF_SIZE = 100_000e18;
    uint256 internal constant MAX_CVX_SUPPLY = 100_000_000e18;

    IERC20 public constant CVX = IERC20(0x4e3FBD56CD56c3e72c1403e103b45Db9da5B9D2B);
    IERC20 public constant CRV = IERC20(0xD533a949740bb3306d119CC777fa900bA034cd52);

    IFraxStakingVaultEarnedViewer public fraxStakingVaultEarnedViewer;

    constructor(address _fraxStakingVaultEarnedViewerAddress) Ownable(msg.sender) {
        _assertNonZero(_fraxStakingVaultEarnedViewerAddress);
        fraxStakingVaultEarnedViewer = IFraxStakingVaultEarnedViewer(
            _fraxStakingVaultEarnedViewerAddress
        );
    }

    function setFraxStakingVaultEarnedViewer(
        address _fraxStakingVaultEarnedViewerAddress
    ) external onlyOwner {
        _assertNonZero(_fraxStakingVaultEarnedViewerAddress);
        fraxStakingVaultEarnedViewer = IFraxStakingVaultEarnedViewer(
            _fraxStakingVaultEarnedViewerAddress
        );

        emit SetFraxStakingVaultEarnedViewer(_fraxStakingVaultEarnedViewerAddress);
    }

    /**
     * @notice Calculate how much CRV & CVX earned by strategy
     * @param _strategyAddress Strategy address (zunami)
     * @param _rewardsAddress Rewards address (convex)
     */
    function getConvexCurveStrategyRewards(
        address _strategyAddress,
        address _rewardsAddress
    ) public view returns (uint256 crv, uint256 cvx) {
        uint256 crvAmount = getCrvEarned(_strategyAddress, _rewardsAddress) +
            CRV.balanceOf(_strategyAddress);
        uint256 cvxAmount = calculateClaimableCvxForCrv(crvAmount) +
            CVX.balanceOf(_strategyAddress);

        return (crvAmount, cvxAmount);
    }

    /**
     * @notice Calculate how much CRV & CVX & Extra Reward Token earned by strategy
     * @param _strategyAddress Strategy address (zunami)
     * @param _rewardsAddress Rewards address (convex)
     * @param _extraRewardsAddress Extra rewards address (convex)
     */
    function getConvexCurveStrategyRewardsWithExtraReward(
        address _strategyAddress,
        address _rewardsAddress,
        address _extraRewardsAddress
    )
        external
        view
        returns (uint256 crv, uint256 cvx, address extraRewardTokenAddress, uint256 extraReward)
    {
        (uint256 crvAmount, uint256 cvxAmount) = getConvexCurveStrategyRewards(
            _strategyAddress,
            _rewardsAddress
        );

        IConvexRewards extraRewards = IConvexRewards(_extraRewardsAddress);
        IStashTokenWrapper extraRewardsTokenWrapper = IStashTokenWrapper(
            extraRewards.rewardToken()
        );
        IERC20 extraRewardsToken = IERC20(extraRewardsTokenWrapper.token());
        uint256 extraRewardsAmountEarned = IConvexRewards(_extraRewardsAddress).earned(
            _strategyAddress
        );
        uint extraRewardAmount = extraRewardsAmountEarned +
            extraRewardsToken.balanceOf(_strategyAddress);

        return (crvAmount, cvxAmount, address(extraRewardsToken), extraRewardAmount);
    }

    /**
     * @notice Combine earned tokens on frax staking contract and any tokens that are in the vault
     * @param _strategyVaultAddress Vault address of strategy (zunami, frax.convex)
     */
    function getFraxStakingVaultEarned(
        address _strategyVaultAddress
    ) external returns (address[] memory tokenAddresses, uint256[] memory tokenEarned) {
        IFraxStakingProxyVault fraxProxyVault = IFraxStakingProxyVault(_strategyVaultAddress);

        return
            fraxStakingVaultEarnedViewer.earned(
                fraxProxyVault.stakingAddress(),
                fraxProxyVault.stakingToken(),
                fraxProxyVault.rewards(),
                _strategyVaultAddress
            );
    }

    /**
     * @notice Calculate how much tokens earned by strategy
     * @param _strategyAddress Strategy address (zunami)
     * @param _strategyVaultAddress Strategy vault address (stakeDao)
     */
    function getStakeDaoVaultEarned(
        address _strategyAddress,
        address _strategyVaultAddress
    ) external view returns (address[] memory, uint256[] memory) {
        IStakeDaoGauge strategyStakeDaoGauge = IStakeDaoVault(_strategyVaultAddress)
            .liquidityGauge();
        uint256 rewardCount = strategyStakeDaoGauge.reward_count();

        address[] memory tokenAddresses = new address[](rewardCount);
        uint256[] memory tokenEarned = new uint256[](rewardCount);
        for (uint256 i = 0; i < rewardCount; i++) {
            address rewardTokenAddress = strategyStakeDaoGauge.reward_tokens(i);
            uint256 earned = strategyStakeDaoGauge.claimable_reward(
                _strategyAddress,
                rewardTokenAddress
            ) + IERC20(rewardTokenAddress).balanceOf(_strategyVaultAddress);
            tokenAddresses[i] = rewardTokenAddress;
            tokenEarned[i] = earned;
        }

        return (tokenAddresses, tokenEarned);
    }

    /**
     * @notice Calculate how much CRV earned by strategy
     * @param _strategyAddress Strategy address (zunami)
     * @param _rewardsAddress Rewards address (convex)
     */
    function getCrvEarned(
        address _strategyAddress,
        address _rewardsAddress
    ) public view returns (uint256 crvAmount) {
        return IConvexRewards(_rewardsAddress).earned(_strategyAddress);
    }

    /**
     * @notice Calculate how much CVX can be claimed for an amount of CRV
     * @param _crvAmount Amount of CRV for which CVX will be minted
     */
    function calculateClaimableCvxForCrv(
        uint256 _crvAmount
    ) public view returns (uint256 cvxAmount) {
        uint256 cvxTotalSupply = CVX.totalSupply();
        uint256 cliff = cvxTotalSupply / CLIFF_SIZE;
        if (cliff >= CLIFF_COUNT) {
            return 0;
        }
        uint256 remaining = CLIFF_COUNT - cliff;
        uint256 cvxEarned = (_crvAmount * remaining) / CLIFF_COUNT;
        uint256 amountTillMax = MAX_CVX_SUPPLY - cvxTotalSupply;
        if (cvxEarned > amountTillMax) {
            cvxEarned = amountTillMax;
        }
        return cvxEarned;
    }

    function _assertNonZero(address _address) internal pure returns (address nonZeroAddress) {
        if (_address == address(0)) {
            revert ZeroAddress();
        }
        return _address;
    }
}
