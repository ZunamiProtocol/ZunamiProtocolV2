//SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';
import '../interfaces/IPoolController.sol';
import '../interfaces/ITokenConverter.sol';

contract ZunamiDepositZap2 {
    using SafeERC20 for IERC20;

    error ZeroAddress();
    error SameAddress();

    uint8 public constant POOL_ASSETS = 5;

    IPool public immutable zunamiPool;
    IPoolController public immutable apsController;
    ITokenConverter public immutable converter;

    constructor(address zunamiPoolAddr, address apsControllerAddr, address tokenConverterAddr) {
        if (
            zunamiPoolAddr == address(0) ||
            apsControllerAddr == address(0) ||
            tokenConverterAddr == address(0)
        ) revert ZeroAddress();
        zunamiPool = IPool(zunamiPoolAddr);
        apsController = IPoolController(apsControllerAddr);
        converter = ITokenConverter(tokenConverterAddr);
    }

    function deposit(
        uint256[POOL_ASSETS] memory amounts,
        address receiver
    ) external returns (uint256 shares) {
        if (receiver == address(0)) {
            receiver = msg.sender;
        }

        IERC20[POOL_ASSETS] memory tokens = zunamiPool.tokens();
        for (uint256 i = 0; i < amounts.length; i++) {
            IERC20 token = tokens[i];
            if (address(token) != address(0) && amounts[i] > 0) {
                token.safeTransferFrom(msg.sender, address(this), amounts[i]);
                token.safeTransfer(address(converter), amounts[i]);
                converter.handle(address(token), address(zunamiPool), amounts[i], 0);
            }
        }

        uint256 zunStableBalance = zunamiPool.balanceOf(address(this));
        IERC20(address(zunamiPool)).safeIncreaseAllowance(address(apsController), zunStableBalance);
        return apsController.deposit([zunStableBalance, 0, 0, 0, 0], receiver);
    }
}
