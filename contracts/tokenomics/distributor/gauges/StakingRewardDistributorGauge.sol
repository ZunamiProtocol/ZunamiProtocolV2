// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import '@openzeppelin/contracts/token/ERC20/ERC20.sol';
import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';
import '../../staking/IStakingRewardDistributor.sol';
import '../../../interfaces/IGauge.sol';

contract StakingRewardDistributorGauge is IGauge {
    using SafeERC20 for ERC20;

    IStakingRewardDistributor public immutable REWARD_DISTRIBUTOR;
    ERC20 public immutable TOKEN;
    uint256 public immutable TID;

    constructor(address _token, address _rewardDistributor, uint256 _tid) {
        require(_token != address(0), 'Zero token address');
        TOKEN = ERC20(_token);

        require(_rewardDistributor != address(0), 'Zero receiver address');
        REWARD_DISTRIBUTOR = IStakingRewardDistributor(_rewardDistributor);

        TID = _tid;
    }

    function distribute(uint256 amount) external virtual {
        TOKEN.safeIncreaseAllowance(address(REWARD_DISTRIBUTOR), amount);
        REWARD_DISTRIBUTOR.distribute(TID, amount);
    }
}
