// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {Ownable2Step, Ownable} from '@openzeppelin/contracts/access/Ownable2Step.sol';
import {IERC20} from '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import {SafeERC20} from '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';
import {IGauge} from '../../../interfaces/IGauge.sol';
import {IVotemarket} from "../../../interfaces/IVotemarket.sol";

contract VotemarketGauge is IGauge, Ownable2Step {
    using SafeERC20 for IERC20;

    error ZeroAddress();
    error InvalidBountyRewardToken(address token, address bountyRewardToken);
    error ZeroMaxPricePerVote();

    event ZeroDistributionAmount();
    event WithdrawnEmergency(address token, uint256 amount);
    event SetAdditionalPeriods(uint8 additionalPeriods);
    event SetMaxPricePerVote(uint256 maxPricePerVote);
    event VotemarketIncreasedBountyDuration(
        uint256 bountyId,
        uint8 additionnalPeriods,
        uint256 increasedAmount,
        uint256 newMaxPricePerVote
    );
    event VotemarketIncreaseBountyDurationFailed();

    // https://votemarket.stakedao.org/
    IVotemarket public constant VOTEMARKET = IVotemarket(0x0000000895cB182E6f983eb4D8b4E0Aa0B31Ae4c);
    IERC20 public immutable TOKEN;
    uint256 public immutable BOUNTY_ID;

    uint8 public additionalPeriods = 1;
    uint256 public maxPricePerVote;

    constructor(
        address _token,
        uint256 _bountyId
    ) Ownable(msg.sender) {
        _assertNonZero(_token);
        TOKEN = IERC20(_token);

        IVotemarket.Bounty memory bounty = VOTEMARKET.getBounty(_bountyId);
        if (bounty.rewardToken != _token) revert InvalidBountyRewardToken(_token, bounty.rewardToken);
        BOUNTY_ID = _bountyId;
    }

    function distribute(uint256 _amount) external {
        if (_amount == 0) {
            emit ZeroDistributionAmount();
            return;
        }
        if (maxPricePerVote == 0) revert ZeroMaxPricePerVote();

        TOKEN.safeIncreaseAllowance(address(VOTEMARKET), _amount);
        try VOTEMARKET.increaseBountyDuration(BOUNTY_ID, additionalPeriods, _amount, maxPricePerVote) {
        } catch {
            emit VotemarketIncreaseBountyDurationFailed();
            return;
        }

        emit VotemarketIncreasedBountyDuration(BOUNTY_ID, additionalPeriods, _amount, maxPricePerVote);

        // max price per vote is reset after each distribution
        maxPricePerVote = 0;
    }

    function withdrawEmergency(IERC20 _token) external onlyOwner {
        _assertNonZero(address(_token));

        uint256 tokenBalance = _token.balanceOf(address(this));
        if (tokenBalance > 0) {
            _token.safeTransfer(msg.sender, tokenBalance);
        }

        emit WithdrawnEmergency(address(_token), tokenBalance);
    }

    function setAdditionalPeriods(uint8 _additionalPeriods) external onlyOwner {
        additionalPeriods = _additionalPeriods;

        emit SetAdditionalPeriods(_additionalPeriods);
    }

    function setMaxPricePerVote(uint256 _maxPricePerVote) external onlyOwner {
        maxPricePerVote = _maxPricePerVote;

        emit SetMaxPricePerVote(_maxPricePerVote);
    }

    function _assertNonZero(address _address) internal pure {
        if (_address == address(0)) revert ZeroAddress();
    }
}
