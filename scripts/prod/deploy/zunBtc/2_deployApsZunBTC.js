const { ethers } = require('hardhat');

async function createAndInitStrategy(zunamiPool, stratName, oracleAddress, tokenConverterAddress) {
    const StratFactory = await ethers.getContractFactory(stratName);
    // const strategy = await StratFactory.attach('');
    const strategy = await StratFactory.deploy();
    await strategy.deployed();
    console.log(`${stratName} strategy deployed to: ${strategy.address}`);

    if (!!oracleAddress) {
        result = await strategy.setPriceOracle(oracleAddress);
        await result.wait();
        console.log(`Set price oracle address ${oracleAddress} in ${stratName} strategy`);
    }

    if (!!tokenConverterAddress) {
        result = await strategy.setTokenConverter(tokenConverterAddress);
        await result.wait();
        console.log(
            `Set token converter address ${tokenConverterAddress} in ${stratName} strategy`
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

    // console.log('Deploy zunBTC APS omnipool:');
    const ZunamiPool = await ethers.getContractFactory('ZunamiPoolApsZunBTC');
    const zunamiPool = await ZunamiPool.attach('0x3c6e1ffffc293e93bb383b375ba348b85e828D82');
    // const zunamiPool = await ZunamiPool.deploy();
    // await zunamiPool.deployed();
    console.log('ZunamiPoolApsZunBTC:', zunamiPool.address);

    // console.log('Deploy zunBTC APS pool controller:');
    const ZunamiPoolController = await ethers.getContractFactory('ZunamiPoolControllerApsZunBTC');
    const zunamiPoolController = await ZunamiPoolController.attach('0xAEa5f929bC26Dea0c3f5d6dcb0e00ce83751Fc41');
    // const zunamiPoolController = await ZunamiPoolController.deploy(zunamiPool.address);
    // await zunamiPoolController.deployed();
    console.log('ZunamiPoolControllerApsZunBTC:', zunamiPoolController.address);

    // let result = await zunamiPool.grantRole(
    //     await zunamiPool.CONTROLLER_ROLE(),
    //     zunamiPoolController.address
    // );
    // await result.wait();
    // console.log(
    //     'ZunamiPoolController granted CONTROLLER_ROLE:',
    //     await zunamiPool.hasRole(await zunamiPool.CONTROLLER_ROLE(), zunamiPoolController.address)
    // );

    // await createAndInitStrategy(zunamiPool, 'ZunBTCApsVaultStrat', null, null);

    await createAndInitStrategy(
        zunamiPool,
        'ZunBtcTBtcApsStakeDaoCurveStrat',
        genericOracleAddr,
        tokenConverter.address
    );
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
