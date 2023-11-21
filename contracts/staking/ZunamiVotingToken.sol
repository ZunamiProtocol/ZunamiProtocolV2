//SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/token/ERC20/ERC20.sol';
import '@openzeppelin/contracts/access/AccessControl.sol';
import '@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol';
import '@openzeppelin/contracts/token/ERC20/extensions/ERC20Votes.sol';
import './IERC20Supplied.sol';

contract ZunamiVotingToken is IERC20Supplied, ERC20, AccessControl, ERC20Permit, ERC20Votes {
    bytes32 public constant ISSUER_ROLE = keccak256('ISSUER_ROLE');

    constructor(
        address defaultAdmin
    ) ERC20('Zunami Voting Token', 'vlZUN') ERC20Permit('Zunami Voting Token') {
        _grantRole(DEFAULT_ADMIN_ROLE, defaultAdmin);
    }

    function mint(address to, uint256 amount) public onlyRole(ISSUER_ROLE) {
        _mint(to, amount);
    }

    function burn(uint256 value) public onlyRole(ISSUER_ROLE) {
        _burn(_msgSender(), value);
    }

    // The following functions are overrides required by Solidity.
    function _update(address from, address to, uint256 value) internal override(ERC20, ERC20Votes) {
        super._update(from, to, value);
    }

    function nonces(address owner) public view override(ERC20Permit, Nonces) returns (uint256) {
        return super.nonces(owner);
    }
}
