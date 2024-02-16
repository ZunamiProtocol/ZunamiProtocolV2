//SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';

import './interfaces/AggregatorV2V3Interface.sol';
import './interfaces/ICurveExchangePool.sol';
import '../../utils/Constants.sol';
import '../../interfaces/IWETH.sol';
import '../../interfaces/IRewardManager.sol';
import '../../interfaces/INativeConverter.sol';

contract SellingCurveRewardManagerFrxEth is IRewardManager {
    using SafeERC20 for IERC20;

    error WrongFeeToken(address feeToken);

    uint256 public constant SLIPPAGE_DENOMINATOR = 10_000;

    uint256 public constant CURVE_WETH_REWARD_POOL_WETH_ID = 0;
    uint256 public constant CURVE_WETH_REWARD_POOL_REWARD_ID = 1;

    uint256 public constant CURVE_TRICRV_POOL_WETH_ID = 1;
    uint256 public constant CURVE_TRICRV_POOL_CRV_ID = 2;

    uint256 public constant defaultSlippage = 300; // 3%

    uint256 public constant STALE_DELAY = 86400;

    mapping(address => address) public rewardEthCurvePools;

    address public constant ethUsdChainlinkOracle = 0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419;

    IWETH public constant weth = IWETH(payable(Constants.WETH_ADDRESS));

    mapping(address => address) public rewardEthChainlinkOracles;
    mapping(address => address) public rewardUsdChainlinkOracles;

    INativeConverter public immutable frxEthConverter;

    constructor(address frxEthConverterAddr) {
        require(frxEthConverterAddr != address(0), 'frxEthConverter');
        frxEthConverter = INativeConverter(frxEthConverterAddr);

        // https://curve.fi/#/ethereum/pools/factory-tricrypto-4
        rewardEthCurvePools[Constants.CRV_ADDRESS] = 0x4eBdF703948ddCEA3B11f675B4D1Fba9d2414A14;
        // https://curve.fi/#/ethereum/pools/cvxeth
        rewardEthCurvePools[Constants.CVX_ADDRESS] = 0xB576491F1E6e5E62f1d8F26062Ee822B40B0E0d4;
        // https://curve.fi/#/ethereum/pools/fxseth
        rewardEthCurvePools[Constants.FXS_ADDRESS] = 0x941Eb6F616114e4Ecaa85377945EA306002612FE;
        // https://curve.fi/#/ethereum/pools/spelleth
        rewardEthCurvePools[Constants.SPELL_ADDRESS] = 0x98638FAcf9a3865cd033F36548713183f6996122;

        rewardEthChainlinkOracles[
            Constants.CVX_ADDRESS
        ] = 0xC9CbF687f43176B302F03f5e58470b77D07c61c6; // https://data.chain.link/ethereum/mainnet/crypto-eth/cvx-eth
        rewardEthChainlinkOracles[
            Constants.CRV_ADDRESS
        ] = 0x8a12Be339B0cD1829b91Adc01977caa5E9ac121e; // https://data.chain.link/ethereum/mainnet/crypto-eth/crv-eth
        rewardUsdChainlinkOracles[
            Constants.FXS_ADDRESS
        ] = 0x6Ebc52C8C1089be9eB3945C4350B68B8E4C2233f; // https://data.chain.link/ethereum/mainnet/crypto-usd/fxs-usd
        rewardUsdChainlinkOracles[
            Constants.SPELL_ADDRESS
        ] = 0x8c110B94C5f1d347fAcF5E1E938AB2db60E3c9a8; // https://data.chain.link/ethereum/mainnet/crypto-usd/spell-usd
    }

    function handle(address reward, uint256 amount, address feeToken) external {
        if (feeToken != Constants.FRX_ETH_ADDRESS) revert WrongFeeToken(feeToken);
        if (amount == 0) return;

        ICurveExchangePool rewardEthPool = ICurveExchangePool(rewardEthCurvePools[reward]);

        IERC20(reward).safeIncreaseAllowance(address(rewardEthPool), amount);

        (uint256 i, uint256 j) = getExchangeIndexes(reward);
        rewardEthPool.exchange(i, j, amount, 0);

        IERC20 wethErc = IERC20(Constants.WETH_ADDRESS);
        uint256 wethAmount = wethErc.balanceOf(address(this));

        wethErc.safeTransfer(address(frxEthConverter), wethAmount);
        uint256 frxEthAmount = frxEthConverter.handle(true, wethAmount, 0);

        checkSlippage(reward, amount, frxEthAmount);

        IERC20(Constants.FRX_ETH_ADDRESS).safeTransfer(address(msg.sender), frxEthAmount);
    }

    function getExchangeIndexes(address reward) internal pure returns (uint256, uint256) {
        if (reward == Constants.CRV_ADDRESS) {
            return (CURVE_TRICRV_POOL_CRV_ID, CURVE_TRICRV_POOL_WETH_ID);
        } else {
            return (CURVE_WETH_REWARD_POOL_REWARD_ID, CURVE_WETH_REWARD_POOL_WETH_ID);
        }
    }

    function valuate(address reward, uint256 amount, address) public view returns (uint256) {
        if (amount == 0) return 0;

        ICurveExchangePool rewardEthPool = ICurveExchangePool(rewardEthCurvePools[reward]);

        (uint256 i, uint256 j) = getExchangeIndexes(reward);
        uint256 wethAmount = rewardEthPool.get_dy(i, j, amount);

        checkSlippage(reward, amount, wethAmount);

        return frxEthConverter.valuate(true, wethAmount);
    }

    function checkSlippage(address reward, uint256 amount, uint256 wethAmount) internal view {
        address rewardEthOracle = rewardEthChainlinkOracles[reward];
        uint256 wethAmountByOracle;
        if (rewardEthOracle != address(0)) {
            AggregatorV2V3Interface oracle = AggregatorV2V3Interface(rewardEthOracle);
            (, int256 answer, , uint256 updatedAt, ) = oracle.latestRoundData();
            require(block.timestamp - updatedAt <= STALE_DELAY, 'Oracle stale');

            wethAmountByOracle = (uint256(answer) * amount) / (10 ** oracle.decimals());
        } else {
            AggregatorV2V3Interface rewardOracle = AggregatorV2V3Interface(
                rewardUsdChainlinkOracles[reward]
            );
            (, int256 rewardAnswer, , uint256 updatedAt, ) = rewardOracle.latestRoundData();

            require(block.timestamp - updatedAt <= STALE_DELAY, 'Oracle usd stale');

            AggregatorV2V3Interface ethOracle = AggregatorV2V3Interface(ethUsdChainlinkOracle);
            (, int256 ethAnswer, , uint256 ethUpdatedAt, ) = ethOracle.latestRoundData();
            require(block.timestamp - ethUpdatedAt <= STALE_DELAY, 'Oracle eth stale');

            wethAmountByOracle = (uint256(rewardAnswer) * amount) / uint256(ethAnswer);
        }

        uint256 wethAmountByOracleWithSlippage = (wethAmountByOracle *
            (SLIPPAGE_DENOMINATOR - defaultSlippage)) / SLIPPAGE_DENOMINATOR;

        require(wethAmount >= wethAmountByOracleWithSlippage, 'Wrong slippage');
    }
}
