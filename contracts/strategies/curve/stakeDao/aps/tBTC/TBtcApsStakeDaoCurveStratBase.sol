//SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import '../../../../../utils/Constants.sol';
import '../../../../../interfaces/IController.sol';
import '../../../../../interfaces/IStableConverter.sol';
import '../EmergencyAdminStakeDaoCurveNStratBase.sol';
import '../../../../../interfaces/ICurvePool2.sol';
import '../../../../../interfaces/ITokenConverter.sol';

contract TBtcApsStakeDaoCurveStratBase is EmergencyAdminStakeDaoCurveNStratBase {
    using SafeERC20 for IERC20;

    error InsufficientAmount();

    uint256 constant ZUNAMI_STABLE_TOKEN_ID = 0;

    uint128 public constant TBTC_TOKEN_POOL_TBTC_ID = 1;
    int128 public constant TBTC_TOKEN_POOL_TBTC_ID_INT = int128(TBTC_TOKEN_POOL_TBTC_ID);

    uint128 public constant TBTC_TOKEN_POOL_TOKEN_ID = 0;
    int128 public constant TBTC_TOKEN_POOL_TOKEN_ID_INT = int128(TBTC_TOKEN_POOL_TOKEN_ID);

    IERC20 public tBtc = IERC20(Constants.TBTC_ADDRESS);
    IERC20 public wBtc = IERC20(Constants.WBTC_ADDRESS);

    IController public immutable zunamiController;
    IERC20 public immutable zunamiStable;

    ITokenConverter public converter;
    event SetTokenConverter(address tokenConverter);

    constructor(
        IERC20[POOL_ASSETS] memory _tokens,
        uint256[POOL_ASSETS] memory _tokenDecimalsMultipliers,
        address _vaultAddr,
        address _poolAddr,
        address _poolTokenAddr,
        address _zunamiControllerAddr,
        address _zunamiStableAddr
    )
        EmergencyAdminStakeDaoCurveNStratBase(
            _tokens,
            _tokenDecimalsMultipliers,
            _vaultAddr,
            _poolAddr,
            _poolTokenAddr
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

    function getTokenPrice(address token) internal view override returns (uint256) {
        return
            (oracle.getUSDPrice(token) * 1e18) /
            oracle.getUSDPrice(Constants.CHAINLINK_FEED_REGISTRY_BTC_ADDRESS);
    }

    function convertCurvePoolTokenAmounts(
        uint256[POOL_ASSETS] memory amounts
    ) internal pure override returns (uint256[] memory) {
        uint256[] memory amountsN = new uint256[](CURVENG_MAX_COINS);
        amountsN[TBTC_TOKEN_POOL_TOKEN_ID] = amounts[ZUNAMI_STABLE_TOKEN_ID];
        return amountsN;
    }

    function convertAndApproveTokens(
        address pool,
        uint256[POOL_ASSETS] memory amounts
    ) internal override returns (uint256[] memory) {
        uint256[] memory amountsN = new uint256[](CURVENG_MAX_COINS);
        amountsN[TBTC_TOKEN_POOL_TOKEN_ID] = amounts[ZUNAMI_STABLE_TOKEN_ID];
        zunamiStable.safeIncreaseAllowance(pool, amountsN[TBTC_TOKEN_POOL_TOKEN_ID]);
        return amountsN;
    }

    function getCurveRemovingTokenIndex() internal pure override returns (int128) {
        return TBTC_TOKEN_POOL_TOKEN_ID_INT;
    }

    function getZunamiRemovingTokenIndex() internal pure override returns (uint256) {
        return ZUNAMI_STABLE_TOKEN_ID;
    }

    function _inflate(uint256 ratioOfCrvLps, uint256 minInflatedAmount) internal override {
        uint256 removingCrvLps = getLiquidityAmountByRatio(ratioOfCrvLps);
        depositedLiquidity -= removingCrvLps;
        vault.withdraw(removingCrvLps);

        uint256 tBtcAmount = pool.remove_liquidity_one_coin(
            removingCrvLps,
            TBTC_TOKEN_POOL_TBTC_ID_INT,
            0
        );

        tBtc.safeIncreaseAllowance(address(zunamiController), tBtcAmount);
        uint256 zunStableAmount = zunamiController.deposit(
            [0, tBtcAmount, 0, 0, 0],
            address(this)
        );

        if (zunStableAmount < minInflatedAmount) {
            revert InsufficientAmount();
        }

        uint256[] memory amountsN = new uint256[](CURVENG_MAX_COINS);
        amountsN[TBTC_TOKEN_POOL_TOKEN_ID] = zunStableAmount;
        zunamiStable.safeIncreaseAllowance(address(pool), zunStableAmount);

        uint256 poolTokenAmount = depositCurve(amountsN);
        depositedLiquidity += poolTokenAmount;
        depositBooster(poolTokenAmount);
    }

    function _deflate(uint256 ratioOfCrvLps, uint256 minDeflateAmount) internal override {
        uint256 removingCrvLps = getLiquidityAmountByRatio(ratioOfCrvLps);
        depositedLiquidity -= removingCrvLps;
        vault.withdraw(removingCrvLps);

        uint256 tokenAmount = pool.remove_liquidity_one_coin(
            removingCrvLps,
            TBTC_TOKEN_POOL_TOKEN_ID_INT,
            0
        );

        zunamiStable.safeIncreaseAllowance(address(zunamiController), tokenAmount);
        zunamiController.withdraw(tokenAmount, [uint256(0), 0, 0, 0, 0], address(this));

        uint256 wBtcBalance = wBtc.balanceOf(address(this));
        if (wBtcBalance > 0) {
            wBtc.safeTransfer(address(converter), wBtcBalance);
            converter.handle(
                address(wBtc),
                address(tBtc),
                wBtcBalance,
                applySlippage(wBtcBalance)
            );
        }

        uint256 tBtcAmount = tBtc.balanceOf(address(this));

        if (tBtcAmount < minDeflateAmount) {
            revert InsufficientAmount();
        }

        uint256[] memory amountsN = new uint256[](CURVENG_MAX_COINS);
        amountsN[TBTC_TOKEN_POOL_TBTC_ID] = tBtcAmount;
        tBtc.safeIncreaseAllowance(address(pool), tBtcAmount);

        uint256 poolTokenAmount = depositCurve(amountsN);
        depositedLiquidity += poolTokenAmount;
        depositBooster(poolTokenAmount);
    }
}
