//SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import '../../../../utils/Constants.sol';
import '../../../../interfaces/ITokenConverter.sol';
import '../../../../interfaces/ICurvePool2Native.sol';
import "../StakeDaoCurveStratBase.sol";
import "../../../../interfaces/IWETH.sol";

contract EthStakeDaoCurveStratBase is StakeDaoCurveStratBase {
    using SafeERC20 for IERC20;

    uint256 public constant ZUNAMI_WETH_TOKEN_ID = 0;
    uint256 public constant ZUNAMI_FRXETH_TOKEN_ID = 1;

    uint128 public constant CURVE_POOL_ETH_ID = 0;
    int128 public constant CURVE_POOL_ETH_ID_INT = int128(CURVE_POOL_ETH_ID);

    IWETH public constant weth = IWETH(payable(Constants.WETH_ADDRESS));

    ITokenConverter public converter;

    event SetTokenConverter(address converter);

    constructor(
        IERC20[POOL_ASSETS] memory _tokens,
        uint256[POOL_ASSETS] memory _tokenDecimalsMultipliers,
        address _vaultAddr,
        address _poolAddr,
        address _poolLpAddr
    )
        StakeDaoCurveStratBase(
            _tokens,
            _tokenDecimalsMultipliers,
            _vaultAddr,
            _poolAddr,
            _poolLpAddr
        )
    {}


    receive() external payable {
        // receive ETH on conversion
    }

    function setTokenConverter(address tokenConverterAddr) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (address(tokenConverterAddr) == address(0)) revert ZeroAddress();
        converter = ITokenConverter(tokenConverterAddr);
        emit SetTokenConverter(tokenConverterAddr);
    }

    function getTokenPrice(address token) internal view override returns (uint256) {
        if (token == address(Constants.WETH_ADDRESS)) return 1e18;
        return
            (oracle.getUSDPrice(token) * 1e18) /
            oracle.getUSDPrice(Constants.CHAINLINK_FEED_REGISTRY_ETH_ADDRESS);
    }

    function convertCurvePoolTokenAmounts(
        uint256[POOL_ASSETS] memory amounts
    ) internal view override returns (uint256[2] memory amounts2) {
        if (amounts[ZUNAMI_WETH_TOKEN_ID] == 0 && amounts[ZUNAMI_FRXETH_TOKEN_ID] == 0)
            return [uint256(0), 0];

        return [
            amounts[ZUNAMI_WETH_TOKEN_ID] +
            converter.valuate(
                address(tokens[ZUNAMI_FRXETH_TOKEN_ID]),
                address(tokens[ZUNAMI_WETH_TOKEN_ID]),
                amounts[ZUNAMI_FRXETH_TOKEN_ID]
            ),
            0
            ];
    }

    function convertAndApproveTokens(
        address,
        uint256[POOL_ASSETS] memory amounts
    ) internal override returns (uint256[2] memory amounts2) {
        if (amounts[ZUNAMI_FRXETH_TOKEN_ID] > 0) {
            IERC20(tokens[ZUNAMI_FRXETH_TOKEN_ID]).safeTransfer(
                address(converter),
                amounts[ZUNAMI_FRXETH_TOKEN_ID]
            );
            amounts[ZUNAMI_WETH_TOKEN_ID] += converter.handle(
                address(tokens[ZUNAMI_FRXETH_TOKEN_ID]),
                address(tokens[ZUNAMI_WETH_TOKEN_ID]),
                amounts[ZUNAMI_FRXETH_TOKEN_ID],
                applySlippage(amounts[ZUNAMI_FRXETH_TOKEN_ID])
            );
        }

        if (amounts[ZUNAMI_WETH_TOKEN_ID] > 0) {
            weth.withdraw(amounts[ZUNAMI_WETH_TOKEN_ID]);
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
}
