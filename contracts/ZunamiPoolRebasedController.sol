//SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import '@openzeppelin/contracts/token/ERC20/ERC20.sol';
import '@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol';
import '@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol';
import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';
import '@openzeppelin/contracts/utils/Pausable.sol';
import '@openzeppelin/contracts/access/extensions/AccessControlDefaultAdminRules.sol';

import './interfaces/IStrategy.sol';
import './interfaces/IPool.sol';
import './interfaces/IRewardManager.sol';

import './Constants.sol';

abstract contract ZunamiPoolRebasedController is
    ERC20,
    ERC20Permit,
    Pausable,
    AccessControlDefaultAdminRules
{
    // TODO: implement rebasing token changing balance instead of changing shares price
}
