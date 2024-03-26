//SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';
import { Ownable2Step, Ownable } from '@openzeppelin/contracts/access/Ownable2Step.sol';
import '../utils/Constants.sol';
import '../interfaces/ICurveRouter.sol';
import '../interfaces/ITokenConverter.sol';

contract TokenConverter is ITokenConverter, Ownable2Step {
    using SafeERC20 for IERC20;

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
        uint256 minAmountOut
    ) public {
        if (amount_ == 0) return;

        IERC20(tokenIn_).safeTransferFrom(msg.sender, address(this), amount_);
        IERC20(tokenIn_).safeIncreaseAllowance(curveRouter, amount_);

        ICurveRouterV1(curveRouter).exchange(
            routes[tokenIn_][tokenOut_].route,
            routes[tokenIn_][tokenOut_].swapParams,
            amount_,
            minAmountOut
        );
        IERC20 tokenOut = IERC20(tokenOut_);
        tokenOut.safeTransfer(msg.sender, tokenOut.balanceOf(address(this)));
    }
}
