//SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import '../../../../../utils/Constants.sol';
import '../../../../../interfaces/IController.sol';
import '../../../../../interfaces/IStableConverter.sol';
import '../EmergencyAdminConvexCurveNStratBase.sol';
import '../../../../../interfaces/ICurvePool2.sol';
import '../../../../../interfaces/ITokenConverter.sol';

contract FrxEthApsConvexCurveStratBase is EmergencyAdminConvexCurveNStratBase {
    using SafeERC20 for IERC20;

    error InsufficientAmount();

    uint256 constant ZUNAMI_STABLE_TOKEN_ID = 0;

    uint128 public constant FRXETH_TOKEN_POOL_FRXETH_ID = 0;
    int128 public constant FRXETH_TOKEN_POOL_FRXETH_ID_INT = int128(FRXETH_TOKEN_POOL_FRXETH_ID);

    uint128 public constant FRXETH_TOKEN_POOL_TOKEN_ID = 1;
    int128 public constant FRXETH_TOKEN_POOL_TOKEN_ID_INT = int128(FRXETH_TOKEN_POOL_TOKEN_ID);

    IERC20 wEth = IERC20(Constants.WETH_ADDRESS);
    IERC20 frxEth = IERC20(Constants.FRX_ETH_ADDRESS);

    IController public immutable zunamiController;
    IERC20 public immutable zunamiStable;

    ITokenConverter public converter;
    event SetTokenConverter(address tokenConverter);

    constructor(
        IERC20[POOL_ASSETS] memory _tokens,
        uint256[POOL_ASSETS] memory _tokenDecimalsMultipliers,
        address _poolAddr,
        address _poolLpAddr,
        address _cvxBooster,
        address _cvxRewardsAddr,
        uint256 _cvxPID,
        address _zunamiControllerAddr,
        address _zunamiStableAddr
    )
        EmergencyAdminConvexCurveNStratBase(
            _tokens,
            _tokenDecimalsMultipliers,
            _poolAddr,
            _poolLpAddr,
            _cvxBooster,
            _cvxRewardsAddr,
            _cvxPID
        )
    {
        if (_zunamiControllerAddr == address(0)) revert ZeroAddress();
        zunamiController = IController(_zunamiControllerAddr);

        if (_zunamiStableAddr == address(0)) revert ZeroAddress();
        zunamiStable = IERC20(_zunamiStableAddr);
    }

    function setTokenConverter(address converterAddr) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (address(converterAddr) == address(0)) revert ZeroAddress();
        converter = ITokenConverter(converterAddr);
        emit SetTokenConverter(converterAddr);
    }

    function getLiquidityTokenPrice() internal view override returns (uint256) {
        return
            (oracle.getUSDPrice(address(poolToken)) * 1e18) /
            oracle.getUSDPrice(Constants.CHAINLINK_FEED_REGISTRY_ETH_ADDRESS);
    }

    function convertCurvePoolTokenAmounts(
        uint256[POOL_ASSETS] memory amounts
    ) internal pure override returns (uint256[] memory) {
        uint256[] memory amountsN = new uint256[](8);
        amountsN[FRXETH_TOKEN_POOL_TOKEN_ID] = amounts[ZUNAMI_STABLE_TOKEN_ID];
        return amountsN;
    }

    function convertAndApproveTokens(
        address pool,
        uint256[POOL_ASSETS] memory amounts
    ) internal override returns (uint256[] memory) {
        uint256[] memory amountsN = new uint256[](8);
        amountsN[FRXETH_TOKEN_POOL_TOKEN_ID] = amounts[ZUNAMI_STABLE_TOKEN_ID];
        zunamiStable.safeIncreaseAllowance(pool, amountsN[FRXETH_TOKEN_POOL_TOKEN_ID]);
        return amountsN;
    }

    function getCurveRemovingTokenIndex() internal pure override returns (int128) {
        return FRXETH_TOKEN_POOL_TOKEN_ID_INT;
    }

    function getZunamiRemovingTokenIndex() internal pure override returns (uint256) {
        return ZUNAMI_STABLE_TOKEN_ID;
    }

    function _inflate(uint256 ratioOfCrvLps, uint256 minInflatedAmount) internal override {
        uint256 removingCrvLps = getLiquidityAmountByRatio(ratioOfCrvLps);
        depositedLiquidity -= removingCrvLps;
        cvxRewards.withdrawAndUnwrap(removingCrvLps, false);

        uint256 frxEthAmount = pool.remove_liquidity_one_coin(
            removingCrvLps,
            FRXETH_TOKEN_POOL_FRXETH_ID_INT,
            0
        );

        frxEth.safeIncreaseAllowance(address(zunamiController), frxEthAmount);
        uint256 zunStableAmount = zunamiController.deposit(
            [0, frxEthAmount, 0, 0, 0],
            address(this)
        );

        if (zunStableAmount < minInflatedAmount) {
            revert InsufficientAmount();
        }

        uint256[] memory amountsN = new uint256[](8);
        amountsN[FRXETH_TOKEN_POOL_TOKEN_ID] = zunStableAmount;
        zunamiStable.safeIncreaseAllowance(address(pool), zunStableAmount);

        uint256 poolTokenAmount = depositCurve(amountsN);
        depositedLiquidity += poolTokenAmount;
        depositBooster(poolTokenAmount);
    }

    function _deflate(uint256 ratioOfCrvLps, uint256 minDeflateAmount) internal override {
        uint256 removingCrvLps = getLiquidityAmountByRatio(ratioOfCrvLps);
        depositedLiquidity -= removingCrvLps;
        cvxRewards.withdrawAndUnwrap(removingCrvLps, false);

        uint256 tokenAmount = pool.remove_liquidity_one_coin(
            removingCrvLps,
            FRXETH_TOKEN_POOL_TOKEN_ID_INT,
            0
        );

        zunamiStable.safeIncreaseAllowance(address(zunamiController), tokenAmount);
        zunamiController.withdraw(tokenAmount, [uint256(0), 0, 0, 0, 0], address(this));

        uint256 wEthBalance = wEth.balanceOf(address(this));
        if (wEthBalance > 0) {
            wEth.safeTransfer(address(converter), wEthBalance);
            converter.handle(address(wEth), address(frxEth), wEthBalance, 0);
        }

        uint256 frxEthAmount = frxEth.balanceOf(address(this));

        if (frxEthAmount < minDeflateAmount) {
            revert InsufficientAmount();
        }

        uint256[] memory amountsN = new uint256[](8);
        amountsN[FRXETH_TOKEN_POOL_FRXETH_ID] = frxEthAmount;
        frxEth.safeIncreaseAllowance(address(pool), frxEthAmount);

        uint256 poolTokenAmount = depositCurve(amountsN);
        depositedLiquidity += poolTokenAmount;
        depositBooster(poolTokenAmount);
    }
}
