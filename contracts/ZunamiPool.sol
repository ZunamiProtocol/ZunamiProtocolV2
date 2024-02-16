//SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

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

    bytes32 public constant EMERGENCY_ADMIN_ROLE = keccak256('EMERGENCY_ADMIN_ROLE');
    bytes32 public constant CONTROLLER_ROLE = keccak256('CONTROLLER_ROLE');
    uint256 public constant RATIO_MULTIPLIER = 1e18;
    uint256 public constant MIN_LOCK_TIME = 1 days;
    uint256 public constant FUNDS_DENOMINATOR = 1e18;
    uint256 public constant MINIMUM_LIQUIDITY = 1e3;
    address public constant MINIMUM_LIQUIDITY_LOCKER = 0x000000000000000000000000000000000000dEaD;

    StrategyInfo[] private _strategyInfo;

    IERC20[POOL_ASSETS] private _tokens;
    uint256[POOL_ASSETS] private _decimalsMultipliers;

    uint256 public extraGains;
    uint256 public extraGainsMintedBlock;
    bool public launched;

    constructor(string memory name_, string memory symbol_) ERC20(name_, symbol_) {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(EMERGENCY_ADMIN_ROLE, msg.sender);
    }

    function _checkStrategyExisted(uint256 sid) internal view {
        if (sid >= _strategyInfo.length) revert AbsentStrategy(sid);
    }

    function _checkStrategyStarted(uint256 sid) internal view {
        if (block.timestamp < _strategyInfo[sid].startTime) revert NotStartedStrategy(sid);
    }

    function _checkStrategyEnabled(uint256 sid) internal view {
        if (!_strategyInfo[sid].enabled) revert DisabledStrategy(sid);
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
        address[POOL_ASSETS] memory tokens_,
        uint256[POOL_ASSETS] memory tokenDecimalsMultipliers_
    ) internal {
        bool otherZeros = false;
        for (uint256 i = 0; i < POOL_ASSETS; i++) {
            if (otherZeros && address(tokens_[i]) != address(0)) revert WrongTokens();
            if (address(tokens_[i]) == address(0)) otherZeros = true;
            if (
                (address(tokens_[i]) != address(0) && tokenDecimalsMultipliers_[i] == 0) ||
                (address(tokens_[i]) == address(0) && tokenDecimalsMultipliers_[i] != 0)
            ) revert WrongDecimalMultipliers();
            address oldToken = address(_tokens[i]);
            _tokens[i] = IERC20(tokens_[i]);
            _decimalsMultipliers[i] = tokenDecimalsMultipliers_[i];
            emit UpdatedToken(i, tokens_[i], tokenDecimalsMultipliers_[i], oldToken);
        }
    }

    function setTokens(
        address[POOL_ASSETS] memory tokens_,
        uint256[POOL_ASSETS] memory tokenDecimalMultipliers_
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _setTokens(tokens_, tokenDecimalMultipliers_);
    }

    function pause() external onlyRole(EMERGENCY_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    function claimRewards(
        address receiver,
        IERC20[] memory rewardTokens
    ) external onlyRole(CONTROLLER_ROLE) {
        _mintExtraGains();
        _claimExtraGains(receiver);

        for (uint256 i = 0; i < _strategyInfo.length; i++) {
            StrategyInfo memory strategyInfo_ = _strategyInfo[i];
            if (strategyInfo_.minted > 0 && strategyInfo_.enabled) {
                strategyInfo_.strategy.claimRewards(receiver, rewardTokens);
            }
        }
        emit ClaimedRewards(receiver, rewardTokens);
    }

    /// @dev mint extra gains if any and weren't minted in this block
    function _mintExtraGains() internal {
        // return if gains were minted in this block
        if (extraGainsMintedBlock == block.number) return;

        uint256 gains;
        uint256 strategyGains_;
        for (uint256 sid = 0; sid < _strategyInfo.length; sid++) {
            StrategyInfo storage strategyInfo_ = _strategyInfo[sid];
            if (strategyInfo_.minted > 0 && strategyInfo_.enabled) {
                uint256 holdings = strategyInfo_.strategy.totalHoldings();
                uint256 minted = strategyInfo_.minted;
                //check if gains are present
                if (holdings <= minted) continue;

                unchecked {
                    strategyGains_ = holdings - minted;
                    strategyInfo_.minted += strategyGains_;
                    gains += strategyGains_;
                }
            }
        }

        if (gains == 0) return;
        extraGains += gains;
        extraGainsMintedBlock = block.number;
        _mint(address(this), gains);
    }

    /// @dev claim extra gains if any
    function _claimExtraGains(address receiver) internal {
        if (extraGains == 0) return;

        uint256 _extraGains = extraGains;
        extraGains = 0;
        IERC20(address(this)).transfer(receiver, _extraGains);
        emit ClaimedExtraGains(receiver, _extraGains);
    }

    function mintAndClaimExtraGains(address receiver) external onlyRole(CONTROLLER_ROLE) {
        _mintExtraGains();
        _claimExtraGains(receiver);
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
    ) external whenNotPaused onlyRole(CONTROLLER_ROLE) returns (uint256) {
        _checkStrategyExisted(sid);
        _checkStrategyStarted(sid);
        _checkStrategyEnabled(sid);

        if (receiver == address(0)) {
            receiver = _msgSender();
        }

        _mintExtraGains();

        uint256 depositedValue = doDepositStrategy(sid, amounts);
        return processSuccessfulDeposit(receiver, depositedValue, amounts, sid);
    }

    function depositStrategy(
        uint256 sid,
        uint256[POOL_ASSETS] memory amounts
    ) external whenNotPaused onlyRole(CONTROLLER_ROLE) returns (uint256) {
        _checkStrategyExisted(sid);
        _checkStrategyStarted(sid);

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

        _mintExtraGains();

        depositedValue = strategy.deposit(amounts);

        if (depositedValue == 0) revert WrongDeposit(sid, amounts);
    }

    function processSuccessfulDeposit(
        address receiver,
        uint256 depositedValue,
        uint256[POOL_ASSETS] memory depositedTokens,
        uint256 sid
    ) internal returns (uint256) {
        uint256 locked = 0;
        if (totalSupply() == 0) {
            if (depositedValue <= MINIMUM_LIQUIDITY) revert WrongAmount();
            locked = MINIMUM_LIQUIDITY;
            _mint(MINIMUM_LIQUIDITY_LOCKER, MINIMUM_LIQUIDITY); // permanently lock the first MINIMUM_LIQUIDITY tokens
        }
        uint256 depositedValueSubLocked = depositedValue - locked;
        _mint(receiver, depositedValueSubLocked);
        _strategyInfo[sid].minted += depositedValue;

        emit Deposited(receiver, depositedValue, depositedTokens, sid);

        return depositedValueSubLocked;
    }

    function withdraw(
        uint256 sid,
        uint256 stableAmount,
        uint256[POOL_ASSETS] memory tokenAmounts,
        address receiver
    ) external whenNotPaused onlyRole(CONTROLLER_ROLE) {
        _checkStrategyExisted(sid);
        _checkStrategyStarted(sid);
        _checkStrategyEnabled(sid);

        IStrategy strategy = _strategyInfo[sid].strategy;
        address controllerAddr = _msgSender();

        if (balanceOf(controllerAddr) < stableAmount) revert WrongAmount();

        _mintExtraGains();

        if (
            !strategy.withdraw(
                receiver == address(0) ? controllerAddr : receiver,
                calcRatioSafe(stableAmount, _strategyInfo[sid].minted),
                tokenAmounts
            )
        ) revert WrongWithdrawParams(sid);

        processSuccessfulWithdrawal(controllerAddr, stableAmount, sid);
    }

    function processSuccessfulWithdrawal(address user, uint256 stableAmount, uint256 sid) internal {
        _burn(user, stableAmount);
        _strategyInfo[sid].minted -= stableAmount;
        emit Withdrawn(user, stableAmount, sid);
    }

    function calcRatioSafe(
        uint256 outAmount,
        uint256 strategyDeposited
    ) internal pure returns (uint256 ratio) {
        ratio = (outAmount * RATIO_MULTIPLIER) / strategyDeposited;
        if (ratio == 0 || ratio > RATIO_MULTIPLIER) revert WrongRatio();
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
     * @param _withdrawalsPercents - A percentage of the funds that should be transferred
     * @param _receiverStrategy - number strategy, to which funds are deposited
     * @param _minAmounts - minimum amount of tokens that should be received from each strategy
     */
    function moveFundsBatch(
        uint256[] memory _strategies,
        uint256[] memory _withdrawalsPercents,
        uint256 _receiverStrategy,
        uint256[POOL_ASSETS][] memory _minAmounts
    ) external onlyRole(EMERGENCY_ADMIN_ROLE) {
        if (_strategies.length != _withdrawalsPercents.length) revert IncorrectArguments();
        if (_receiverStrategy >= _strategyInfo.length) revert WrongReceiver();

        _checkStrategyExisted(_receiverStrategy);
        _checkStrategyEnabled(_receiverStrategy);

        uint256 sid;
        uint256 zunamiStables;
        for (uint256 i = 0; i < _strategies.length; i++) {
            sid = _strategies[i];
            zunamiStables += _moveFunds(sid, _withdrawalsPercents[i], _minAmounts[i]);
        }
        _strategyInfo[_receiverStrategy].minted += zunamiStables;

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

        if (_strategyInfo[_receiverStrategy].strategy.deposit(tokensRemainder) == 0)
            revert WrongDeposit(_receiverStrategy, tokensRemainder);
    }

    function _moveFunds(
        uint256 sid,
        uint256 withdrawPercent,
        uint256[POOL_ASSETS] memory minAmounts
    ) private returns (uint256 stableAmount) {
        if (withdrawPercent == 0 || withdrawPercent > FUNDS_DENOMINATOR)
            revert WrongWithdrawPercent();

        if (withdrawPercent == FUNDS_DENOMINATOR) {
            stableAmount = _strategyInfo[sid].minted;
            _strategyInfo[sid].minted = 0;
            _strategyInfo[sid].strategy.withdrawAll(minAmounts);
        } else {
            stableAmount = (_strategyInfo[sid].minted * withdrawPercent) / FUNDS_DENOMINATOR;
            _strategyInfo[sid].minted -= stableAmount;

            if (!_strategyInfo[sid].strategy.withdraw(address(this), withdrawPercent, minAmounts))
                revert WrongWithdrawParams(sid);
        }

        return stableAmount;
    }

    function enableStrategy(uint256 _sid) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (_sid >= _strategyInfo.length) revert IncorrectSid();

        _strategyInfo[_sid].enabled = true;

        emit EnabledStrategy(address(_strategyInfo[_sid].strategy));
    }

    function disableStrategy(uint256 _sid) external onlyRole(EMERGENCY_ADMIN_ROLE) {
        if (_sid >= _strategyInfo.length) revert IncorrectSid();

        _strategyInfo[_sid].enabled = false;

        emit DisableStrategy(address(_strategyInfo[_sid].strategy));
    }
}
