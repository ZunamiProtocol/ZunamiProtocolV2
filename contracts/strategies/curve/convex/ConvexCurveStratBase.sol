//SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

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
        if (_cvxBooster == address(0)) revert ZeroAddress();
        cvxBooster = IConvexBooster(_cvxBooster);

        if (_cvxRewardsAddr == address(0)) revert ZeroAddress();
        cvxRewards = IConvexRewards(_cvxRewardsAddr);

        if (_cvxPID == 0) revert ZeroValue();
        cvxPID = _cvxPID;
    }

    function depositBooster(uint256 amount) internal override {
        poolToken.safeIncreaseAllowance(address(cvxBooster), amount);
        if (!cvxBooster.deposit(cvxPID, amount, true)) revert WrongBoosterDepositAll();
    }

    function removeLiquidity(
        uint256 amount,
        uint256[POOL_ASSETS] memory minTokenAmounts,
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
