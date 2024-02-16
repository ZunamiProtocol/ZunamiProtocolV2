//SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import '../../../../../utils/Constants.sol';
import '../../../../../interfaces/IController.sol';
import '../../../../../interfaces/IStableConverter.sol';
import '../EmergencyAdminConvexCurveStratBase.sol';

contract FraxApsConvexCurveStratBase is EmergencyAdminConvexCurveStratBase {
    using SafeERC20 for IERC20;

    error WrongMinDeflateAmount();

    uint256 constant ZUNAMI_ZUNUSD_TOKEN_ID = 0;

    uint128 public constant CRVFRAX_TOKEN_POOL_TOKEN_ID = 0;
    int128 public constant CRVFRAX_TOKEN_POOL_TOKEN_ID_INT = int128(CRVFRAX_TOKEN_POOL_TOKEN_ID);

    uint128 public constant CRVFRAX_TOKEN_POOL_CRVFRAX_ID = 1;
    int128 public constant CRVFRAX_TOKEN_POOL_CRVFRAX_ID_INT =
        int128(CRVFRAX_TOKEN_POOL_CRVFRAX_ID);

    IController public immutable zunamiController;
    IERC20 public immutable zunamiStable;

    uint256 constant ZUNAMI_USDC_TOKEN_ID = 1;

    uint256 public constant FRAX_USDC_POOL_USDC_ID = 1;
    int128 public constant FRAX_USDC_POOL_USDC_ID_INT = 1;

    // fraxUsdcPool = FRAX + USDC => crvFrax
    ICurvePool2 public immutable fraxUsdcPool = ICurvePool2(Constants.CRV_FRAX_USDC_POOL_ADDRESS);
    IERC20 public immutable fraxUsdcPoolLp = IERC20(Constants.CRV_FRAX_USDC_POOL_LP_ADDRESS); // crvFrax

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
        amounts2[CRVFRAX_TOKEN_POOL_TOKEN_ID] = amounts[ZUNAMI_ZUNUSD_TOKEN_ID];
        zunamiStable.safeIncreaseAllowance(pool, amounts2[CRVFRAX_TOKEN_POOL_TOKEN_ID]);
    }

    function getCurveRemovingTokenIndex() internal pure override returns (int128) {
        return CRVFRAX_TOKEN_POOL_TOKEN_ID_INT;
    }

    function getZunamiRemovingTokenIndex() internal pure override returns (uint256) {
        return ZUNAMI_ZUNUSD_TOKEN_ID;
    }

    function _inflate(uint256 ratioOfCrvLps, uint256 minInflatedAmount) internal override {
        uint256 removingCrvLps = getLiquidityAmountByRatio(ratioOfCrvLps);

        cvxRewards.withdrawAndUnwrap(removingCrvLps, false);

        uint256 crvFraxAmount = pool.remove_liquidity_one_coin(
            removingCrvLps,
            CRVFRAX_TOKEN_POOL_CRVFRAX_ID_INT,
            0
        );

        uint256 usdcAmount = fraxUsdcPool.remove_liquidity_one_coin(
            crvFraxAmount,
            FRAX_USDC_POOL_USDC_ID_INT,
            minInflatedAmount
        );

        IERC20 usdc = IERC20(Constants.USDC_ADDRESS);

        usdc.safeIncreaseAllowance(address(zunamiController), usdcAmount);
        uint256 zunStableAmount = zunamiController.deposit([0, usdcAmount, 0, 0, 0], address(this));

        uint256[2] memory amounts2;
        amounts2[CRVFRAX_TOKEN_POOL_TOKEN_ID] = zunStableAmount;
        zunamiStable.safeIncreaseAllowance(address(pool), zunStableAmount);

        uint256 poolTokenAmount = depositCurve(amounts2);
        depositBooster(poolTokenAmount);
    }

    function _deflate(uint256 ratioOfCrvLps, uint256 minDeflateAmount) internal override {
        uint256 removingCrvLps = getLiquidityAmountByRatio(ratioOfCrvLps);

        cvxRewards.withdrawAndUnwrap(removingCrvLps, false);

        uint256 tokenAmount = pool.remove_liquidity_one_coin(
            removingCrvLps,
            CRVFRAX_TOKEN_POOL_TOKEN_ID_INT,
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

        if (usdcAmount < minDeflateAmount) revert WrongMinDeflateAmount();

        uint256[2] memory amounts;
        amounts[FRAX_USDC_POOL_USDC_ID] = usdcAmount;
        usdc.safeIncreaseAllowance(address(fraxUsdcPool), usdcAmount);

        uint256 crvFraxAmount = fraxUsdcPool.add_liquidity(amounts, 0);

        uint256[2] memory amounts2;
        amounts2[CRVFRAX_TOKEN_POOL_CRVFRAX_ID] = crvFraxAmount;
        fraxUsdcPoolLp.safeIncreaseAllowance(address(pool), crvFraxAmount);

        uint256 poolTokenAmount = depositCurve(amounts2);
        depositBooster(poolTokenAmount);
    }

    function convertStable(IERC20 fromToken, IERC20 toToken, uint256 fromAmount) internal {
        if (address(fromToken) == address(toToken)) return;

        fromToken.safeTransfer(address(stableConverter), fromAmount);
        stableConverter.handle(address(fromToken), address(toToken), fromAmount, 0);
    }
}
