//SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import '../CurveStratBase.sol';
import './interfaces/IConvexRewards.sol';
import './interfaces/IConvexBooster.sol';

abstract contract ConvexCurveStratBase is CurveStratBase {
    using SafeERC20 for IERC20Metadata;

    uint256 public immutable cvxPID;
    IConvexBooster public immutable cvxBooster;
    IConvexRewards public immutable cvxRewards;

    constructor(
        address _poolAddr,
        address _poolTokenAddr,
        address _oracleAddr,
        address _cvxBooster,
        address _cvxRewardsAddr,
        uint256 _cvxPID
    ) CurveStratBase(_poolAddr, _poolTokenAddr, _oracleAddr) {
        cvxBooster = IConvexBooster(_cvxBooster);
        cvxRewards = IConvexRewards(_cvxRewardsAddr);
        cvxPID = _cvxPID;
    }

    function depositLiquidity(uint256 amount) internal override {
        poolToken.safeIncreaseAllowance(address(cvxBooster), amount);
        cvxBooster.depositAll(cvxPID, true);
    }

    function removeLiquidity(
        uint256 amount,
        uint256[5] memory minTokenAmounts
    ) internal virtual override {
        cvxRewards.withdrawAndUnwrap(amount, false);
        super.removeLiquidity(amount, minTokenAmounts);
    }

    function removeAllLiquidity() internal virtual override {
        cvxRewards.withdrawAllAndUnwrap(true);
        super.removeAllLiquidity();
    }

    function claimCollectedRewards() internal virtual override {
        cvxRewards.getReward();
    }

    function getLiquidityBalance() internal view virtual override returns (uint256) {
        return cvxRewards.balanceOf(address(this));
    }
}
