//SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';

import '../../utils/Constants.sol';
import './interfaces/ICurveExchangePool.sol';
import './interfaces/AggregatorV2V3Interface.sol';
import '../../interfaces/IRewardManager.sol';
import '../../interfaces/IStableConverter.sol';

contract SellingCurveRewardManager is IRewardManager {
    using SafeERC20 for IERC20;

    uint256 public constant SLIPPAGE_DENOMINATOR = 10_000;

    uint256 public constant CURVE_WETH_REWARD_POOL_WETH_ID = 0;
    uint256 public constant CURVE_WETH_REWARD_POOL_REWARD_ID = 1;

    uint256 public constant CURVE_TRICRV_POOL_WETH_ID = 1;
    uint256 public constant CURVE_TRICRV_POOL_CRV_ID = 2;

    uint256 public constant CURVE_TRICRYPTO2_POOL_WETH_ID = 2;
    uint256 public constant CURVE_TRICRYPTO2_POOL_USDT_ID = 0;

    uint256 public constant defaultSlippage = 300; // 3%

    ICurveExchangePool public immutable tricrypto2;

    mapping(address => address) public rewardEthCurvePools;

    mapping(address => address) public rewardUsdChainlinkOracles;

    IStableConverter public immutable stableConverter;

    constructor(address stableConverterAddr) {
        require(stableConverterAddr != address(0), 'StableConverter');
        stableConverter = IStableConverter(stableConverterAddr);

        tricrypto2 = ICurveExchangePool(Constants.CRV_TRICRYPTO2_ADDRESS);

        // https://curve.fi/#/ethereum/pools/factory-tricrypto-4
        rewardEthCurvePools[Constants.CRV_ADDRESS] = 0x4eBdF703948ddCEA3B11f675B4D1Fba9d2414A14;
        // https://curve.fi/#/ethereum/pools/cvxeth
        rewardEthCurvePools[Constants.CVX_ADDRESS] = 0xB576491F1E6e5E62f1d8F26062Ee822B40B0E0d4;
        // https://curve.fi/#/ethereum/pools/fxseth
        rewardEthCurvePools[Constants.FXS_ADDRESS] = 0x941Eb6F616114e4Ecaa85377945EA306002612FE;
        // https://curve.fi/#/ethereum/pools/spelleth
        rewardEthCurvePools[Constants.SPELL_ADDRESS] = 0x98638FAcf9a3865cd033F36548713183f6996122;

        rewardUsdChainlinkOracles[
            Constants.CVX_ADDRESS
        ] = 0xd962fC30A72A84cE50161031391756Bf2876Af5D; // https://data.chain.link/ethereum/mainnet/crypto-usd/cvx-usd
        rewardUsdChainlinkOracles[
            Constants.CRV_ADDRESS
        ] = 0xCd627aA160A6fA45Eb793D19Ef54f5062F20f33f; // https://data.chain.link/ethereum/mainnet/crypto-usd/crv-usd
        rewardUsdChainlinkOracles[
            Constants.FXS_ADDRESS
        ] = 0x6Ebc52C8C1089be9eB3945C4350B68B8E4C2233f; // https://data.chain.link/ethereum/mainnet/crypto-usd/fxs-usd
        rewardUsdChainlinkOracles[
            Constants.SPELL_ADDRESS
        ] = 0x8c110B94C5f1d347fAcF5E1E938AB2db60E3c9a8; // https://data.chain.link/ethereum/mainnet/crypto-usd/spell-usd
    }

    function handle(address reward, uint256 amount, address feeToken) public {
        if (amount == 0) return;

        ICurveExchangePool rewardEthPool = ICurveExchangePool(rewardEthCurvePools[reward]);

        IERC20(reward).safeIncreaseAllowance(address(rewardEthPool), amount);

        (uint256 i, uint256 j) = getExchangeIndexes(reward);
        rewardEthPool.exchange(i, j, amount, 0);

        IERC20 weth = IERC20(Constants.WETH_ADDRESS);
        uint256 wethAmount = weth.balanceOf(address(this));

        weth.safeIncreaseAllowance(address(tricrypto2), wethAmount);

        tricrypto2.exchange(
            CURVE_TRICRYPTO2_POOL_WETH_ID,
            CURVE_TRICRYPTO2_POOL_USDT_ID,
            wethAmount,
            0
        );

        IERC20 usdt = IERC20(Constants.USDT_ADDRESS);
        uint256 usdtAmount = usdt.balanceOf(address(this));
        checkSlippage(reward, amount, usdtAmount);

        if (feeToken != Constants.USDT_ADDRESS) {
            usdt.safeTransfer(address(stableConverter), usdtAmount);
            stableConverter.handle(Constants.USDT_ADDRESS, feeToken, usdtAmount, 0);
        }

        uint256 feeTokenAmount = IERC20(feeToken).balanceOf(address(this));
        IERC20(feeToken).safeTransfer(address(msg.sender), feeTokenAmount);
    }

    function getExchangeIndexes(address reward) internal pure returns (uint256, uint256) {
        if (reward == Constants.CRV_ADDRESS) {
            return (CURVE_TRICRV_POOL_CRV_ID, CURVE_TRICRV_POOL_WETH_ID);
        } else {
            return (CURVE_WETH_REWARD_POOL_REWARD_ID, CURVE_WETH_REWARD_POOL_WETH_ID);
        }
    }

    function valuate(
        address reward,
        uint256 amount,
        address feeToken
    ) public view returns (uint256) {
        if (amount == 0) return 0;

        ICurveExchangePool rewardEthPool = ICurveExchangePool(rewardEthCurvePools[reward]);

        (uint256 i, uint256 j) = getExchangeIndexes(reward);
        uint256 wethAmount = rewardEthPool.get_dy(i, j, amount);

        uint256 usdtAmount = tricrypto2.get_dy(
            CURVE_TRICRYPTO2_POOL_WETH_ID,
            CURVE_TRICRYPTO2_POOL_USDT_ID,
            wethAmount
        );

        checkSlippage(reward, amount, usdtAmount);

        if (feeToken == Constants.USDT_ADDRESS) return usdtAmount;

        return stableConverter.valuate(Constants.USDT_ADDRESS, feeToken, usdtAmount);
    }

    function checkSlippage(address reward, uint256 amount, uint256 feeTokenAmount) internal view {
        AggregatorV2V3Interface oracle = AggregatorV2V3Interface(rewardUsdChainlinkOracles[reward]);
        (, int256 answer, , , ) = oracle.latestRoundData();

        // reward decimals 18 + oracle decimals 2 (8 - 6)
        uint256 feeTokenAmountByOracleWithSlippage = ((uint256(answer) * amount) *
            (SLIPPAGE_DENOMINATOR - defaultSlippage)) / SLIPPAGE_DENOMINATOR;

        require(feeTokenAmount >= feeTokenAmountByOracleWithSlippage / 1e20, 'Wrong slippage');
    }
}
