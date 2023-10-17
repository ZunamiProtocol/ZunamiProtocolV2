//SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import '@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol';
import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';

import '../interfaces/IStrategy.sol';
import './ZunamiPoolOwnable.sol';

abstract contract ZunamiStratBase is IStrategy, ZunamiPoolOwnable {
    using SafeERC20 for IERC20Metadata;

    uint8 public constant POOL_ASSETS = 5;

    uint256 public constant DEPOSIT_DENOMINATOR = 10000;

    uint256 public minDepositAmount = 9975; // 99.75%

    event MinDepositAmountUpdated(uint256 oldAmount, uint256 newAmount);
    event TokenPricerSet(address tokenPricerAddr);

    function updateMinDepositAmount(uint256 _minDepositAmount) public onlyOwner {
        require(_minDepositAmount > 0 && _minDepositAmount <= 10000, 'Wrong amount!');
        emit MinDepositAmountUpdated(minDepositAmount, _minDepositAmount);
        minDepositAmount = _minDepositAmount;
    }

    function calcTokenAmount(
        uint256[5] memory tokenAmounts,
        bool isDeposit
    ) external view virtual returns (uint256 sharesAmount);

    function calcLiquidityValue(uint256 tokenAmount) internal view returns (uint256) {
        return (tokenAmount * getLiquidityTokenPrice()) / PRICE_DENOMINATOR;
    }

    function getLiquidityTokenPrice() internal view virtual returns (uint256);

    function totalHoldings() public view virtual returns (uint256) {
        uint256 poolHoldings = calcLiquidityValue(getLiquidityBalance());

        uint256 tokensHoldings = 0;
        for (uint256 i = 0; i < 3; i++) {
            tokensHoldings +=
                zunamiPool.tokens()[i].balanceOf(address(this)) *
                zunamiPool.tokenDecimalsMultipliers()[i];
        }

        return tokensHoldings + poolHoldings;
    }

    function getLiquidityBalance() internal view virtual returns (uint256);

    function deposit(uint256[5] memory amounts) external returns (uint256) {
        if (!checkDepositSuccessful(amounts)) {
            return 0;
        }

        return calcLiquidityValue(depositLiquidityPool(amounts));
    }

    function checkDepositSuccessful(uint256[5] memory amounts) internal view virtual returns (bool);

    function depositLiquidityPool(uint256[5] memory amounts) internal virtual returns (uint256);

    function withdraw(
        address receiver,
        uint256 poolTokenRation, // multiplied by 1e18
        uint256[5] memory tokenAmounts
    ) external virtual onlyZunamiPool returns (bool) {
        require(poolTokenRation > 0 && poolTokenRation <= 1e18, 'Wrong PoolToken Ratio');
        (bool success, uint256 poolTokenAmount) = calcLiquidityTokenAmount(
            poolTokenRation,
            tokenAmounts
        );

        if (!success) {
            return false;
        }

        IERC20Metadata[POOL_ASSETS] memory tokens = zunamiPool.tokens();
        uint256[] memory prevBalances = new uint256[](5);
        for (uint256 i = 0; i < 5; i++) {
            if (address(tokens[i]) == address(0)) break;
            prevBalances[i] = tokens[i].balanceOf(address(this));
        }

        removeLiquidity(poolTokenAmount, tokenAmounts);

        transferTokensOut(convertTokensToDynamic(tokens), receiver, prevBalances);

        return true;
    }

    function calcLiquidityTokenAmount(
        uint256 poolTokenRation, // multiplied by 1e18
        uint256[5] memory tokenAmounts
    ) internal virtual returns (bool success, uint256 removingCrvLps);

    function removeLiquidity(uint256 amount, uint256[5] memory minTokenAmounts) internal virtual;

    function claimRewards(
        address receiver,
        IERC20Metadata[] memory rewardTokens
    ) public onlyZunamiPool {
        claimCollectedRewards();

        transferTokensOut(rewardTokens, receiver, fillArrayN(0, rewardTokens.length));
    }

    function claimCollectedRewards() internal virtual;

    function withdrawAll() external virtual onlyZunamiPool {
        removeAllLiquidity();

        transferTokensOut(
            convertTokensToDynamic(zunamiPool.tokens()),
            _msgSender(),
            fillArrayN(0, 5)
        );
    }

    function removeAllLiquidity() internal virtual;

    function transferTokensOut(
        IERC20Metadata[] memory tokens,
        address receiver,
        uint256[] memory prevBalances
    ) internal {
        uint256 transferAmount;
        IERC20Metadata token_;
        for (uint256 i = 0; i < tokens.length; i++) {
            token_ = tokens[i];
            if (address(token_) == address(0)) break;
            transferAmount = token_.balanceOf(address(this)) - prevBalances[i];
            if (transferAmount > 0) {
                token_.safeTransfer(receiver, transferAmount);
            }
        }
    }

    function convertTokensToDynamic(
        IERC20Metadata[5] memory tokens
    ) internal pure returns (IERC20Metadata[] memory tokesDynamic) {
        tokesDynamic = new IERC20Metadata[](5);
        for (uint256 i = 0; i < tokens.length; i++) {
            tokesDynamic[i] = tokens[i];
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

    function withdrawStuckToken(IERC20Metadata _token) external onlyOwner {
        uint256 tokenBalance = _token.balanceOf(address(this));
        if (tokenBalance > 0) {
            _token.safeTransfer(_msgSender(), tokenBalance);
        }
    }
}
