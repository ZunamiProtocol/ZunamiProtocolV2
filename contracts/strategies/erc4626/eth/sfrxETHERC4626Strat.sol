//SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import '../../../utils/Constants.sol';
import './EthERC4626StratBase.sol';

contract sfrxETHERC4626Strat is EthERC4626StratBase {
    constructor()
        EthERC4626StratBase(
            [
                IERC20(Constants.WETH_ADDRESS),
                IERC20(Constants.FRX_ETH_ADDRESS),
                IERC20(address(0)),
                IERC20(address(0)),
                IERC20(address(0))
            ],
            [uint256(1), 1, 0, 0, 0],
            Constants.SFRXETH_ADDRESS,
            Constants.FRX_ETH_ADDRESS
        )
    {}
}
