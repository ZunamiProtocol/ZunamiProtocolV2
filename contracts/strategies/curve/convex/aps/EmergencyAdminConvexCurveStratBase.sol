//SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import '../ConvexCurveStratBase.sol';

abstract contract EmergencyAdminConvexCurveStratBase is ConvexCurveStratBase {
    bytes32 public constant EMERGENCY_ADMIN_ROLE = keccak256('EMERGENCY_ADMIN_ROLE');

    constructor(
        IERC20[POOL_ASSETS] memory _tokens,
        uint256[POOL_ASSETS] memory _tokenDecimalsMultipliers,
        address _poolAddr,
        address _poolLpAddr,
        address _cvxBooster,
        address _cvxRewardsAddr,
        uint256 _cvxPID
    )
        ConvexCurveStratBase(
            _tokens,
            _tokenDecimalsMultipliers,
            _poolAddr,
            _poolLpAddr,
            _cvxBooster,
            _cvxRewardsAddr,
            _cvxPID
        )
    {
        _grantRole(EMERGENCY_ADMIN_ROLE, msg.sender);
    }

    function inflate(
        uint256 ratioOfCrvLps,
        uint256 minInflatedAmount
    ) external onlyRole(EMERGENCY_ADMIN_ROLE) {
        _inflate(ratioOfCrvLps, minInflatedAmount);
    }

    function _inflate(uint256 ratioOfCrvLps, uint256 minInflatedAmount) internal virtual;

    function deflate(
        uint256 ratioOfCrvLps,
        uint256 minDeflateAmount
    ) external onlyRole(EMERGENCY_ADMIN_ROLE) {
        _deflate(ratioOfCrvLps, minDeflateAmount);
    }

    function _deflate(uint256 ratioOfCrvLps, uint256 minDeflateAmount) internal virtual;
}
