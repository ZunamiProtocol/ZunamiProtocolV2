// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import { IRewardManager } from '../interfaces/IRewardManager.sol';
import { IERC20 } from '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import { SafeERC20 } from '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';
import { Constants } from '../utils/Constants.sol';

/**
 * @title StubZunToRewardManager contract
 * @notice Stub implementation of reward manager for converting from `ZUN_TOKEN` to `reward`
 */
contract StubZunToDAITokenManager is IRewardManager {
    using SafeERC20 for IERC20;

    IERC20 public immutable ZUN_TOKEN;
    address public immutable SPONSOR;

    constructor(IERC20 _zunToken, address _sponsor) {
        if (address(0) == address(_zunToken)) revert('Zero address');
        ZUN_TOKEN = _zunToken;
        SPONSOR = _sponsor;
    }

    /**
     * @dev Transfer provided `_amount` of `_reward` tokens to `msg.sender` (1:1 converting)
     * Need to impersonate account to transfer `_reward` tokens approve required `_amount` during testing
     */
    function handle(address _reward, uint256 _amount, address _receivingToken) external override {
        if (_reward != address(ZUN_TOKEN)) revert('Reward should be zun token');
        if (_receivingToken != Constants.DAI_ADDRESS) revert('Receiving token should be DAI');
        IERC20(_receivingToken).safeTransferFrom(SPONSOR, address(msg.sender), _amount);
    }

    function valuate(
        address _reward,
        uint256 _amount,
        address _receivingToken
    ) external view override returns (uint256) {
        if (_reward != address(ZUN_TOKEN)) revert('Reward should be zun token');
        if (_receivingToken != Constants.DAI_ADDRESS) revert('Receiving token should be DAI');
        return _amount;
    }
}
