// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import '@openzeppelin/contracts/access/Ownable2Step.sol';
import '@openzeppelin/contracts/utils/Pausable.sol';
import '@openzeppelin/contracts/token/ERC20/ERC20.sol';
import '@openzeppelin/contracts/token/ERC20/extensions/ERC20Votes.sol';
import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';
import '@openzeppelin/contracts/utils/Nonces.sol';
import { EIP712 } from '@openzeppelin/contracts/utils/cryptography/EIP712.sol';
import { SignatureChecker } from '@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol';
import '@openzeppelin/contracts/utils/ReentrancyGuard.sol';
import '../interfaces/IGauge.sol';

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

    uint256 public gaugesNumber;
    mapping(uint256 => Gauge) public gauges;

    ERC20Votes public voteToken;
    ERC20 public token;

    uint256 public votingThreshold; // in tokens

    mapping(uint256 => mapping(address => uint256)) public usedVotes;
    uint256 public lastDistributionBlock;
    uint256 public lastFinalizeBlock;

    event VoteCasted(address voter, uint256 totalVotes);
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
            gauges[i] = Gauge(_gaugeAddrs[i], _gaugeVotes[i], 0);
        }
        gaugesNumber = _gaugeAddrs.length;
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
            if (gaugeIds[i] >= gaugesNumber) {
                revert WrongGaugeId();
            }
            gauges[gaugeIds[i]].currentVotes += amounts[i];
            totalVotes += amounts[i];
        }

        // check vote power
        uint256 borderBlock = lastFinalizeBlock -
            ((lastFinalizeBlock - START_BLOCK) % VOTING_PERIOD); // last block in previous period
        uint256 userVotes = voteToken.getPastVotes(voter, borderBlock);
        if (userVotes - usedVotes[borderBlock][voter] < totalVotes) {
            revert InsufficientVotePower();
        }
        usedVotes[borderBlock][voter] += totalVotes;

        emit VoteCasted(voter, totalVotes);
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

        if (_isPeriodPassed(lastFinalizeBlock)) {
            _finalizeVotingPeriod();
        }

        uint256 totalVotes;
        for (uint256 i; i < gaugesNumber; ++i) {
            totalVotes += gauges[i].finalizedVotes;
        }
        uint256 amount;
        for (uint256 i; i < gaugesNumber; ++i) {
            amount = (_periodDistributionValue() * gauges[i].finalizedVotes) / totalVotes;
            token.safeTransfer(gauges[i].addr, amount);
            IGauge(gauges[i].addr).distribute(amount);
            totalDistributed += amount;
        }

        lastDistributionBlock = block.number;
        emit Distributed(totalDistributed);
    }

    function stopDistribution() external onlyOwner whenNotPaused returns (uint256 value) {
        value = token.balanceOf(address(this));
        token.safeTransfer(owner(), value);
        _pause();
        emit DistributionStopped(value);
    }

    function addGauge(address newGauge) external onlyOwner whenNotPaused {
        if (newGauge == address(0)) {
            revert ZeroAddress();
        }
        gauges[gaugesNumber] = Gauge(newGauge, 0, 0);
        gaugesNumber += 1;
        emit GaugeAdded(newGauge);
    }

    // don't forget update gauges' indexes on frontend
    function deleteGauge(uint256 gaugeId) external onlyOwner whenNotPaused {
        if (gaugeId >= gaugesNumber) {
            revert WrongGaugeId();
        }
        for (uint256 i = gaugeId; i < gaugesNumber - 1; ++i) {
            gauges[i] = gauges[i + 1];
        }
        delete (gauges[gaugesNumber - 1]);
        gaugesNumber -= 1;
        emit GaugeDeleted(gaugeId);
    }

    function setVotingThreshold(uint256 _threshold) external onlyOwner whenNotPaused {
        votingThreshold = _threshold;
        emit VotingThresholdChanged(_threshold);
    }

    function withdrawStuckToken(ERC20 _token) external onlyOwner {
        uint256 tokenBalance = _token.balanceOf(address(this));
        if (tokenBalance > 0) {
            _token.safeTransfer(owner(), tokenBalance);
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
        // update last votes if quorum reached
        uint256 totalVotes;
        for (uint256 i; i < gaugesNumber; ++i) {
            totalVotes += gauges[i].currentVotes;
        }
        if (totalVotes >= votingThreshold && totalVotes > 0) {
            for (uint256 i; i < gaugesNumber; ++i) {
                gauges[i].finalizedVotes = gauges[i].currentVotes;
                // reset current votes counters
                gauges[i].currentVotes = 0;
            }
        } else {
            for (uint256 i; i < gaugesNumber; ++i) {
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
