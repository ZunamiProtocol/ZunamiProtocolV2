//SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import '@openzeppelin/contracts/access/AccessControl.sol';
import '../interfaces/IPool.sol';

contract ZunamiPoolAccessControl is AccessControl {
    error MustBeCalledByZunamiPool();
    error ZeroAddress();
    error ZeroValue();
    error MustHaveOwner();

    IPool public zunamiPool;

    event ZunamiPoolSet(address zunamiPoolAddr);

    modifier onlyZunamiPool() {
        if (_msgSender() != address(zunamiPool)) revert MustBeCalledByZunamiPool();
        _;
    }

    constructor() {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    function setZunamiPool(address zunamiAddr) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (zunamiAddr == address(0)) revert ZeroAddress();
        zunamiPool = IPool(zunamiAddr);
        emit ZunamiPoolSet(zunamiAddr);
    }
}
