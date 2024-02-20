// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import { IRewardManager } from '../interfaces/IRewardManager.sol';
import { IERC20 } from '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import { SafeERC20 } from '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';

/**
 * @title StubZunRewardManager contract
 * @notice Stub implementation of reward manager for converting from `reward` to `ZUN_TOKEN`
 */
contract StubRewardToZunManager is IRewardManager {
    using SafeERC20 for IERC20;

    IERC20 public immutable ZUN_TOKEN;
    address public immutable ZUN_TOKEN_HOLDER;

    constructor(IERC20 _zunToken, address _zunTokenHolder) {
        if (address(0) == address(_zunToken)) revert('Zero address');
        ZUN_TOKEN = _zunToken;
        ZUN_TOKEN_HOLDER = _zunTokenHolder;
    }

    /**
     * @dev Transfer provided `_amount` of ZUN tokens to `msg.sender` (1:1 converting)
     * Need to approve required `_amount` from `ZUN_TOKEN_HOLDER` during testing
     */
    function handle(address, uint256 _amount, address _receivingToken) external override {
        if (_receivingToken != address(ZUN_TOKEN)) revert('Receiving token should be zun token');
        IERC20(_receivingToken).safeTransferFrom(ZUN_TOKEN_HOLDER, address(msg.sender), _amount);
    }

    function valuate(
        address,
        uint256 _amount,
        address _receivingToken
    ) external view override returns (uint256) {
        if (_receivingToken != address(ZUN_TOKEN)) revert('Receiving token should be zun token');
        return _amount;
    }
}
