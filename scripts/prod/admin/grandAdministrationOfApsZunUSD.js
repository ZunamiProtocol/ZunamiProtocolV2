const { ethers } = require('hardhat');

async function grantRoleTo(newAdmin, contract, roleName) {
    const role = await contract[roleName]();
    let result = await contract.grantRole(role, newAdmin);
    await result.wait();
    console.log(
        newAdmin + ' granted ' + roleName + '(' + role + '):',
        await contract.hasRole(role, newAdmin)
    );
}
async function grandStrategyRolesTo(newAdmin, stratName, stratAddr, roles) {
    const StratFactory = await ethers.getContractFactory(stratName);
    const strategy = await StratFactory.attach(stratAddr);
    console.log(`${stratName} strategy attached to: ${strategy.address}`);

    for (let i = 0; i < roles.length; i++) {
        await grantRoleTo(newAdmin, strategy, roles[i]);
    }
}

async function main() {
    const newAdmin = '0xb056B9A45f09b006eC7a69770A65339586231a34';

    const ZunamiPool = await ethers.getContractFactory('ZunamiPoolApsZunUSD');
    const zunamiPool = await ZunamiPool.attach('0x28e487bbF6b64867C29e61DccbCD17aB64082889');
    console.log('ZunamiPoolApsZunUSD:', zunamiPool.address);

    // await grantRoleTo(newAdmin, zunamiPool, 'DEFAULT_ADMIN_ROLE');
    // await grantRoleTo(newAdmin, zunamiPool, 'EMERGENCY_ADMIN_ROLE');

    const ZunamiPoolController = await ethers.getContractFactory('ZunamiPoolControllerApsZunUSD');
    const zunamiPoolController = await ZunamiPoolController.attach(
        '0xd9F559280c9d308549e84946C0d668a817fcCFB5'
    );
    console.log('ZunamiPoolControllerApsZunUSD:', zunamiPoolController.address);

    // await grantRoleTo(newAdmin, zunamiPoolController, 'DEFAULT_ADMIN_ROLE');
    //
    // await grandStrategyRolesTo(
    //     newAdmin,
    //     'ZunUSDApsVaultStrat',
    //     '0xF859C621D7fF69DF1E283385DBdE04135EEA0276',
    //     ['DEFAULT_ADMIN_ROLE']
    // );
    //
    // await grandStrategyRolesTo(
    //     newAdmin,
    //     'ZunUsdCrvUsdApsConvexCurveStrat',
    //     '0x770f991Ca9f3D1Db503024C7144498F4e5DC6CC9',
    //     ['DEFAULT_ADMIN_ROLE', 'EMERGENCY_ADMIN_ROLE']
    // );

    await grandStrategyRolesTo(
        newAdmin,
        'ZunUsdCrvUsdApsStakeDaoCurveStrat',
        '0x2457C9a3cc6221674c3C91e07A7f193037adDD43',
        ['DEFAULT_ADMIN_ROLE', 'EMERGENCY_ADMIN_ROLE']
    );
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
