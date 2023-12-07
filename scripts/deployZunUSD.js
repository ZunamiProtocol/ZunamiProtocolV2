const { ethers } = require('hardhat');

const { createAndInitConicOracles } = require('./utils/CreateAndInitConicOracles');
const {IStableConverter} = require("../typechain-types");

const ADDRESS_ZERO = '0x0000000000000000000000000000000000000000';

async function createAndInitStrategy(zunamiPool, stratName, oracle, stableConverter) {
    const StratFactory = await ethers.getContractFactory(stratName);
    const strategy = await StratFactory.deploy();
    await strategy.deployed();
    console.log(`${stratName} strategy deployed to: ${strategy.address}`);

    if (!!oracle) {
        result = await strategy.setPriceOracle(oracle.address);
        await result.wait();
    }

    if (!!stableConverter) {
        result = await strategy.setStableConverter(stableConverter.address);
        await result.wait();
    }

    // result = await zunamiPool.addStrategy(strategy.address);
    // await result.wait();
    // console.log(`Added ${stratName} pool to ZunamiPool`);

    result = await strategy.setZunamiPool(zunamiPool.address);
    await result.wait();
    console.log(`Set zunami pool address ${zunamiPool.address} in ${stratName} strategy`);
}

const crvUSD_USDT_pool_addr = '0x390f3595bca2df7d23783dfd126427cceb997bf4';
const crvUSD_USDC_pool_addr = '0x4dece678ceceb27446b35c672dc7d61f30bad69e';

async function main() {
    console.log('Start deploy');

    console.log('Deploy oracles:');
    const {genericOracle} = await createAndInitConicOracles([crvUSD_USDT_pool_addr, crvUSD_USDC_pool_addr]);
    console.log('Oracle:', genericOracle.address);

    console.log('Deploy StableConverter:');
    const StableConverterFactory = await ethers.getContractFactory('StableConverter');
    const stableConverter = await StableConverterFactory.deploy();
    await stableConverter.deployed();
    console.log('StableConverter:', stableConverter.address);

    console.log('Deploy zunUSD omnipool:');
    const ZunamiPool = await ethers.getContractFactory('ZunamiPoolZunUSD');
    const zunamiPool = await ZunamiPool.deploy();
    await zunamiPool.deployed();
    console.log('ZunamiPoolZunUSD:', zunamiPool.address);

    console.log('Deploy zunUSD pool controller:');
    const ZunamiPoolController = await ethers.getContractFactory(
        'ZunamiPooControllerZunUSD'
    );

    const zunamiPoolController = await ZunamiPoolController.deploy(zunamiPool.address);
    await zunamiPoolController.deployed();
    console.log('ZunamiPoolController:', zunamiPoolController.address);

    await createAndInitStrategy(zunamiPool, 'VaultStratZunUSD', null, null);
    await createAndInitStrategy(zunamiPool, 'UsdcCrvUsdStakeDaoCurve', genericOracle, stableConverter);
    await createAndInitStrategy(zunamiPool, 'UsdtCrvUsdStakeDaoCurve', genericOracle, stableConverter);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
