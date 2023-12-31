//SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import '../CurveStratBase.sol';
import './interfaces/IConvexRewards.sol';
import './interfaces/IConvexBooster.sol';

abstract contract ConvexCurveStratBase is CurveStratBase {
    using SafeERC20 for IERC20;

    error WrongBoosterDepositAll();

    uint256 public immutable cvxPID;
    IConvexBooster public immutable cvxBooster;
    IConvexRewards public immutable cvxRewards;

    constructor(
        IERC20[POOL_ASSETS] memory _tokens,
        uint256[POOL_ASSETS] memory _tokenDecimalsMultipliers,
        address _poolAddr,
        address _poolTokenAddr,
        address _cvxBooster,
        address _cvxRewardsAddr,
        uint256 _cvxPID
    ) CurveStratBase(_tokens, _tokenDecimalsMultipliers, _poolAddr, _poolTokenAddr) {
        cvxBooster = IConvexBooster(_cvxBooster);
        cvxRewards = IConvexRewards(_cvxRewardsAddr);
        cvxPID = _cvxPID;
    }

    function depositBooster(uint256 amount) internal override {
        poolToken.safeIncreaseAllowance(address(cvxBooster), amount);
        if (!cvxBooster.depositAll(cvxPID, true)) revert WrongBoosterDepositAll();
    }

    function removeLiquidity(
        uint256 amount,
        uint256[5] memory minTokenAmounts,
        bool removeAll
    ) internal virtual override {
        if (removeAll) {
            cvxRewards.withdrawAllAndUnwrap(true);
        } else {
            cvxRewards.withdrawAndUnwrap(amount, false);
        }

        super.removeLiquidity(amount, minTokenAmounts, removeAll);
    }

    function claimCollectedRewards() internal virtual override {
        cvxRewards.getReward();
    }
}
