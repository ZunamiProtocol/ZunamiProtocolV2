//SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import '@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol';
import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';

import '../utils/Constants.sol';
import '../interfaces/IStableConverter.sol';
import '../interfaces/ICurvePool.sol';

contract StubStableConverter is IStableConverter {
    using SafeERC20 for IERC20Metadata;

    constructor() {}

    function handle(address from, address to, uint256 amount, uint256) public {
        if (amount == 0) return;

        uint256 fromDecimals = IERC20Metadata(from).decimals();

        IERC20Metadata to_ = IERC20Metadata(to);
        uint256 toDecimals = to_.decimals();

        uint256 amountNorm;
        if (fromDecimals == toDecimals) {
            amountNorm = amount;
        } else if (fromDecimals > toDecimals) {
            amountNorm = amount * 10 ** (fromDecimals - toDecimals);
        } else {
            amountNorm = amount * 10 ** (toDecimals - fromDecimals);
        }

        to_.safeTransfer(msg.sender, amountNorm);
    }

    function valuate(address from, address to, uint256 amount) public view returns (uint256) {
        if (amount == 0) return 0;

        uint256 fromDecimals = IERC20Metadata(from).decimals();
        uint256 toDecimals = IERC20Metadata(to).decimals();

        uint256 amountNorm;
        if (fromDecimals == toDecimals) {
            amountNorm = amount;
        } else if (fromDecimals > toDecimals) {
            amountNorm = amount * 10 ** (fromDecimals - toDecimals);
        } else {
            amountNorm = amount * 10 ** (toDecimals - fromDecimals);
        }

        return amountNorm;
    }

    function withdrawStuckToken(IERC20Metadata _token) external {
        uint256 tokenBalance = _token.balanceOf(address(this));
        if (tokenBalance > 0) {
            _token.safeTransfer(msg.sender, tokenBalance);
        }
    }
}
