const { ethers } = require('hardhat');

async function createAndInitStrategy(zunamiPool, stratName, oracle, tokenConverter) {
    const StratFactory = await ethers.getContractFactory(stratName);
    const strategy = await StratFactory.deploy();
    // await strategy.deployed();
    console.log(`${stratName} strategy deployed to: ${strategy.address}`);

    if (!!oracle) {
        result = await strategy.setPriceOracle(oracle);
        await result.wait();
        console.log(`Set price oracle address ${oracle} in ${stratName} strategy`);
    }

    if (!!tokenConverter) {
        result = await strategy.setTokenConverter(tokenConverter.address);
        await result.wait();
        console.log(
            `Set token converter address ${tokenConverter.address} in ${stratName} strategy`
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
    console.log('GenericOracle:', genericOracleAddr);

    // console.log('Deploy TokenConverter:');
    const TokenConverterFactory = await ethers.getContractFactory('TokenConverter');
    const tokenConverter = await TokenConverterFactory.attach(
        '0xf48A59434609b6e934c2cF091848FA2D28b34bfc'
    );
    console.log('TokenConverter:', tokenConverter.address);

    // console.log('Deploy zunBTC omnipool:');
    const ZunamiPool = await ethers.getContractFactory('ZunamiPoolZunBTC');
    // const zunamiPool = await ZunamiPool.deploy();
    // await zunamiPool.deployed();
    const zunamiPool = await ZunamiPool.attach('0x0FA308AE0ddE633b6eDE22ba719E7E0Bc45FC6dB');
    console.log('ZunamiPoolZunBTC:', zunamiPool.address);

    // console.log('Deploy zunBTC pool controller:');
    const ZunamiPoolController = await ethers.getContractFactory('ZunamiPoolControllerZunBTC');
    // const zunamiPoolController = await ZunamiPoolController.deploy(zunamiPool.address);
    // await zunamiPoolController.deployed();
    const zunamiPoolController = await ZunamiPoolController.attach('0x8d6C5C61E815A53b1D24AC94DEEC62f31911EeB4');
    console.log('ZunamiPoolControllerZunBTC:', zunamiPoolController.address);

    // let result = await zunamiPool.grantRole(
    //     await zunamiPool.CONTROLLER_ROLE(),
    //     zunamiPoolController.address
    // );
    // await result.wait();
    // console.log(
    //     'ZunamiPoolController granted CONTROLLER_ROLE:',
    //     await zunamiPool.hasRole(await zunamiPool.CONTROLLER_ROLE(), zunamiPoolController.address)
    // );

    // await createAndInitStrategy(zunamiPool, 'ZunBTCVaultStrat', null, null);

    // await createAndInitStrategy(
    //     zunamiPool,
    //     'WBtcTBtcConvexCurveStrat',
    //     genericOracleAddr,
    //     tokenConverter
    // );

    await createAndInitStrategy(
        zunamiPool,
        'CbBtcWBtcStakeDaoCurveNStrat',
        genericOracleAddr,
        tokenConverter
    );
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
