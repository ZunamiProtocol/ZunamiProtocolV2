// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import '@openzeppelin/contracts/access/Ownable2Step.sol';
import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';
import '../../../interfaces/IGauge.sol';

contract ApproveGauge is IGauge, Ownable2Step {
    using SafeERC20 for IERC20;

    address public immutable RECEIVER;
    IERC20 public immutable TOKEN;

    constructor(address _owner, address _token, address _receiver) Ownable(_owner) {
        require(_token != address(0), 'Zero token address');
        TOKEN = IERC20(_token);
        require(_receiver != address(0), 'Zero receiver address');
        RECEIVER = _receiver;
    }

    function distribute(uint256 amount) external virtual {
        TOKEN.safeIncreaseAllowance(RECEIVER, amount);
    }

    function withdrawEmergency(IERC20 _token) external onlyOwner {
        uint256 tokenBalance = _token.balanceOf(address(this));
        if (tokenBalance > 0) {
            _token.safeTransfer(msg.sender, tokenBalance);
        }
    }
}
