// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.22;

import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/access/Ownable2Step.sol';
import '@openzeppelin/contracts/interfaces/IERC4626.sol';

import '../../interfaces/IOracle.sol';

contract FrxETHOracle is IOracle, Ownable2Step {
    error WrongToken();

    address internal constant FRX_ETH_ADDRESS = 0x5E8422345238F34275888049021821E8E08CAa1f;
    address public constant CHAINLINK_FEED_REGISTRY_ETH_ADDRESS =
        0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;

    IOracle private immutable _genericOracle;

    constructor(address genericOracle) Ownable(msg.sender) {
        _genericOracle = IOracle(genericOracle);
    }

    function isTokenSupported(address token) public view override returns (bool) {
        return token == FRX_ETH_ADDRESS;
    }

    function getUSDPrice(address token) external view returns (uint256) {
        if (!isTokenSupported(token)) revert WrongToken();
        return _genericOracle.getUSDPrice(CHAINLINK_FEED_REGISTRY_ETH_ADDRESS);
    }
}
