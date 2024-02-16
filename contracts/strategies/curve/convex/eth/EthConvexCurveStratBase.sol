//SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import '../../../../utils/Constants.sol';
import '../../../../interfaces/INativeConverter.sol';
import '../../../../interfaces/ICurvePool2Native.sol';
import '../../../../interfaces/IWETH.sol';
import '../ConvexCurveStratBase.sol';

contract EthConvexCurveStratBase is ConvexCurveStratBase {
    using SafeERC20 for IERC20;

    uint256 public constant ZUNAMI_WETH_TOKEN_ID = 0;
    uint256 public constant ZUNAMI_FRXETH_TOKEN_ID = 1;

    uint128 public constant CURVE_POOL_ETH_ID = 0;
    int128 public constant CURVE_POOL_ETH_ID_INT = int128(CURVE_POOL_ETH_ID);

    uint128 public constant CURVE_POOL_TOKEN_ID = 1;
    int128 public constant CURVE_POOL_TOKEN_ID_INT = int128(CURVE_POOL_TOKEN_ID);

    IWETH public constant weth = IWETH(payable(Constants.WETH_ADDRESS));

    INativeConverter public nativeConverter;

    event SetNativeConverter(address nativeConverter);

    constructor(
        IERC20[POOL_ASSETS] memory _tokens,
        uint256[POOL_ASSETS] memory _tokenDecimalsMultipliers,
        address _poolAddr,
        address _poolLpAddr,
        address _cvxBooster,
        address _cvxRewardsAddr,
        uint256 _cvxPID
    )
        ConvexCurveStratBase(
            _tokens,
            _tokenDecimalsMultipliers,
            _poolAddr,
            _poolLpAddr,
            _cvxBooster,
            _cvxRewardsAddr,
            _cvxPID
        )
    {}

    receive() external payable {
        // receive ETH on conversion
    }

    function setNativeConverter(address nativeConverterAddr) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (address(nativeConverterAddr) == address(0)) revert ZeroAddress();
        nativeConverter = INativeConverter(nativeConverterAddr);
        emit SetNativeConverter(nativeConverterAddr);
    }

    function getLiquidityTokenPrice() internal view override returns (uint256) {
        return
            (oracle.getUSDPrice(address(poolToken)) * 1e18) /
            oracle.getUSDPrice(Constants.CHAINLINK_FEED_REGISTRY_ETH_ADDRESS);
    }

    function convertCurvePoolTokenAmounts(
        uint256[POOL_ASSETS] memory amounts
    ) internal view override returns (uint256[2] memory amounts2) {
        if (amounts[ZUNAMI_WETH_TOKEN_ID] == 0 && amounts[ZUNAMI_FRXETH_TOKEN_ID] == 0)
            return [uint256(0), 0];

        return [
            amounts[ZUNAMI_WETH_TOKEN_ID] +
                nativeConverter.valuate(false, amounts[ZUNAMI_FRXETH_TOKEN_ID]),
            0
        ];
    }

    function convertAndApproveTokens(
        address,
        uint256[POOL_ASSETS] memory amounts
    ) internal override returns (uint256[2] memory amounts2) {
        if (amounts[ZUNAMI_FRXETH_TOKEN_ID] > 0) {
            IERC20(tokens[ZUNAMI_FRXETH_TOKEN_ID]).safeTransfer(
                address(nativeConverter),
                amounts[ZUNAMI_FRXETH_TOKEN_ID]
            );
            amounts[ZUNAMI_WETH_TOKEN_ID] += nativeConverter.handle(
                false,
                amounts[ZUNAMI_FRXETH_TOKEN_ID],
                0
            );
        }

        if (amounts[ZUNAMI_WETH_TOKEN_ID] > 0) {
            unwrapETH(amounts[ZUNAMI_WETH_TOKEN_ID]);
        }

        amounts2[CURVE_POOL_ETH_ID] = address(this).balance;
    }

    function depositCurve(
        uint256[2] memory amounts2
    ) internal override returns (uint256 deposited) {
        return
            ICurvePool2Native(address(pool)).add_liquidity{ value: amounts2[CURVE_POOL_ETH_ID] }(
                amounts2,
                0
            );
    }

    function getCurveRemovingTokenIndex() internal pure override returns (int128) {
        return CURVE_POOL_ETH_ID_INT;
    }

    function getZunamiRemovingTokenIndex() internal pure override returns (uint256) {
        return ZUNAMI_WETH_TOKEN_ID;
    }

    function convertRemovedAmount(uint256 receivedAmount) internal override {
        weth.deposit{ value: receivedAmount }();
    }

    function unwrapETH(uint256 amount) internal {
        weth.withdraw(amount);
    }
}
