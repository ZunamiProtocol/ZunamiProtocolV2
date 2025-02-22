const { ethers } = require('hardhat');

async function main() {
    console.log('Start deploy');

    const [admin] = await ethers.getSigners();

    console.log('Admin:', admin.address);

    const zunamiTeam = '0xb056B9A45f09b006eC7a69770A65339586231a34';
    console.log('Protocol Admin:', zunamiTeam);


    const vlZUN = '0x45af4F12B46682B3958B297bAcebde2cE2E795c3';

    console.log('Deploy TimelockController:');
    const TimelockController = await ethers.getContractFactory('TimelockController');
    // const timelockController = await TimelockController.deploy(
    //     86400, // 1 day
    //     [zunamiTeam], // PROPOSERS
    //     [ethers.constants.AddressZero], // EXECUTOR
    //     zunamiTeam // admin
    // );
    // await timelockController.deployed();

    const timelockController = await TimelockController.attach('0xd752bbeb0b199026cbb7d76e4EEb30440abefca4');

    console.log('TimelockController:', timelockController.address);

    console.log('Deploy ZunamiGovernor:');
    const ZunamiGovernor = await ethers.getContractFactory('ZunamiGovernor');
    // const zunamiGovernor = await ZunamiGovernor.deploy(vlZUN, timelockController.address);
    // await zunamiGovernor.deployed();
    const zunamiGovernor = await ZunamiGovernor.attach('0x0357F8afCf8BD2b119a4451bf605BEF8cCA03f98');
    console.log('ZunamiGovernor:', zunamiGovernor.address);

    await timelockController.grantRole(await timelockController.PROPOSER_ROLE(), zunamiGovernor.address);
    console.log('Grant PROPOSER_ROLE to ZunamiGovernor for: ', zunamiGovernor.address);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
