//SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';
import { Ownable2Step, Ownable } from '@openzeppelin/contracts/access/Ownable2Step.sol';

import '../utils/Constants.sol';
import '../interfaces/ICurveRouter.sol';
import '../interfaces/ITokenConverter.sol';
import 'hardhat/console.sol';

interface IERC20Decimals {
    function decimals() external view returns (uint8);
}

contract TokenConverter is ITokenConverter, Ownable2Step {
    using SafeERC20 for IERC20;

    uint256 public constant SLIPPAGE_DENOMINATOR = 10_000;
    uint256 public constant DEFAULT_SLIPPAGE = 30; // 0.3%

    address public immutable curveRouter;
    mapping(address => mapping(address => CurveRoute)) routes;

    error ZeroAddress();
    error WrongLength();
    error WrongSlippage();
    error BrokenSlippage();

    constructor(address curveRouter_) Ownable(msg.sender) {
        if (curveRouter_ == address(0)) revert ZeroAddress();
        curveRouter = curveRouter_;
    }

    function setRoute(
        address tokenIn,
        address tokenOut,
        address[11] memory route,
        uint256[5][5] memory swapParams
    ) external onlyOwner {
        routes[tokenIn][tokenOut] = CurveRoute(route, swapParams);
    }

    function setRoutes(
        address[] memory tokenIn,
        address[] memory tokenOut,
        address[11][] memory route,
        uint256[5][5][] memory swapParams
    ) external onlyOwner {
        if (tokenIn.length != tokenOut.length) revert WrongLength();
        if (tokenIn.length != route.length) revert WrongLength();
        if (tokenIn.length != swapParams.length) revert WrongLength();

        for (uint256 i; i < tokenIn.length; ++i) {
            routes[tokenIn[i]][tokenOut[i]] = CurveRoute(route[i], swapParams[i]);
        }
    }

    function handle(
        address tokenIn_,
        address tokenOut_,
        uint256 amount_,
        uint256 slippage_
    ) public {
        if (amount_ == 0) return;

        IERC20(tokenIn_).safeTransferFrom(msg.sender, address(this), amount_);
        IERC20(tokenIn_).safeIncreaseAllowance(curveRouter, amount_);
        
        uint256 receivedAmount = ICurveRouterV1(curveRouter).exchange(
            routes[tokenIn_][tokenOut_].route,
            routes[tokenIn_][tokenOut_].swapParams,
            amount_,
            0
        );
        IERC20 tokenOut = IERC20(tokenOut_);
        tokenOut.safeTransfer(msg.sender, tokenOut.balanceOf(address(this)));
    }

    function valuate(
        address tokenIn_,
        address tokenOut_,
        uint256 amount_
    ) public view returns (uint256 valuation) {
        if (amount_ == 0) return 0;

        uint8 decimalsDiff = _calculateDecimalsDiff(tokenIn_, tokenOut_);

        valuation = ICurveRouterV1(curveRouter).get_dy(
            routes[tokenIn_][tokenOut_].route,
            routes[tokenIn_][tokenOut_].swapParams,
            amount_
        );
        if (valuation < _applySlippage(amount_, 0, int8(decimalsDiff))) revert BrokenSlippage();
    }

    function _applySlippage(
        uint256 amount,
        uint256 slippage,
        int8 decimalsDiff
    ) internal pure returns (uint256) {
        if (slippage > SLIPPAGE_DENOMINATOR) revert WrongSlippage();
        if (slippage == 0) slippage = DEFAULT_SLIPPAGE;
        uint256 value = (amount * (SLIPPAGE_DENOMINATOR - slippage));
        if (decimalsDiff < 0) {
            value = value / (10 ** uint8(decimalsDiff * (-1)));
        } else {
            value = value * (10 ** uint8(decimalsDiff));
        }
        return value / SLIPPAGE_DENOMINATOR;
    }

    function _calculateDecimalsDiff(
        address tokenIn_,
        address tokenOut_
    ) internal view returns (uint8) {
        uint8 decimalsTokenIn = IERC20Decimals(tokenIn_).decimals();
        uint8 decimalsTokenOut = IERC20Decimals(tokenOut_).decimals();
        uint8 decimalsDiff = decimalsTokenIn >= decimalsTokenOut
            ? decimalsTokenIn - decimalsTokenOut
            : decimalsTokenOut - decimalsTokenIn;
        return decimalsDiff;
    }
}
