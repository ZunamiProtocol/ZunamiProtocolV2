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
    const timelockController = await TimelockController.deploy(
        86400, // 1 day
        [zunamiTeam], // PROPOSERS
        [ethers.constants.AddressZero], // EXECUTOR
        zunamiTeam // admin
    );
    await timelockController.deployed();
    console.log('TimelockController:', timelockController.address);

    console.log('Deploy ZunamiGovernor:');
    const ZunamiGovernor = await ethers.getContractFactory('ZunamiGovernor');
    const zunamiGovernor = await ZunamiGovernor.deploy(vlZUN, timelockController.address);
    await zunamiGovernor.deployed();
    console.log('ZunamiGovernor:', zunamiGovernor.address);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
