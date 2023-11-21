//SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';

import '../utils/Constants.sol';
import '../interfaces/IStableConverter.sol';
import '../interfaces/ICurvePool.sol';

contract StableConverter is IStableConverter {
    using SafeERC20 for IERC20;

    error WrongFromStable(address stable);
    error WrongToStable(address stable);

    uint256 public constant SLIPPAGE_DENOMINATOR = 10_000;
    uint256 public constant DEFAULT_SLIPPAGE = 30; // 0.3%

    address[3] public SUPPORTED_STABLES = [
        Constants.DAI_ADDRESS,
        Constants.USDC_ADDRESS,
        Constants.USDT_ADDRESS
    ];

    ICurvePool public immutable curve3Pool;

    mapping(address => int128) public curve3PoolStableIndex;
    mapping(address => int8) public curve3PoolStableDecimals;

    constructor() {
        curve3Pool = ICurvePool(Constants.CRV_3POOL_ADDRESS);

        curve3PoolStableIndex[Constants.DAI_ADDRESS] = 0; //DAI
        curve3PoolStableDecimals[Constants.DAI_ADDRESS] = 18;

        curve3PoolStableIndex[Constants.USDC_ADDRESS] = 1; //USDC
        curve3PoolStableDecimals[Constants.USDC_ADDRESS] = 6;

        curve3PoolStableIndex[Constants.USDT_ADDRESS] = 2; //USDT
        curve3PoolStableDecimals[Constants.USDT_ADDRESS] = 6;
    }

    function isStableSupported(address stable) public view returns (bool) {
        return
            stable == SUPPORTED_STABLES[0] ||
            stable == SUPPORTED_STABLES[1] ||
            stable == SUPPORTED_STABLES[2];
    }

    function handle(address from, address to, uint256 amount, uint256 slippage) public {
        if (!isStableSupported(from)) revert WrongFromStable(from);
        if (!isStableSupported(to)) revert WrongToStable(to);

        if (amount == 0) return;

        IERC20(from).safeIncreaseAllowance(address(curve3Pool), amount);

        curve3Pool.exchange(
            curve3PoolStableIndex[from],
            curve3PoolStableIndex[to],
            amount,
            applySlippage(
                amount,
                slippage,
                curve3PoolStableDecimals[to] - curve3PoolStableDecimals[from]
            )
        );
        IERC20 to_ = IERC20(to);
        to_.safeTransfer(address(msg.sender), to_.balanceOf(address(this)));
    }

    function valuate(address from, address to, uint256 amount) public view returns (uint256) {
        if (!isStableSupported(from)) revert WrongFromStable(from);
        if (!isStableSupported(to)) revert WrongToStable(to);

        if (amount == 0) return 0;
        return curve3Pool.get_dy(curve3PoolStableIndex[from], curve3PoolStableIndex[to], amount);
    }

    function applySlippage(
        uint256 amount,
        uint256 slippage,
        int8 decimalsDiff
    ) internal pure returns (uint256) {
        require(slippage <= SLIPPAGE_DENOMINATOR, 'Wrong slippage');
        if (slippage == 0) slippage = DEFAULT_SLIPPAGE;
        uint256 value = (amount * (SLIPPAGE_DENOMINATOR - slippage));
        if (decimalsDiff < 0) {
            value = value / (10 ** uint8(decimalsDiff * (-1)));
        } else {
            value = value * (10 ** uint8(decimalsDiff));
        }
        return value / SLIPPAGE_DENOMINATOR;
    }
}
