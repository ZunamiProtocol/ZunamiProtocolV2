//SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import '@openzeppelin/contracts/token/ERC20/ERC20.sol';
import '@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol';
import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';
import '@openzeppelin/contracts/utils/Pausable.sol';
import '@openzeppelin/contracts/access/extensions/AccessControlDefaultAdminRules.sol';
import './interfaces/IStrategy.sol';
import './interfaces/IPool.sol';

/**
 *
 * @title Zunami Protocol v2
 *
 */
abstract contract ZunamiPool is IPool, ERC20, Pausable, AccessControlDefaultAdminRules {
    using SafeERC20 for IERC20Metadata;

    uint8 public constant POOL_ASSETS = 5;

    bytes32 public constant CONTROLLER_ROLE = keccak256('CONTROLLER_ROLE');
    uint256 public constant DEPOSIT_RATIO_MULTIPLIER = 1e18;
    uint256 public constant MIN_LOCK_TIME = 1 days;
    uint256 public constant FUNDS_DENOMINATOR = 1e18;

    PoolInfo[] private _poolInfo;

    IERC20Metadata[POOL_ASSETS] private _tokens;
    uint256[POOL_ASSETS] private _decimalsMultipliers;

    uint256 public totalDeposited = 0;
    bool public launched = false;

    modifier startedPool(uint256 pid) {
        require(_poolInfo.length != 0, 'pools empty');
        require(block.timestamp >= _poolInfo[pid].startTime, 'pool not started');
        _;
    }

    modifier enabledPool(uint256 poolIndex) {
        require(poolIndex < _poolInfo.length && _poolInfo[poolIndex].enabled, 'not enabled');
        _;
    }

    constructor(
        string memory name_,
        string memory symbol_
    ) ERC20(name_, symbol_) AccessControlDefaultAdminRules(24 hours, msg.sender) {}

    function poolInfo(uint256 pid) external view returns (PoolInfo memory) {
        return _poolInfo[pid];
    }

    function tokens() external view returns (IERC20Metadata[POOL_ASSETS] memory) {
        return _tokens;
    }

    function tokenDecimalsMultipliers() external view returns (uint256[POOL_ASSETS] memory) {
        return _decimalsMultipliers;
    }

    function _addTokens(
        address[] memory tokens_,
        uint256[] memory _tokenDecimalMultipliers
    ) internal {
        for (uint256 i = 0; i < tokens_.length; i++) {
            _tokens[i] = IERC20Metadata(tokens_[i]);
            emit UpdatedToken(i, tokens_[i], _tokenDecimalMultipliers[i], address(0));
            _decimalsMultipliers[i] = _tokenDecimalMultipliers[i];
        }
    }

    function addTokens(
        address[] memory tokens_,
        uint256[] memory _tokenDecimalMultipliers
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _addTokens(tokens_, _tokenDecimalMultipliers);
    }

    function replaceToken(
        uint256 _tokenIndex,
        address _token,
        uint256 _tokenDecimalMultiplier
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _tokens[_tokenIndex] = IERC20Metadata(_token);
        _decimalsMultipliers[_tokenIndex] = _tokenDecimalMultiplier;
        emit UpdatedToken(
            _tokenIndex,
            _token,
            _tokenDecimalMultiplier,
            address(_tokens[_tokenIndex])
        );
    }

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    function claimRewards(
        address receiver,
        IERC20Metadata[] memory rewardTokens
    ) external onlyRole(CONTROLLER_ROLE) {
        for (uint256 i = 0; i < _poolInfo.length; i++) {
            PoolInfo memory poolInfo_ = _poolInfo[i];
            if (poolInfo_.deposited > 0 && poolInfo_.enabled) {
                poolInfo_.strategy.claimRewards(receiver, rewardTokens);
            }
        }
        emit ClaimedRewards(receiver, rewardTokens);
    }

    function totalHoldings() public view returns (uint256) {
        uint256 length = _poolInfo.length;
        uint256 totalHold = 0;
        for (uint256 pid = 0; pid < length; pid++) {
            PoolInfo memory poolInfo_ = _poolInfo[pid];
            if (poolInfo_.deposited > 0 && poolInfo_.enabled) {
                totalHold += poolInfo_.strategy.totalHoldings();
            }
        }
        return totalHold;
    }

    function poolCount() external view returns (uint256) {
        return _poolInfo.length;
    }

    function deposit(
        uint256 pid,
        uint256[POOL_ASSETS] memory amounts,
        address receiver
    )
        external
        whenNotPaused
        enabledPool(pid)
        startedPool(pid)
        onlyRole(CONTROLLER_ROLE)
        returns (uint256)
    {
        if (receiver == address(0)) {
            receiver = _msgSender();
        }

        IStrategy strategy = _poolInfo[pid].strategy;

        uint256 holdingsBefore = totalHoldings();

        for (uint256 i = 0; i < amounts.length; i++) {
            if (amounts[i] > 0) {
                IERC20Metadata(_tokens[i]).safeTransfer(address(strategy), amounts[i]);
            }
        }
        uint256 depositedValue = strategy.deposit(amounts);

        require(depositedValue > 0, 'low deposit');

        return processSuccessfulDeposit(receiver, depositedValue, amounts, holdingsBefore, pid);
    }

    function processSuccessfulDeposit(
        address receiver,
        uint256 depositedValue,
        uint256[POOL_ASSETS] memory depositedTokens,
        uint256 holdingsBefore,
        uint256 pid
    ) internal returns (uint256 minted) {
        if (totalSupply() == 0) {
            minted = depositedValue;
        } else {
            minted = (totalSupply() * depositedValue) / holdingsBefore;
        }

        _mint(receiver, minted);
        _poolInfo[pid].deposited += minted;

        totalDeposited += depositedValue;

        emit Deposited(receiver, depositedValue, depositedTokens, minted, pid);
    }

    function withdraw(
        uint256 pid,
        uint256 stableAmount,
        uint256[POOL_ASSETS] memory tokenAmounts,
        address receiver
    ) external whenNotPaused enabledPool(pid) startedPool(pid) onlyRole(CONTROLLER_ROLE) {
        IStrategy strategy = _poolInfo[pid].strategy;
        address userAddr = _msgSender();

        require(balanceOf(userAddr) >= stableAmount, 'wrong stable amount');
        require(
            strategy.withdraw(
                receiver == address(0) ? userAddr : receiver,
                calcRatioSafe(stableAmount, _poolInfo[pid].deposited),
                tokenAmounts
            ),
            'wrong withdraw params'
        );

        uint256 userDeposit = (totalDeposited * stableAmount) / totalSupply();

        processSuccessfulWithdrawal(userAddr, userDeposit, stableAmount, pid);
    }

    function processSuccessfulWithdrawal(
        address user,
        uint256 userDeposit,
        uint256 stableAmount,
        uint256 pid
    ) internal {
        _burn(user, stableAmount);
        _poolInfo[pid].deposited -= stableAmount;
        totalDeposited -= userDeposit;
        emit Withdrawn(user, stableAmount, pid);
    }

    function calcRatioSafe(
        uint256 outAmount,
        uint256 strategyDeposited
    ) internal pure returns (uint256 ration) {
        ration = (outAmount * DEPOSIT_RATIO_MULTIPLIER) / strategyDeposited;
        require(ration > 0 && ration <= DEPOSIT_RATIO_MULTIPLIER, 'wrong lp ratio');
    }

    /**
     * @dev add a new pool, deposits in the new pool are blocked for one day for safety
     * @param _strategyAddr - the new pool strategy address
     */
    function addPool(address _strategyAddr) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_strategyAddr != address(0), 'zero addr');
        for (uint256 i = 0; i < _poolInfo.length; i++) {
            require(_strategyAddr != address(_poolInfo[i].strategy), 'duplicate');
        }

        uint256 startTime = block.timestamp + (launched ? MIN_LOCK_TIME : 0);
        _poolInfo.push(
            PoolInfo({
                strategy: IStrategy(_strategyAddr),
                startTime: startTime,
                deposited: 0,
                enabled: true
            })
        );
        emit AddedPool(_poolInfo.length - 1, _strategyAddr, startTime);
    }

    function launch() external onlyRole(DEFAULT_ADMIN_ROLE) {
        launched = true;
    }

    /**
     * @dev dev can transfer funds from few strategy's to one strategy for better APY
     * @param _strategies - array of strategy's, from which funds are withdrawn
     * @param withdrawalsPercents - A percentage of the funds that should be transferred
     * @param _receiverStrategy - number strategy, to which funds are deposited
     */
    function moveFundsBatch(
        uint256[] memory _strategies,
        uint256[] memory withdrawalsPercents,
        uint256 _receiverStrategy
    ) external onlyRole(DEFAULT_ADMIN_ROLE) enabledPool(_receiverStrategy) {
        require(_strategies.length == withdrawalsPercents.length, 'incorrect arguments');
        require(_receiverStrategy < _poolInfo.length, 'incorrect receiver strat');

        uint256[POOL_ASSETS] memory tokenBalance;
        for (uint256 y = 0; y < POOL_ASSETS; y++) {
            IERC20Metadata token = _tokens[y];
            if (address(token) == address(0)) break;
            tokenBalance[y] = token.balanceOf(address(this));
        }

        uint256 pid;
        uint256 zunamiStables;
        for (uint256 i = 0; i < _strategies.length; i++) {
            pid = _strategies[i];
            zunamiStables += _moveFunds(pid, withdrawalsPercents[i]);
        }

        uint256[POOL_ASSETS] memory tokensRemainder;
        for (uint256 y = 0; y < POOL_ASSETS; y++) {
            IERC20Metadata token = _tokens[y];
            if (address(token) == address(0)) break;
            tokensRemainder[y] = token.balanceOf(address(this)) - tokenBalance[y];
            if (tokensRemainder[y] > 0) {
                token.safeTransfer(
                    address(_poolInfo[_receiverStrategy].strategy),
                    tokensRemainder[y]
                );
            }
        }

        _poolInfo[_receiverStrategy].deposited += zunamiStables;

        require(_poolInfo[_receiverStrategy].strategy.deposit(tokensRemainder) > 0, 'low amount');
    }

    function _moveFunds(
        uint256 pid,
        uint256 withdrawPercent
    ) private returns (uint256 stableAmount) {
        if (withdrawPercent == FUNDS_DENOMINATOR) {
            _poolInfo[pid].strategy.withdrawAll();

            stableAmount = _poolInfo[pid].deposited;
            _poolInfo[pid].deposited = 0;
        } else {
            stableAmount = (_poolInfo[pid].deposited * withdrawPercent) / FUNDS_DENOMINATOR;
            uint256[POOL_ASSETS] memory minAmounts;

            _poolInfo[pid].strategy.withdraw(
                address(this),
                calcRatioSafe(stableAmount, _poolInfo[pid].deposited),
                minAmounts
            );
            _poolInfo[pid].deposited -= stableAmount;
        }

        return stableAmount;
    }

    function togglePoolStatus(uint256 _pid) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_pid < _poolInfo.length, 'incorrect pid');

        _poolInfo[_pid].enabled = !_poolInfo[_pid].enabled;

        emit ToggledEnabledPoolStatus(address(_poolInfo[_pid].strategy), _poolInfo[_pid].enabled);
    }
}
