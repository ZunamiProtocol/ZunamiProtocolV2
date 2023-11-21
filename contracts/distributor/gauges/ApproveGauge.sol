// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import '@openzeppelin/contracts/access/Ownable2Step.sol';
import '@openzeppelin/contracts/token/ERC20/ERC20.sol';
import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';

contract ApproveGauge is Ownable2Step {
    using SafeERC20 for ERC20;

    address public immutable RECEIVER;
    ERC20 public immutable TOKEN;

    constructor(address _owner, address _token, address _receiver) Ownable(_owner) {
        require(_token != address(0), 'Zero token address');
        TOKEN = ERC20(_token);
        require(_receiver != address(0), 'Zero receiver address');
        RECEIVER = _receiver;
    }

    function distribute(uint256 amount) external virtual {
        TOKEN.safeIncreaseAllowance(RECEIVER, amount);
    }

    function withdrawStuckToken(ERC20 _token) external onlyOwner {
        uint256 tokenBalance = _token.balanceOf(address(this));
        if (tokenBalance > 0) {
            _token.safeTransfer(msg.sender, tokenBalance);
        }
    }
}
