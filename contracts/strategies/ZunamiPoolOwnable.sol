//SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import '@openzeppelin/contracts/access/Ownable2Step.sol';
import '../interfaces/IPool.sol';

contract ZunamiPoolOwnable is Ownable2Step {
    error MustBeCalledByZunami();
    error ZeroAddress();
    error MustHaveOwner();

    IPool public zunamiPool;

    event ZunamiPoolSet(address zunamiPoolAddr);

    modifier onlyZunamiPool() {
        if (_msgSender() != address(zunamiPool)) revert MustBeCalledByZunami();
        _;
    }

    constructor() Ownable(msg.sender) {}

    function setZunamiPool(address zunamiAddr) external onlyOwner {
        if (zunamiAddr == address(0)) revert ZeroAddress();
        zunamiPool = IPool(zunamiAddr);
        emit ZunamiPoolSet(zunamiAddr);
    }

    /**
     * @dev disable renounceOwnership for safety
     */
    function renounceOwnership() public view override onlyOwner {
        revert MustHaveOwner();
    }
}
