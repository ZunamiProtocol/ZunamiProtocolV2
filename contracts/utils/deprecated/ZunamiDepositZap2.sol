//SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';
import '../../interfaces/IPoolController.sol';
import '../../interfaces/ITokenConverter.sol';
import '../../utils/Constants.sol';

contract ZunamiDepositZap2 {
    using SafeERC20 for IERC20;

    error ZeroAddress();
    error SameAddress();

    uint8 public constant POOL_ASSETS = 5;

    uint256 constant ZUNAMI_CRVUSD_TOKEN_ID = 3;

    uint256 public constant MIN_AMOUNT_DENOMINATOR = 10000;
    uint256 public constant MIN_AMOUNT = 9950; // 99.50%

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
        uint256[POOL_ASSETS] memory tokenDecimalsMultipliers = zunamiPool
            .tokenDecimalsMultipliers();
        for (uint256 i = 0; i < amounts.length; ++i) {
            uint256 amount = amounts[i];
            IERC20 token = tokens[i];
            uint256 tokenDecimalsMultiplier = tokenDecimalsMultipliers[i];
            if (i == ZUNAMI_CRVUSD_TOKEN_ID) {
                token = IERC20(Constants.CRVUSD_ADDRESS);
                tokenDecimalsMultiplier = 1;
            }
            if (address(token) != address(0) && amount > 0) {
                token.safeTransferFrom(msg.sender, address(this), amount);
                token.safeTransfer(address(converter), amount);
                converter.handle(
                    address(token),
                    address(zunamiPool),
                    amount,
                    (amount * tokenDecimalsMultiplier * MIN_AMOUNT) / MIN_AMOUNT_DENOMINATOR
                );
            }
        }

        uint256 zunStableBalance = zunamiPool.balanceOf(address(this));
        IERC20(address(zunamiPool)).safeIncreaseAllowance(address(apsController), zunStableBalance);
        return apsController.deposit([zunStableBalance, 0, 0, 0, 0], receiver);
    }
}
