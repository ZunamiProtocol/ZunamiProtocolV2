const { ethers } = require('hardhat');
const addresses = require("../../../../test/address.json");

async function main() {
    console.log('Start deploy');

    const genericOracleAddress = '0x4142bB1ceeC0Dec4F7aaEB3D51D2Dc8E6Ee18410';
    const GenericOracleFactory = await ethers.getContractFactory('GenericOracle');
    const genericOracle = await GenericOracleFactory.attach(genericOracleAddress);
    console.log('GenericOracle attached to:', genericOracle.address);

    const curveRegistryCacheAddress = '0x2E68bE71687469280319BCf9E635a8783Db5d238';
    const CurveRegistryCacheFactory = await ethers.getContractFactory('CurveRegistryCache');
    const curveRegistryCache = await CurveRegistryCacheFactory.attach(curveRegistryCacheAddress);
    console.log('CurveRegistryCache attached to:', curveRegistryCache.address);

    // const wBtcTBtcPoolAddr = "0xB7ECB2AA52AA64a717180E030241bC75Cd946726";
    // await curveRegistryCache.initPool(wBtcTBtcPoolAddr);
    // console.log('CurveRegistryCache initialized with: ', wBtcTBtcPoolAddr);
    //
    // const LlammaOracleFactory = await ethers.getContractFactory('LlammaOracle');
    //
    // const wBtc = "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599";
    // const wBtcLlammaOracle = "0xBe83fD842DB4937C0C3d15B2aBA6AF7E854f8dcb";
    // const wBTCOracle = await LlammaOracleFactory.deploy(wBtcLlammaOracle, wBtc);
    // console.log('wBtc Llamma Oracle deployed to:', wBTCOracle.address);
    // await genericOracle.setCustomOracle(wBtc, wBTCOracle.address);
    // console.log('wBtc Llamma Oracle set to GenericOracle');
    //
    // const tBtc = "0x18084fbA666a33d37592fA2633fD49a74DD93a88";
    // const tBtcLlammaOracle = "0xbeF434E2aCF0FBaD1f0579d2376fED0d1CfC4217";
    // const tBTCOracle = await LlammaOracleFactory.deploy(tBtcLlammaOracle, tBtc);
    // console.log('tBtc Llamma Oracle deployed to:', tBTCOracle.address);
    // await genericOracle.setCustomOracle(tBtc, tBTCOracle.address);
    // console.log('tBtc Llamma Oracle set to GenericOracle');

    // const cbBtcAddress = '0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf';
    // const cbBtcOracleFactory = await ethers.getContractFactory('CbBTCOracle');
    // const cbBtcOracle = await cbBtcOracleFactory.deploy(genericOracle.address);
    // await cbBtcOracle.deployed();
    // console.log('CbBTC Oracle deployed to:', cbBtcOracle.address);
    // await genericOracle.setCustomOracle(cbBtcAddress, cbBtcOracle.address);
    // console.log('CbBTC Oracle set to GenericOracle');
    //
    // const StaticCurveLPOracleFactory = await ethers.getContractFactory('StaticCurveLPOracle');
    //
    // const cbBtc_wBtc_pool_addr = "0x839d6bDeDFF886404A6d7a788ef241e4e28F4802";
    // let staticCurveLPOracle = await StaticCurveLPOracleFactory.deploy(
    //     genericOracle.address,
    //     [cbBtcAddress, addresses.crypto.wBtc],
    //     [8, 8],
    //     cbBtc_wBtc_pool_addr
    // );
    // await staticCurveLPOracle.deployed();
    // console.log('StaticCurveLPOracle cbBtc wBtc pool deployed to:', staticCurveLPOracle.address,
    //     genericOracle.address,
    //     [cbBtcAddress, addresses.crypto.wBtc],
    //     [8, 8],
    //     cbBtc_wBtc_pool_addr
    // );
    // await genericOracle.setCustomOracle(cbBtc_wBtc_pool_addr, staticCurveLPOracle.address);
    // console.log('StaticCurveLPOracle set to GenericOracle');

    const zunBTCAddress = '0x0FA308AE0ddE633b6eDE22ba719E7E0Bc45FC6dB';

    const ZunBTCOracleFactory = await ethers.getContractFactory('ZunBTCOracle');
    const zunBtcOracle = await ZunBTCOracleFactory.deploy(genericOracleAddress);
    await zunBtcOracle.deployed();
    console.log('ZunBTC Oracle deployed to:', zunBtcOracle.address);

    await genericOracle.setCustomOracle(zunBTCAddress, zunBtcOracle.address);
    console.log('ZunBTC Oracle set to GenericOracle');

    const StaticCurveLPOracleFactory = await ethers.getContractFactory('StaticCurveLPOracle');

    const ZunBtcTBtcPoolAddress = '0x6fBc5Ddc181240Cb1d9bcEc6Fdea429036818035';
    const staticCurveLPOracle = await StaticCurveLPOracleFactory.deploy(
        genericOracleAddress,
        [zunBTCAddress, addresses.crypto.tBtc],
        [18, 18],
        ZunBtcTBtcPoolAddress
    );
    await staticCurveLPOracle.deployed();
    console.log('StaticCurveLPOracle ZunBtcTBtcPool deployed to:', staticCurveLPOracle.address,
        genericOracleAddress,
        [zunBTCAddress, addresses.crypto.tBtc],
        [18, 18],
        ZunBtcTBtcPoolAddress
    );

    await genericOracle.setCustomOracle(ZunBtcTBtcPoolAddress, staticCurveLPOracle.address);
    console.log('StaticCurveLPOracle ZunBtcTBtcPool set to GenericOracle');
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
