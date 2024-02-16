//SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import '@openzeppelin/contracts/token/ERC20/ERC20.sol';
import '@openzeppelin/contracts/access/AccessControl.sol';
import '@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol';
import '@openzeppelin/contracts/token/ERC20/extensions/ERC20Votes.sol';
import './IERC20Supplied.sol';
import './IERC20UpdateCallback.sol';

contract ZunamiVotingToken is IERC20Supplied, ERC20, AccessControl, ERC20Permit, ERC20Votes {
    error ZeroAddress();

    bytes32 public constant ISSUER_ROLE = keccak256('ISSUER_ROLE');

    IERC20UpdateCallback public updateCallback;

    constructor(
        address defaultAdmin
    ) ERC20('Zunami Voting Token', 'vlZUN') ERC20Permit('Zunami Voting Token') {
        _grantRole(DEFAULT_ADMIN_ROLE, defaultAdmin);
    }

    function setUpdateCallback(address _updateCallback) public onlyRole(ISSUER_ROLE) {
        if (_updateCallback == address(0)) revert ZeroAddress();
        updateCallback = IERC20UpdateCallback(_updateCallback);
    }

    function mint(address to, uint256 amount) public onlyRole(ISSUER_ROLE) {
        _mint(to, amount);
    }

    function burn(uint256 amount) public onlyRole(ISSUER_ROLE) {
        _burn(_msgSender(), amount);
    }

    function burnFrom(address account, uint256 amount) public onlyRole(ISSUER_ROLE) {
        _spendAllowance(account, _msgSender(), amount);
        _burn(account, amount);
    }

    // The following functions are overrides required by Solidity.
    function _update(address from, address to, uint256 value) internal override(ERC20, ERC20Votes) {
        super._update(from, to, value);
        // failed if updateCallback is not set
        updateCallback.onERC20Update(from, to, value);
    }

    function nonces(address owner) public view override(ERC20Permit, Nonces) returns (uint256) {
        return super.nonces(owner);
    }
}
