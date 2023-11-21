//SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';
import '@openzeppelin/contracts/utils/Pausable.sol';
import '@openzeppelin/contracts/access/extensions/AccessControlDefaultAdminRules.sol';

import './ZunamiPoolControllerBase.sol';

contract ZunamiPoolThroughController is ZunamiPoolControllerBase {
    using SafeERC20 for IERC20;

    error OnlyIssuer();

    bytes32 public constant ISSUER_ROLE = keccak256('ISSUER_ROLE');

    address public rewardCollector;
    bool public onlyIssuerMode = false;

    event RewardCollectorChanged(address oldRewardCollector, address newRewardCollector);
    event SetOnlyIssuerMode(bool onlyIssuerMode);

    modifier onlyIssuance() {
        if (onlyIssuerMode && !hasRole(ISSUER_ROLE, msg.sender)) revert OnlyIssuer();
        _;
    }

    constructor(address pool_) ZunamiPoolControllerBase(pool_) {
        rewardCollector = msg.sender;
        _grantRole(ISSUER_ROLE, msg.sender);
    }

    function changeRewardCollector(address _rewardCollector) external onlyRole(DEFAULT_ADMIN_ROLE) {
        emit RewardCollectorChanged(rewardCollector, _rewardCollector);
        rewardCollector = _rewardCollector;
    }

    function setOnlyIssuerMode(bool _onlyIssuerMode) external onlyRole(DEFAULT_ADMIN_ROLE) {
        onlyIssuerMode = _onlyIssuerMode;
        emit SetOnlyIssuerMode(onlyIssuerMode);
    }

    function claimRewards() external whenNotPaused nonReentrant {
        claimPoolRewards(rewardCollector);
    }

    function depositPool(
        uint256[POOL_ASSETS] memory amounts,
        address receiver
    ) internal virtual override onlyIssuance returns (uint256) {
        return depositDefaultPool(amounts, receiver);
    }

    function withdrawPool(
        address user,
        uint256 shares,
        uint256[POOL_ASSETS] memory minTokenAmounts,
        address receiver
    ) internal virtual override onlyIssuance {
        IERC20(address(pool)).safeTransferFrom(user, address(this), shares);
        withdrawDefaultPool(shares, minTokenAmounts, receiver);
    }
}
