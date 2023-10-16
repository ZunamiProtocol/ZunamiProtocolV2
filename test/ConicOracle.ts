import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import {
  ChainlinkOracle,
  CurveLPOracle,
  CurveRegistryCache,
  GenericOracle,
  ICurvePoolPricable
} from "../typechain-types";
import { expect } from "chai";
import { BigNumber } from "ethers";

const crvUSD_USDT_pool_addr = "0x390f3595bca2df7d23783dfd126427cceb997bf4";
const crvUSD_USDC_pool_addr = "0x4dece678ceceb27446b35c672dc7d61f30bad69e";
const stETH_ETH_pool_addr = "0x21E27a5E5513D6e65C4f830167390997aA84843a";
const stETH_addr = "0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84";

describe("Conic Oracle", async () => {
  // We define a fixture to reuse the same setup in every test.
  // We use loadFixture to run this setup once, snapshot that state,
  // and reset Hardhat Network to that snapshot in every test.
  async function deployFixture() {
    // Contracts are deployed using the first signer/account by default
    const [owner, otherAccount, otherAccount1] = await ethers.getSigners();

    const CurveRegistryCacheFactory = await ethers.getContractFactory("CurveRegistryCache");
    const curveRegistryCache = await CurveRegistryCacheFactory.deploy() as CurveRegistryCache;

    const ChainlinkOracleFactory = await ethers.getContractFactory("ChainlinkOracle");
    const chainlinkOracle = await ChainlinkOracleFactory.deploy() as ChainlinkOracle;

    const GenericOracleFactory = await ethers.getContractFactory("GenericOracle");
    const genericOracle = await GenericOracleFactory.deploy() as GenericOracle;

    const CurveLPOracleFactory = await ethers.getContractFactory("CurveLPOracle");
    const curveLPOracle = await CurveLPOracleFactory
      .deploy(genericOracle.address, curveRegistryCache.address) as CurveLPOracle;

    await genericOracle.initialize(curveLPOracle.address, chainlinkOracle.address);

    return {
      owner,
      otherAccount,
      otherAccount1,
      curveRegistryCache,
      curveLPOracle,
      chainlinkOracle,
      genericOracle
    };
  }

  describe("Deployment", async () => {
    it("Should correctly deploy the contracts", async () => {
      // given
      const {
        owner,
        curveLPOracle,
        genericOracle
      } = await loadFixture(deployFixture);

      // then
      expect(await genericOracle.owner()).to.equal(owner.address);
      expect(await curveLPOracle.owner()).to.equal(owner.address);
    })
  })

  describe("CurveRegistryCache", async () => {
    it("Should init two pools in registry", async () => {
      // given
      const {
        curveRegistryCache
      } = await loadFixture(deployFixture);

      // when
      await curveRegistryCache.initPool(crvUSD_USDT_pool_addr);
      await curveRegistryCache.initPool(crvUSD_USDC_pool_addr);
      await curveRegistryCache.initPool(stETH_ETH_pool_addr);

      // then
      expect(await curveRegistryCache.isRegistered(crvUSD_USDT_pool_addr)).to.equal(true);
      expect((await curveRegistryCache.lpToken(crvUSD_USDT_pool_addr)).toLowerCase())
        .to.equal(crvUSD_USDT_pool_addr.toLowerCase());

      expect(await curveRegistryCache.isRegistered(crvUSD_USDC_pool_addr)).to.equal(true);
      expect((await curveRegistryCache.lpToken(crvUSD_USDC_pool_addr)).toLowerCase())
        .to.equal(crvUSD_USDC_pool_addr.toLowerCase());

      expect(await curveRegistryCache.isRegistered(stETH_ETH_pool_addr)).to.equal(true);
      expect((await curveRegistryCache.lpToken(stETH_ETH_pool_addr)).toLowerCase())
        .to.equal(stETH_ETH_pool_addr.toLowerCase());
    })
  })
  describe("CurveLPOracle", async () => {
    // given
    it("Should return LP prices", async () => {
      const {
        curveLPOracle,
        curveRegistryCache,
        chainlinkOracle
      } = await loadFixture(deployFixture);
      await curveRegistryCache.initPool(crvUSD_USDT_pool_addr);
      await curveRegistryCache.initPool(crvUSD_USDC_pool_addr);
      await curveRegistryCache.initPool(stETH_ETH_pool_addr);
      const stableThreshold = BigNumber.from("5000000000000000");
      const ethThreshold = BigNumber.from("90000000000000000");
      const crvUSD_USDT_pool = await ethers
        .getContractAt("ICurvePoolPricable", crvUSD_USDT_pool_addr) as ICurvePoolPricable;
      const crvUSD_USDT_virtualPrice = await crvUSD_USDT_pool.get_virtual_price();
      const crvUSD_USDC_pool = await ethers
        .getContractAt("ICurvePoolPricable", crvUSD_USDC_pool_addr) as ICurvePoolPricable;
      const crvUSD_USDC_virtualPrice = await crvUSD_USDC_pool.get_virtual_price();
      const stETH_ETH_pool = await ethers
        .getContractAt("ICurvePoolPricable", stETH_ETH_pool_addr) as ICurvePoolPricable;
      const stETH_ETH_virtualPrice = await stETH_ETH_pool.get_virtual_price();
      const stETH_usdPrice = await chainlinkOracle.getUSDPrice(stETH_addr);

      // when
      const crvUSD_USDT_price = await curveLPOracle.getUSDPrice(crvUSD_USDT_pool_addr);
      const crvUSD_USDC_price = await curveLPOracle.getUSDPrice(crvUSD_USDC_pool_addr);
      const stETH_ETH_price = await curveLPOracle.getUSDPrice(stETH_ETH_pool_addr);

      // then
      expect(await curveLPOracle.isTokenSupported(crvUSD_USDT_pool_addr)).to.equal(true);
      expect(await curveLPOracle.isTokenSupported(crvUSD_USDC_pool_addr)).to.equal(true);
      expect(await curveLPOracle.isTokenSupported(stETH_ETH_pool_addr)).to.equal(true);
      expect(isInRange(crvUSD_USDT_price, crvUSD_USDT_virtualPrice.sub(stableThreshold), crvUSD_USDT_virtualPrice.add(stableThreshold)))
        .to.equal(true);
      expect(isInRange(crvUSD_USDC_price, crvUSD_USDC_virtualPrice.sub(stableThreshold), crvUSD_USDC_virtualPrice.add(stableThreshold)))
        .to.equal(true);
      expect(isInRange(
        stETH_ETH_price.div(stETH_usdPrice)
          .mul(BigNumber.from(10).pow(18)),
        stETH_ETH_virtualPrice.sub(ethThreshold),
        stETH_ETH_virtualPrice.add(ethThreshold)))
        .to.equal(true);
    })
  })

  describe("GenericOracle", async () => {
    it("Should return LP token & token prices", async () => {
      // given
      const {
        genericOracle,
        curveRegistryCache
      } = await loadFixture(deployFixture);
      // given
      await curveRegistryCache.initPool(crvUSD_USDT_pool_addr);
      await curveRegistryCache.initPool(crvUSD_USDC_pool_addr);
      await curveRegistryCache.initPool(stETH_ETH_pool_addr);
      // 1081569895558167776
      const stableThreshold = BigNumber.from("5000000000000000");
      const ethThreshold = BigNumber.from("90000000000000000");
      const crvUSD_USDT_pool = await ethers
        .getContractAt("ICurvePoolPricable", crvUSD_USDT_pool_addr) as ICurvePoolPricable;
      const crvUSD_USDT_virtualPrice = await crvUSD_USDT_pool.get_virtual_price();
      const crvUSD_USDC_pool = await ethers
        .getContractAt("ICurvePoolPricable", crvUSD_USDC_pool_addr) as ICurvePoolPricable;
      const crvUSD_USDC_virtualPrice = await crvUSD_USDC_pool.get_virtual_price();
      const stETH_ETH_pool = await ethers
        .getContractAt("ICurvePoolPricable", stETH_ETH_pool_addr) as ICurvePoolPricable;
      const stETH_ETH_virtualPrice = await stETH_ETH_pool.get_virtual_price();

      // when
      const crvUSD_USDT_price = await genericOracle.getUSDPrice(crvUSD_USDT_pool_addr);
      const crvUSD_USDC_price = await genericOracle.getUSDPrice(crvUSD_USDC_pool_addr);
      const stETH_ETH_price = await genericOracle.getUSDPrice(stETH_ETH_pool_addr);
      const stETH_usdPrice = await genericOracle.getUSDPrice(stETH_addr);

      // then
      expect(await genericOracle.isTokenSupported(crvUSD_USDT_pool_addr)).to.equal(true);
      expect(await genericOracle.isTokenSupported(crvUSD_USDC_pool_addr)).to.equal(true);
      expect(await genericOracle.isTokenSupported(stETH_ETH_pool_addr)).to.equal(true);
      expect(isInRange(crvUSD_USDT_price, crvUSD_USDT_virtualPrice.sub(stableThreshold), crvUSD_USDT_virtualPrice.add(stableThreshold)))
        .to.equal(true);
      expect(isInRange(crvUSD_USDC_price, crvUSD_USDC_virtualPrice.sub(stableThreshold), crvUSD_USDC_virtualPrice.add(stableThreshold)))
        .to.equal(true);
      expect(isInRange(
        stETH_ETH_price.div(stETH_usdPrice)
          .mul(BigNumber.from(10).pow(18)),
        stETH_ETH_virtualPrice.sub(ethThreshold),
        stETH_ETH_virtualPrice.add(ethThreshold)))
        .to.equal(true);
    })
  })
})

function isInRange(value: BigNumber, min: BigNumber, max: BigNumber): boolean {
  return value.gte(min) && value.lte(max);
}
