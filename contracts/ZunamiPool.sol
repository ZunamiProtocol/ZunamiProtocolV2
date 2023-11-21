//SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import '@openzeppelin/contracts/token/ERC20/ERC20.sol';
import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';
import '@openzeppelin/contracts/utils/Pausable.sol';
import '@openzeppelin/contracts/access/AccessControl.sol';
import './interfaces/IStrategy.sol';
import './interfaces/IPool.sol';

/**
 *
 * @title Zunami Protocol v2
 *
 */
contract ZunamiPool is IPool, ERC20, Pausable, AccessControl {
    using SafeERC20 for IERC20;

    uint8 public constant POOL_ASSETS = 5;

    bytes32 public constant CONTROLLER_ROLE = keccak256('CONTROLLER_ROLE');
    uint256 public constant DEPOSIT_RATIO_MULTIPLIER = 1e18;
    uint256 public constant MIN_LOCK_TIME = 1 days;
    uint256 public constant FUNDS_DENOMINATOR = 1e18;

    StrategyInfo[] private _strategyInfo;

    IERC20[POOL_ASSETS] private _tokens;
    uint256[POOL_ASSETS] private _decimalsMultipliers;

    uint256 public totalDeposited;
    bool public launched;

    modifier startedStrategy(uint256 sid) {
        if (_strategyInfo.length == 0) revert NoStrategies();
        if (block.timestamp < _strategyInfo[sid].startTime) revert NotStartedStrategy(sid);
        _;
    }

    modifier enabledStrategy(uint256 sid) {
        if (sid >= _strategyInfo.length || !_strategyInfo[sid].enabled)
            revert NotEnabledStrategy(sid);
        _;
    }

    constructor(string memory name_, string memory symbol_) ERC20(name_, symbol_) {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    function _decimalsOffset() internal view virtual returns (uint8) {
        return 0;
    }

    function strategyInfo(uint256 sid) external view returns (StrategyInfo memory) {
        return _strategyInfo[sid];
    }

    function tokens() external view returns (IERC20[POOL_ASSETS] memory) {
        return _tokens;
    }

    function token(uint256 tid) external view returns (IERC20) {
        return _tokens[tid];
    }

    function tokenDecimalsMultipliers() external view returns (uint256[POOL_ASSETS] memory) {
        return _decimalsMultipliers;
    }

    function _setTokens(
        address[] memory tokens_,
        uint256[] memory _tokenDecimalMultipliers
    ) internal {
        if (tokens_.length != _tokenDecimalMultipliers.length || tokens_.length > POOL_ASSETS)
            revert WrongLength();

        for (uint256 i = 0; i < POOL_ASSETS; i++) {
            if (i < tokens_.length) {
                address oldToken = address(_tokens[i]);
                _tokens[i] = IERC20(tokens_[i]);
                _decimalsMultipliers[i] = _tokenDecimalMultipliers[i];
                emit UpdatedToken(i, tokens_[i], _tokenDecimalMultipliers[i], oldToken);
            } else {
                emit UpdatedToken(i, address(0), 0, address(_tokens[i]));
                delete _tokens[i];
                delete _decimalsMultipliers[i];
            }
        }
    }

    function setTokens(
        address[] memory tokens_,
        uint256[] memory _tokenDecimalMultipliers
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _setTokens(tokens_, _tokenDecimalMultipliers);
    }

    function replaceToken(
        uint256 _tokenIndex,
        address _token,
        uint256 _tokenDecimalMultiplier
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        address oldToken = address(_tokens[_tokenIndex]);
        _tokens[_tokenIndex] = IERC20(_token);
        _decimalsMultipliers[_tokenIndex] = _tokenDecimalMultiplier;
        emit UpdatedToken(_tokenIndex, _token, _tokenDecimalMultiplier, oldToken);
    }

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    function claimRewards(
        address receiver,
        IERC20[] memory rewardTokens
    ) external onlyRole(CONTROLLER_ROLE) {
        for (uint256 i = 0; i < _strategyInfo.length; i++) {
            StrategyInfo memory strategyInfo_ = _strategyInfo[i];
            if (strategyInfo_.minted > 0 && strategyInfo_.enabled) {
                strategyInfo_.strategy.claimRewards(receiver, rewardTokens);
            }
        }
        emit ClaimedRewards(receiver, rewardTokens);
    }

    function totalHoldings() public view returns (uint256) {
        uint256 length = _strategyInfo.length;
        uint256 total;
        for (uint256 sid = 0; sid < length; sid++) {
            StrategyInfo memory strategyInfo_ = _strategyInfo[sid];
            if (strategyInfo_.minted > 0 && strategyInfo_.enabled) {
                total += strategyInfo_.strategy.totalHoldings();
            }
        }
        return total;
    }

    function strategyCount() external view returns (uint256) {
        return _strategyInfo.length;
    }

    function deposit(
        uint256 sid,
        uint256[POOL_ASSETS] memory amounts,
        address receiver
    )
        external
        whenNotPaused
        enabledStrategy(sid)
        startedStrategy(sid)
        onlyRole(CONTROLLER_ROLE)
        returns (uint256)
    {
        if (receiver == address(0)) {
            receiver = _msgSender();
        }

        uint256 holdingsBefore = totalHoldings();

        uint256 depositedValue = doDepositStrategy(sid, amounts);

        return processSuccessfulDeposit(receiver, depositedValue, amounts, holdingsBefore, sid);
    }

    function depositStrategy(
        uint256 sid,
        uint256[POOL_ASSETS] memory amounts
    )
        external
        whenNotPaused
        enabledStrategy(sid)
        startedStrategy(sid)
        onlyRole(CONTROLLER_ROLE)
        returns (uint256)
    {
        return doDepositStrategy(sid, amounts);
    }

    function doDepositStrategy(
        uint256 sid,
        uint256[POOL_ASSETS] memory amounts
    ) internal returns (uint256 depositedValue) {
        IStrategy strategy = _strategyInfo[sid].strategy;

        for (uint256 i = 0; i < amounts.length; i++) {
            if (amounts[i] > 0) {
                IERC20(_tokens[i]).safeTransfer(address(strategy), amounts[i]);
            }
        }

        depositedValue = strategy.deposit(amounts);

        if (depositedValue == 0) revert WrongDeposit(sid, amounts);
    }

    function processSuccessfulDeposit(
        address receiver,
        uint256 depositedValue,
        uint256[POOL_ASSETS] memory depositedTokens,
        uint256 holdingsBefore,
        uint256 sid
    ) internal returns (uint256 minted) {
        if (totalSupply() == 0) {
            minted = depositedValue;
        } else {
            minted =
                ((totalSupply() + 10 ** _decimalsOffset()) * depositedValue) /
                (holdingsBefore + 1);
        }
        _mint(receiver, minted);
        _strategyInfo[sid].minted += minted;

        totalDeposited += depositedValue;

        emit Deposited(receiver, depositedValue, depositedTokens, minted, sid);
    }

    function withdraw(
        uint256 sid,
        uint256 amount,
        uint256[POOL_ASSETS] memory tokenAmounts,
        address receiver
    ) external whenNotPaused enabledStrategy(sid) startedStrategy(sid) onlyRole(CONTROLLER_ROLE) {
        IStrategy strategy = _strategyInfo[sid].strategy;
        address controllerAddr = _msgSender();

        if (balanceOf(controllerAddr) < amount) revert WrongAmount();

        if (
            !strategy.withdraw(
                receiver == address(0) ? controllerAddr : receiver,
                calcRatioSafe(amount, _strategyInfo[sid].minted),
                tokenAmounts
            )
        ) revert WrongWithdrawParams(sid);

        uint256 userDeposit = ((totalDeposited + 1) * amount) /
            (totalSupply() + 10 ** _decimalsOffset());

        processSuccessfulWithdrawal(controllerAddr, userDeposit, amount, sid);
    }

    function processSuccessfulWithdrawal(
        address user,
        uint256 userDeposit,
        uint256 stableAmount,
        uint256 sid
    ) internal {
        _burn(user, stableAmount);
        _strategyInfo[sid].minted -= stableAmount;
        totalDeposited -= userDeposit;
        emit Withdrawn(user, stableAmount, sid);
    }

    function calcRatioSafe(
        uint256 outAmount,
        uint256 strategyDeposited
    ) internal pure returns (uint256 ratio) {
        ratio = (outAmount * DEPOSIT_RATIO_MULTIPLIER) / strategyDeposited;
        if (ratio == 0 || ratio > DEPOSIT_RATIO_MULTIPLIER) revert WrongRatio();
    }

    /**
     * @dev add a new strategy, deposits in the new strategy are blocked for one day for safety
     * @param _strategyAddr - the new strategy strategy address
     */
    function addStrategy(address _strategyAddr) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (_strategyAddr == address(0)) revert ZeroAddress();
        for (uint256 i = 0; i < _strategyInfo.length; i++) {
            if (_strategyAddr == address(_strategyInfo[i].strategy)) revert DuplicatedStrategy();
        }

        uint256 startTime = block.timestamp + (launched ? MIN_LOCK_TIME : 0);
        _strategyInfo.push(
            StrategyInfo({
                strategy: IStrategy(_strategyAddr),
                startTime: startTime,
                minted: 0,
                enabled: true
            })
        );
        emit AddedStrategy(_strategyInfo.length - 1, _strategyAddr, startTime);
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
    ) external onlyRole(DEFAULT_ADMIN_ROLE) enabledStrategy(_receiverStrategy) {
        if (_strategies.length != withdrawalsPercents.length) revert IncorrectArguments();
        if (_receiverStrategy >= _strategyInfo.length) revert WrongReceiver();

        uint256 sid;
        uint256 zunamiStables;
        for (uint256 i = 0; i < _strategies.length; i++) {
            sid = _strategies[i];
            zunamiStables += _moveFunds(sid, withdrawalsPercents[i]);
        }

        uint256[POOL_ASSETS] memory tokensRemainder;
        for (uint256 i = 0; i < POOL_ASSETS; i++) {
            IERC20 token_ = _tokens[i];
            if (address(token_) == address(0)) break;
            tokensRemainder[i] = token_.balanceOf(address(this));
            if (tokensRemainder[i] > 0) {
                token_.safeTransfer(
                    address(_strategyInfo[_receiverStrategy].strategy),
                    tokensRemainder[i]
                );
            }
        }

        _strategyInfo[_receiverStrategy].minted += zunamiStables;

        if (_strategyInfo[_receiverStrategy].strategy.deposit(tokensRemainder) == 0)
            revert WrongDeposit(_receiverStrategy, tokensRemainder);
    }

    function _moveFunds(
        uint256 sid,
        uint256 withdrawPercent
    ) private returns (uint256 stableAmount) {
        if (withdrawPercent == 0 || withdrawPercent > FUNDS_DENOMINATOR)
            revert WrongWithdrawPercent();

        if (withdrawPercent == FUNDS_DENOMINATOR) {
            _strategyInfo[sid].strategy.withdrawAll();

            stableAmount = _strategyInfo[sid].minted;
            _strategyInfo[sid].minted = 0;
        } else {
            stableAmount = (_strategyInfo[sid].minted * withdrawPercent) / FUNDS_DENOMINATOR;
            uint256[POOL_ASSETS] memory minAmounts;

            if (
                !_strategyInfo[sid].strategy.withdraw(
                    address(this),
                    calcRatioSafe(stableAmount, _strategyInfo[sid].minted),
                    minAmounts
                )
            ) revert WrongWithdrawParams(sid);
            _strategyInfo[sid].minted -= stableAmount;
        }

        return stableAmount;
    }

    function enableStrategy(uint256 _sid) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (_sid >= _strategyInfo.length) revert IncorrectSid();

        _strategyInfo[_sid].enabled = true;

        emit EnabledStrategy(address(_strategyInfo[_sid].strategy));
    }

    function disableStrategy(uint256 _sid) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (_sid >= _strategyInfo.length) revert IncorrectSid();

        _strategyInfo[_sid].enabled = false;

        emit DisableStrategy(address(_strategyInfo[_sid].strategy));
    }
}
