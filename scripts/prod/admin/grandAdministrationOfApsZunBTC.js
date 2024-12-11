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

    const ZunamiPool = await ethers.getContractFactory('ZunamiPoolApsZunBTC');
    const zunamiPool = await ZunamiPool.attach('0x3c6e1ffffc293e93bb383b375ba348b85e828D82');
    console.log('ZunamiPoolApsZunBTC:', zunamiPool.address);

    await grantRoleTo(newAdmin, zunamiPool, 'DEFAULT_ADMIN_ROLE');
    await grantRoleTo(newAdmin, zunamiPool, 'EMERGENCY_ADMIN_ROLE');

    const ZunamiPoolController = await ethers.getContractFactory('ZunamiPoolControllerApsZunBTC');
    const zunamiPoolController = await ZunamiPoolController.attach(
        '0xAEa5f929bC26Dea0c3f5d6dcb0e00ce83751Fc41'
    );
    console.log('ZunamiPoolControllerApsZunBTC:', zunamiPoolController.address);

    await grantRoleTo(newAdmin, zunamiPoolController, 'DEFAULT_ADMIN_ROLE');

    await grandStrategyRolesTo(
        newAdmin,
        'ZunBTCApsVaultStrat',
        '0x46ACb3e0c0954DB538cF7EF9e475BCeA83c3eD65',
        ['DEFAULT_ADMIN_ROLE']
    );

    await grandStrategyRolesTo(
        newAdmin,
        'ZunBtcTBtcApsStakeDaoCurveStrat',
        '0x7F5Ef1f7F81BD21eC9F4025bD9574849D6A4CE12',
        ['DEFAULT_ADMIN_ROLE', 'EMERGENCY_ADMIN_ROLE']
    );
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
