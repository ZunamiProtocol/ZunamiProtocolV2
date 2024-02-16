const { ethers } = require('hardhat');

async function createAndInitStrategy(zunamiPool, stratName, oracle, stableConverter) {
    const StratFactory = await ethers.getContractFactory(stratName);
    const strategy = await StratFactory.deploy();
    await strategy.deployed();
    console.log(`${stratName} strategy deployed to: ${strategy.address}`);

    if (!!oracle) {
        result = await strategy.setPriceOracle(oracle.address);
        await result.wait();
        console.log(`Set price oracle address ${oracle.address} in ${stratName} strategy`);
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

    console.log('Deploy zunUSD APS omnipool:');
    const ZunamiPool = await ethers.getContractFactory('ZunamiPoolApsZunUSD');
    const zunamiPool = await ZunamiPool.deploy();
    await zunamiPool.deployed();
    console.log('ZunamiPoolApsZunUSD:', zunamiPool.address);

    console.log('Deploy zunUSD APS pool controller:');
    const ZunamiPoolController = await ethers.getContractFactory('ZunamiPoolControllerApsZunUSD');
    const zunamiPoolController = await ZunamiPoolController.deploy(zunamiPool.address);
    await zunamiPoolController.deployed();
    console.log('ZunamiPoolControllerApsZunUSD:', zunamiPoolController.address);

    let result = await zunamiPool.grantRole(
        await zunamiPool.CONTROLLER_ROLE(),
        zunamiPoolController.address
    );
    await result.wait();
    console.log(
        'ZunamiPoolController granted CONTROLLER_ROLE:',
        await zunamiPool.hasRole(await zunamiPool.CONTROLLER_ROLE(), zunamiPoolController.address)
    );

    await createAndInitStrategy(zunamiPool, 'ZunUSDApsVaultStrat', null, null);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
