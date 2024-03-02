// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import '@openzeppelin/contracts/access/Ownable2Step.sol';
import '@openzeppelin/contracts/utils/Pausable.sol';
import '@openzeppelin/contracts/token/ERC20/ERC20.sol';
import '@openzeppelin/contracts/token/ERC20/extensions/ERC20Votes.sol';
import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';
import '@openzeppelin/contracts/utils/Nonces.sol';
import { EIP712 } from '@openzeppelin/contracts/utils/cryptography/EIP712.sol';
import { SignatureChecker } from '@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol';
import '@openzeppelin/contracts/utils/ReentrancyGuard.sol';
import '../../interfaces/IGauge.sol';

contract ZunDistributor is Ownable2Step, Pausable, EIP712, Nonces, ReentrancyGuard {
    using SafeERC20 for ERC20;

    bytes32 public constant BALLOT_TYPEHASH =
        keccak256(
            'Ballot(bytes32 gaugeIdsHash,bytes32 amountsHash,address voter,uint256 nonce,uint256 deadline)'
        );

    uint256 public constant VOTING_PERIOD = (14 * 24 * 60 * 60) / 12; // 2 week in blocks
    uint256 public constant ANNUAL_DECREASE_PERCENT = 35; // 35%
    uint256 public constant FIRST_YEAR_DISTRIBUTION_VALUE = 11_200_000 * 1e18; // in tokens
    uint256 public constant DENOMINATOR = 100;
    uint256 public constant BLOCKS_IN_YEAR = (364 * 24 * 60 * 60) / 12;

    uint256 public immutable START_BLOCK;

    struct Gauge {
        address addr;
        uint256 finalizedVotes;
        uint256 currentVotes;
    }

    Gauge[] public gauges;

    ERC20Votes public immutable voteToken;
    ERC20 public immutable token;

    uint256 public votingThreshold; // in tokens

    mapping(uint256 => mapping(address => uint256)) public usedVotes;
    uint256 public lastDistributionBlock;
    uint256 public lastFinalizeBlock;

    event VoteCast(address voter, uint256 totalVotes);
    event Distributed(uint256 totalDistributed);
    event GaugeAdded(address gauge);
    event GaugeDeleted(uint256 gaugeId);
    event VotingFinalized(bool isQuorumReached);
    event VotingThresholdChanged(uint256 newThreshold);
    event DistributionStopped(uint256 remainingValue);

    error ZeroAddress();
    error WrongGaugeId();
    error WrongLength();
    error InsufficientVotePower();
    error DistributionAlreadyHappened();
    error StartBlockInFuture();
    error InvalidSignature();
    error ExpiredSignature();
    error WrongVotingThreshold();
    error InvalidGaugeImplementation(address gauge);
    error GaugeAlreadyExists(address gauge);

    modifier afterStart() {
        if (block.number <= START_BLOCK) {
            revert StartBlockInFuture();
        }
        _;
    }

    constructor(
        address _token,
        address _voteToken,
        address _owner,
        uint256 _startBlock,
        address[] memory _gaugeAddrs,
        uint256[] memory _gaugeVotes
    ) Ownable(_owner) EIP712('ZunamiDistributor', '1') {
        if (_token == address(0)) {
            revert ZeroAddress();
        }
        token = ERC20(_token);
        if (_voteToken == address(0)) {
            revert ZeroAddress();
        }
        voteToken = ERC20Votes(_voteToken);

        if (_startBlock < block.number) {
            _startBlock = block.number;
        }
        START_BLOCK = _startBlock;
        lastDistributionBlock = _startBlock;
        lastFinalizeBlock = _startBlock;

        // init gauges
        if (_gaugeAddrs.length != _gaugeVotes.length) {
            revert WrongLength();
        }
        for (uint256 i; i < _gaugeAddrs.length; ++i) {
            address gaugeAddr = _gaugeAddrs[i];
            if (gaugeAddr == address(0)) revert ZeroAddress();
            gauges.push(Gauge(gaugeAddr, _gaugeVotes[i], 0));
        }
    }

    function gaugesLength() external view returns (uint256) {
        return gauges.length;
    }

    function castVote(
        uint256[] calldata gaugeIds,
        uint256[] calldata amounts
    ) external afterStart whenNotPaused returns (uint256) {
        return _castVote(msg.sender, gaugeIds, amounts);
    }

    function castVoteBySig(
        uint256[] calldata gaugeIds,
        uint256[] calldata amounts,
        address voter,
        uint256 deadline,
        bytes calldata signature
    ) external afterStart whenNotPaused returns (uint256) {
        if (deadline < block.timestamp) {
            revert ExpiredSignature();
        }
        bool valid = SignatureChecker.isValidSignatureNow(
            voter,
            _hashTypedDataV4(
                keccak256(
                    abi.encode(
                        BALLOT_TYPEHASH,
                        keccak256(abi.encode(gaugeIds)),
                        keccak256(abi.encode(amounts)),
                        voter,
                        _useNonce(voter),
                        deadline
                    )
                )
            ),
            signature
        );

        if (!valid) {
            revert InvalidSignature();
        }

        return _castVote(voter, gaugeIds, amounts);
    }

    function _castVote(
        address voter,
        uint256[] calldata gaugeIds,
        uint256[] calldata amounts
    ) internal returns (uint256 totalVotes) {
        if (gaugeIds.length != amounts.length) {
            revert WrongLength();
        }
        if (_isPeriodPassed(lastFinalizeBlock)) {
            _finalizeVotingPeriod();
        }

        // update votes' counters
        for (uint256 i; i < gaugeIds.length; ++i) {
            uint256 gaugeId = gaugeIds[i];
            uint256 amount = amounts[i];
            if (gaugeId >= gauges.length) {
                revert WrongGaugeId();
            }
            gauges[gaugeId].currentVotes += amount;
            totalVotes += amount;
        }

        // check vote power
        uint256 borderBlock = lastFinalizeBlock -
            ((lastFinalizeBlock - START_BLOCK) % VOTING_PERIOD); // last block in previous period
        uint256 userVotes = voteToken.getPastVotes(voter, borderBlock);
        if (userVotes - usedVotes[borderBlock][voter] < totalVotes) {
            revert InsufficientVotePower();
        }
        usedVotes[borderBlock][voter] += totalVotes;

        emit VoteCast(voter, totalVotes);
    }

    function distribute()
        external
        afterStart
        whenNotPaused
        nonReentrant
        returns (uint256 totalDistributed)
    {
        if (!_isPeriodPassed(lastDistributionBlock)) {
            revert DistributionAlreadyHappened();
        }
        lastDistributionBlock = block.number;

        if (_isPeriodPassed(lastFinalizeBlock)) {
            _finalizeVotingPeriod();
        }

        uint256 gaugesLength_ = gauges.length;
        uint256 totalVotes;
        for (uint256 i; i < gaugesLength_; ++i) {
            totalVotes += gauges[i].finalizedVotes;
        }
        uint256 amount;
        for (uint256 i; i < gaugesLength_; ++i) {
            Gauge memory gauge = gauges[i];
            amount = (_periodDistributionValue() * gauge.finalizedVotes) / totalVotes;
            if (amount == 0) {
                continue;
            }
            token.safeTransfer(gauge.addr, amount);
            IGauge(gauge.addr).distribute(amount);
            totalDistributed += amount;
        }

        emit Distributed(totalDistributed);
    }

    function stopDistribution() external onlyOwner whenNotPaused returns (uint256 value) {
        value = token.balanceOf(address(this));
        token.safeTransfer(msg.sender, value);
        _pause();
        emit DistributionStopped(value);
    }

    function addGauge(address newGauge) external onlyOwner whenNotPaused {
        if (newGauge == address(0)) {
            revert ZeroAddress();
        }
        if (newGauge.code.length == 0) {
            revert InvalidGaugeImplementation(newGauge);
        }

        for (uint256 i = 0; i < gauges.length; i++) {
            if (gauges[i].addr == newGauge) {
                revert GaugeAlreadyExists(newGauge);
            }
        }

        gauges.push(Gauge(newGauge, 0, 0));
        emit GaugeAdded(newGauge);
    }

    // don't forget update gauges' indexes on frontend
    function deleteGauge(uint256 gaugeId) external onlyOwner whenNotPaused {
        uint256 gaugesLength_ = gauges.length;
        if (gaugeId >= gaugesLength_) {
            revert WrongGaugeId();
        }
        for (uint256 i = gaugeId; i < gaugesLength_ - 1; i++) {
            gauges[i] = gauges[i + 1];
        }
        gauges.pop();
        emit GaugeDeleted(gaugeId);
    }

    function setVotingThreshold(uint256 _threshold) external onlyOwner whenNotPaused {
        if (_threshold > voteToken.totalSupply()) {
            revert WrongVotingThreshold();
        }
        votingThreshold = _threshold;
        emit VotingThresholdChanged(_threshold);
    }

    /**
     * @dev Allows the owner to withdraw stuck tokens from the contract.
     * @param _token The ERC20 token to withdraw from.
     * @param _amount The amount of tokens to withdraw. Use type(uint256).max to withdraw all tokens.
     * @notice Only the owner can withdraw tokens.
     * @notice If _amount is set to type(uint256).max, it withdraws all tokens held by the contract.
     */
    function withdrawStuckToken(ERC20 _token, uint256 _amount) external onlyOwner {
        uint256 withdrawAmount = _amount == type(uint256).max
            ? _token.balanceOf(address(this))
            : _amount;
        if (withdrawAmount > 0) {
            _token.safeTransfer(msg.sender, withdrawAmount);
        }
    }

    function _yearDistributionValue() internal view returns (uint256 value) {
        uint256 yearCount = (block.number - VOTING_PERIOD - START_BLOCK) / BLOCKS_IN_YEAR;
        value =
            (FIRST_YEAR_DISTRIBUTION_VALUE *
                (DENOMINATOR - ANNUAL_DECREASE_PERCENT) ** (yearCount)) /
            DENOMINATOR ** (yearCount); // overflow after 29 years - it's ok
    }

    function _periodDistributionValue() internal view returns (uint256 value) {
        value = (_yearDistributionValue() * VOTING_PERIOD) / BLOCKS_IN_YEAR;
    }

    function _finalizeVotingPeriod() internal {
        uint256 gaugesLength_ = gauges.length;
        // update last votes if quorum reached
        uint256 totalVotes;
        for (uint256 i; i < gaugesLength_; ++i) {
            totalVotes += gauges[i].currentVotes;
        }
        if (totalVotes >= votingThreshold && totalVotes > 0) {
            for (uint256 i; i < gaugesLength_; ++i) {
                Gauge storage gauge = gauges[i];
                gauge.finalizedVotes = gauge.currentVotes;
                // reset current votes counters
                gauge.currentVotes = 0;
            }
        } else {
            for (uint256 i; i < gaugesLength_; ++i) {
                gauges[i].currentVotes = 0;
            }
        }

        lastFinalizeBlock = block.number;
        emit VotingFinalized(totalVotes >= votingThreshold);
    }

    function _isPeriodPassed(uint256 lastBlock) internal view returns (bool) {
        return
            (block.number - START_BLOCK) / VOTING_PERIOD >
            (lastBlock - START_BLOCK) / VOTING_PERIOD;
    }
}
