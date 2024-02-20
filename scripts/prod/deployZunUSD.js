const { ethers } = require('hardhat');

async function createAndInitStrategy(zunamiPool, stratName, oracle, stableConverter) {
    const StratFactory = await ethers.getContractFactory(stratName);
    const strategy = await StratFactory.deploy();
    await strategy.deployed();
    console.log(`${stratName} strategy deployed to: ${strategy.address}`);

    if (!!oracle) {
        result = await strategy.setPriceOracle(oracle);
        await result.wait();
        console.log(`Set price oracle address ${oracle} in ${stratName} strategy`);
    }

    if (!!stableConverter) {
        result = await strategy.setStableConverter(stableConverter.address);
        await result.wait();
        console.log(
            `Set stable converter address ${stableConverter.address} in ${stratName} strategy`
        );
    }

    // result = await zunamiPool.addStrategy(strategy.address);
    // await result.wait();
    // console.log(`Added ${stratName} pool to ZunamiPool`);

    result = await strategy.setZunamiPool(zunamiPool.address);
    await result.wait();
    console.log(`Set zunami pool address ${zunamiPool.address} in ${stratName} strategy`);
}

async function main() {
    console.log('Start deploy');

    const genericOracleAddr = '0x4142bB1ceeC0Dec4F7aaEB3D51D2Dc8E6Ee18410';

    console.log('Deploy StableConverter:');
    const StableConverterFactory = await ethers.getContractFactory('StableConverter');
    // const stableConverter = await StableConverterFactory.deploy();
    const stableConverter = await StableConverterFactory.attach(
        '0x0236B7A3996d8c3597173aA95fD2a915c7A8A42E'
    );
    // await stableConverter.deployed();
    console.log('StableConverter:', stableConverter.address);

    console.log('Deploy zunUSD omnipool:');
    const ZunamiPool = await ethers.getContractFactory('ZunamiPoolZunUSD');
    const zunamiPool = await ZunamiPool.deploy();
    await zunamiPool.deployed();
    console.log('ZunamiPoolZunUSD:', zunamiPool.address);

    console.log('Deploy zunUSD pool controller:');
    const ZunamiPoolController = await ethers.getContractFactory('ZunamiPoolControllerZunUSD');
    const zunamiPoolController = await ZunamiPoolController.deploy(zunamiPool.address);
    await zunamiPoolController.deployed();
    console.log('ZunamiPoolControllerZunUSD:', zunamiPoolController.address);

    let result = await zunamiPool.grantRole(
        await zunamiPool.CONTROLLER_ROLE(),
        zunamiPoolController.address
    );
    await result.wait();
    console.log(
        'ZunamiPoolController granted CONTROLLER_ROLE:',
        await zunamiPool.hasRole(await zunamiPool.CONTROLLER_ROLE(), zunamiPoolController.address)
    );

    await createAndInitStrategy(zunamiPool, 'ZunUSDVaultStrat', null, null);
    // await createAndInitStrategy(
    //     zunamiPool,
    //     'UsdcCrvUsdStakeDaoCurve',
    //     genericOracleAddr,
    //     stableConverter
    // );
    // await createAndInitStrategy(
    //     zunamiPool,
    //     'UsdtCrvUsdStakeDaoCurve',
    //     genericOracleAddr,
    //     stableConverter
    // );
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
