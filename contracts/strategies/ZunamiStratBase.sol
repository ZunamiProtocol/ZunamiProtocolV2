//SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';

import '../lib/ConicOracle/interfaces/IOracle.sol';
import '../interfaces/IStrategy.sol';
import './ZunamiPoolOwnable.sol';

abstract contract ZunamiStratBase is IStrategy, ZunamiPoolOwnable {
    using SafeERC20 for IERC20;

    uint8 public constant POOL_ASSETS = 5;
    uint256 public constant RATIO_MULTIPLIER = 1e18;

    uint256 public constant DEPOSIT_DENOMINATOR = 10000;

    uint256 public minDepositAmount = 9975; // 99.75%

    IERC20[POOL_ASSETS] public tokens;
    uint256[POOL_ASSETS] public tokenDecimalsMultipliers;
    IOracle public oracle;

    event MinDepositAmountUpdated(uint256 oldAmount, uint256 newAmount);
    event PriceOracleSet(address oracleAddr);

    constructor(
        IERC20[POOL_ASSETS] memory tokens_,
        uint256[POOL_ASSETS] memory tokenDecimalsMultipliers_
    ) {
        tokens = tokens_;
        tokenDecimalsMultipliers = tokenDecimalsMultipliers_;
    }

    function setPriceOracle(address oracleAddr) public onlyOwner {
        if (oracleAddr == address(0)) revert ZeroAddress();

        oracle = IOracle(oracleAddr);
        emit PriceOracleSet(oracleAddr);
    }

    function updateMinDepositAmount(uint256 _minDepositAmount) external onlyOwner {
        require(_minDepositAmount > 0 && _minDepositAmount <= DEPOSIT_DENOMINATOR, 'Wrong amount!');
        emit MinDepositAmountUpdated(minDepositAmount, _minDepositAmount);
        minDepositAmount = _minDepositAmount;
    }

    function calcTokenAmount(
        uint256[POOL_ASSETS] memory tokenAmounts,
        bool isDeposit
    ) external view virtual returns (uint256 sharesAmount);

    function calcLiquidityValue(uint256 tokenAmount) internal view returns (uint256) {
        return (tokenAmount * getLiquidityTokenPrice()) / PRICE_DENOMINATOR;
    }

    function getLiquidityTokenPrice() internal view virtual returns (uint256);

    function totalHoldings() public view virtual returns (uint256) {
        uint256 poolHoldings = calcLiquidityValue(getLiquidityBalance());

        IERC20 token_;
        uint256 tokensHoldings;
        for (uint256 i = 0; i < POOL_ASSETS; i++) {
            token_ = tokens[i];
            if (address(token_) == address(0)) break;
            tokensHoldings += token_.balanceOf(address(this)) * tokenDecimalsMultipliers[i];
        }

        return tokensHoldings + poolHoldings;
    }

    function getLiquidityBalance() internal view virtual returns (uint256);

    function deposit(uint256[POOL_ASSETS] memory amounts) external returns (uint256) {
        if (!checkDepositSuccessful(amounts)) {
            return 0;
        }

        return calcLiquidityValue(depositLiquidity(amounts));
    }

    function checkDepositSuccessful(
        uint256[POOL_ASSETS] memory amounts
    ) internal view virtual returns (bool);

    function depositLiquidity(
        uint256[POOL_ASSETS] memory amounts
    ) internal virtual returns (uint256);

    function withdraw(
        address receiver,
        uint256 poolTokenRatio, // multiplied by 1e18
        uint256[POOL_ASSETS] memory tokenAmounts
    ) external virtual onlyZunamiPool returns (bool) {
        require(poolTokenRatio > 0 && poolTokenRatio <= RATIO_MULTIPLIER, 'Wrong PoolToken Ratio');
        (bool success, uint256 liquidityAmount) = calcRemovingLiquidityAmount(
            poolTokenRatio,
            tokenAmounts
        );

        if (!success) {
            return false;
        }

        uint256[] memory prevBalances = new uint256[](POOL_ASSETS);
        for (uint256 i = 0; i < POOL_ASSETS; i++) {
            if (address(tokens[i]) == address(0)) break;
            prevBalances[i] = tokens[i].balanceOf(address(this));
        }

        removeLiquidity(liquidityAmount, tokenAmounts);

        transferTokensOut(convertTokensToDynamic(tokens), receiver, prevBalances);

        return true;
    }

    function calcRemovingLiquidityAmount(
        uint256 poolTokenRatio, // multiplied by 1e18
        uint256[POOL_ASSETS] memory tokenAmounts
    ) internal virtual returns (bool success, uint256 removingLPTokenAmount);

    function removeLiquidity(
        uint256 amount,
        uint256[POOL_ASSETS] memory minTokenAmounts
    ) internal virtual;

    function claimRewards(address receiver, IERC20[] memory rewardTokens) public onlyZunamiPool {
        claimCollectedRewards();

        transferTokensOut(rewardTokens, receiver, fillArrayN(0, rewardTokens.length));
    }

    function claimCollectedRewards() internal virtual;

    function withdrawAll() external virtual onlyZunamiPool {
        removeAllLiquidity();

        transferTokensOut(convertTokensToDynamic(tokens), _msgSender(), fillArrayN(0, 5));
    }

    function removeAllLiquidity() internal virtual;

    function transferTokensOut(
        IERC20[] memory transferringTokens,
        address receiver,
        uint256[] memory prevBalances
    ) internal {
        uint256 transferAmount;
        IERC20 token_;
        for (uint256 i = 0; i < transferringTokens.length; i++) {
            token_ = transferringTokens[i];
            if (address(token_) == address(0)) break;
            transferAmount = token_.balanceOf(address(this)) - prevBalances[i];
            if (transferAmount > 0) {
                token_.safeTransfer(receiver, transferAmount);
            }
        }
    }

    function convertTokensToDynamic(
        IERC20[POOL_ASSETS] memory convertingtokens
    ) internal pure returns (IERC20[] memory tokesDynamic) {
        tokesDynamic = new IERC20[](POOL_ASSETS);
        for (uint256 i = 0; i < convertingtokens.length; i++) {
            tokesDynamic[i] = convertingtokens[i];
        }
    }

    function fillArrayN(
        uint256 _value,
        uint256 _count
    ) internal pure returns (uint256[] memory values) {
        values = new uint256[](_count);
        for (uint256 i = 0; i < _count; i++) {
            values[i] = _value;
        }
    }

    function withdrawStuckToken(IERC20 _token) external onlyOwner {
        uint256 tokenBalance = _token.balanceOf(address(this));
        if (tokenBalance > 0) {
            _token.safeTransfer(_msgSender(), tokenBalance);
        }
    }
}
