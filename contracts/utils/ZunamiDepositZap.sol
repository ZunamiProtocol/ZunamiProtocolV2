//SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';
import '../interfaces/IPoolController.sol';

contract ZunamiDepositZap {
    using SafeERC20 for IERC20;

    error ZeroAddress();
    error SameAddress();

    uint8 public constant POOL_ASSETS = 5;

    IPoolController public omnipoolController;
    IPoolController public apsController;

    constructor(address omnipoolControllerAddr, address apsControllerAddr) {
        if (omnipoolControllerAddr == address(0) || apsControllerAddr == address(0))
            revert ZeroAddress();
        if (omnipoolControllerAddr == apsControllerAddr) revert SameAddress();
        omnipoolController = IPoolController(omnipoolControllerAddr);
        apsController = IPoolController(apsControllerAddr);
    }

    function deposit(
        uint256[POOL_ASSETS] memory amounts,
        address receiver
    ) external returns (uint256 shares) {
        if (receiver == address(0)) {
            receiver = msg.sender;
        }

        IPool omnipool = omnipoolController.pool();
        IERC20[POOL_ASSETS] memory tokens = omnipool.tokens();
        for (uint256 i = 0; i < amounts.length; i++) {
            IERC20 token = tokens[i];
            if (address(token) != address(0) && amounts[i] > 0) {
                IERC20(tokens[i]).safeTransferFrom(msg.sender, address(this), amounts[i]);
                IERC20(tokens[i]).safeIncreaseAllowance(address(omnipoolController), amounts[i]);
            }
        }

        omnipoolController.deposit(amounts, address(this));

        uint256 zunStableAmount = IERC20(address(omnipool)).balanceOf(address(this));

        IERC20(address(omnipool)).safeIncreaseAllowance(address(apsController), zunStableAmount);
        return apsController.deposit([zunStableAmount, 0, 0, 0, 0], receiver);
    }
}
