//SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import '../../../../../utils/Constants.sol';
import '../../../../../interfaces/IController.sol';
import '../../../../../interfaces/IStableConverter.sol';
import '../EmergencyAdminConvexCurveStratBase.sol';

contract CrvUsdApsConvexCurveStratBase is EmergencyAdminConvexCurveStratBase {
    using SafeERC20 for IERC20;

    uint256 constant ZUNAMI_ZUNUSD_TOKEN_ID = 0;

    uint128 public constant CRVUSD_TOKEN_POOL_TOKEN_ID = 0;
    int128 public constant CRVUSD_TOKEN_POOL_TOKEN_ID_INT = int128(CRVUSD_TOKEN_POOL_TOKEN_ID);

    uint128 public constant CRVUSD_TOKEN_POOL_CRVUSD_ID = 1;
    int128 public constant CRVUSD_TOKEN_POOL_CRVUSD_ID_INT = int128(CRVUSD_TOKEN_POOL_CRVUSD_ID);

    IController public immutable zunamiController;
    IERC20 public immutable zunamiStable;

    uint256 constant ZUNAMI_USDC_TOKEN_ID = 1;

    uint128 public constant CRVUSD_USDC_POOL_USDC_ID = 0;
    int128 public constant CRVUSD_USDC_POOL_USDC_ID_INT = int128(CRVUSD_USDC_POOL_USDC_ID);

    uint128 public constant CRVUSD_USDC_POOL_CRVUSD_ID = 1;
    int128 public constant CRVUSD_USDC_POOL_CRVUSD_ID_INT = int128(CRVUSD_USDC_POOL_CRVUSD_ID);

    // CRVUSD + USDC pool
    ICurvePool2 public immutable crvUsdUsdcPool = ICurvePool2(Constants.CRV_CRVUSD_USDC_ADDRESS);

    IStableConverter public stableConverter;
    event SetStableConverter(address stableConverter);

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
        EmergencyAdminConvexCurveStratBase(
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

    function setStableConverter(address stableConverterAddr) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (address(stableConverterAddr) == address(0)) revert ZeroAddress();
        stableConverter = IStableConverter(stableConverterAddr);
        emit SetStableConverter(stableConverterAddr);
    }

    function convertCurvePoolTokenAmounts(
        uint256[POOL_ASSETS] memory amounts
    ) internal pure override returns (uint256[2] memory amounts2) {
        return [amounts[ZUNAMI_ZUNUSD_TOKEN_ID], 0];
    }

    function convertAndApproveTokens(
        address pool,
        uint256[POOL_ASSETS] memory amounts
    ) internal override returns (uint256[2] memory amounts2) {
        amounts2[CRVUSD_TOKEN_POOL_TOKEN_ID] = amounts[ZUNAMI_ZUNUSD_TOKEN_ID];
        zunamiStable.safeIncreaseAllowance(pool, amounts2[CRVUSD_TOKEN_POOL_TOKEN_ID]);
    }

    function getCurveRemovingTokenIndex() internal pure override returns (int128) {
        return CRVUSD_TOKEN_POOL_TOKEN_ID_INT;
    }

    function getZunamiRemovingTokenIndex() internal pure override returns (uint256) {
        return ZUNAMI_ZUNUSD_TOKEN_ID;
    }

    function _inflate(uint256 ratioOfCrvLps, uint256 minInflatedAmount) internal override {
        uint256 removingCrvLps = getLiquidityAmountByRatio(ratioOfCrvLps);

        cvxRewards.withdrawAndUnwrap(removingCrvLps, false);

        uint256 crvUsdAmount = pool.remove_liquidity_one_coin(
            removingCrvLps,
            CRVUSD_TOKEN_POOL_CRVUSD_ID_INT,
            0
        );

        IERC20 crvUsd = IERC20(Constants.CRVUSD_ADDRESS);

        crvUsd.safeIncreaseAllowance(address(crvUsdUsdcPool), crvUsdAmount);

        uint256 usdcAmount = crvUsdUsdcPool.exchange(
            CRVUSD_USDC_POOL_CRVUSD_ID_INT,
            CRVUSD_USDC_POOL_USDC_ID_INT,
            crvUsdAmount,
            minInflatedAmount
        );

        IERC20 usdc = IERC20(Constants.USDC_ADDRESS);

        usdc.safeIncreaseAllowance(address(zunamiController), usdcAmount);
        uint256 zunStableAmount = zunamiController.deposit([0, usdcAmount, 0, 0, 0], address(this));

        uint256[2] memory amounts2;
        amounts2[CRVUSD_TOKEN_POOL_TOKEN_ID] = zunStableAmount;
        zunamiStable.safeIncreaseAllowance(address(pool), zunStableAmount);

        uint256 poolTokenAmount = depositCurve(amounts2);
        depositBooster(poolTokenAmount);
    }

    function _deflate(uint256 ratioOfCrvLps, uint256 minDeflateAmount) internal override {
        uint256 removingCrvLps = getLiquidityAmountByRatio(ratioOfCrvLps);

        cvxRewards.withdrawAndUnwrap(removingCrvLps, false);

        uint256 tokenAmount = pool.remove_liquidity_one_coin(
            removingCrvLps,
            CRVUSD_TOKEN_POOL_TOKEN_ID_INT,
            0
        );

        zunamiStable.safeIncreaseAllowance(address(zunamiController), tokenAmount);
        zunamiController.withdraw(tokenAmount, [uint256(0), 0, 0, 0, 0], address(this));

        IERC20 dai = IERC20(Constants.DAI_ADDRESS);
        IERC20 usdc = IERC20(Constants.USDC_ADDRESS);
        IERC20 usdt = IERC20(Constants.USDT_ADDRESS);

        convertStable(dai, usdc, dai.balanceOf(address(this)));
        convertStable(usdt, usdc, usdt.balanceOf(address(this)));

        uint256 usdcAmount = usdc.balanceOf(address(this));
        usdc.safeIncreaseAllowance(address(crvUsdUsdcPool), usdcAmount);

        uint256 crvUsdAmount = crvUsdUsdcPool.exchange(
            CRVUSD_USDC_POOL_USDC_ID_INT,
            CRVUSD_USDC_POOL_CRVUSD_ID_INT,
            usdcAmount,
            minDeflateAmount
        );

        IERC20 crvUsd = IERC20(Constants.CRVUSD_ADDRESS);

        uint256[2] memory amounts2;
        amounts2[CRVUSD_TOKEN_POOL_CRVUSD_ID] = crvUsdAmount;
        crvUsd.safeIncreaseAllowance(address(pool), crvUsdAmount);

        uint256 poolTokenAmount = depositCurve(amounts2);
        depositBooster(poolTokenAmount);
    }

    function convertStable(IERC20 fromToken, IERC20 toToken, uint256 fromAmount) internal {
        if (address(fromToken) == address(toToken)) return;

        fromToken.safeTransfer(address(stableConverter), fromAmount);
        stableConverter.handle(address(fromToken), address(toToken), fromAmount, 0);
    }
}
