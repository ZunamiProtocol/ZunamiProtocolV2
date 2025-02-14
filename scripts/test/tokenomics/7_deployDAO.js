const { ethers } = require('hardhat');

async function main() {
    console.log('Start deploy');

    const [admin] = await ethers.getSigners();

    console.log('Admin:', admin.address);

    const zunamiTeam = admin.address;
    console.log('Protocol Admin:', zunamiTeam);


    const vlZUN = '0x27A0223c1a8a9688f31d47CB89542a5CBbBa20E9';

    console.log('Deploy TimelockController:');
    const TimelockController = await ethers.getContractFactory('TimelockController');
    // const timelockController = await TimelockController.deploy(
    //     86400, // 1 day
    //     [zunamiTeam], // PROPOSERS
    //     [ethers.constants.AddressZero], // EXECUTOR
    //     zunamiTeam // admin
    // );
    // await timelockController.deployed();
    const timelockController = await TimelockController.attach('0x6C8411e9c54335D9deE5746fdAD7d9e183182815');

    console.log('TimelockController:', timelockController.address);

    console.log('Deploy ZunamiGovernor:');
    const ZunamiGovernor = await ethers.getContractFactory('ZunamiGovernor');
    const zunamiGovernor = await ZunamiGovernor.deploy(vlZUN, timelockController.address);
    await zunamiGovernor.deployed();
    // const zunamiGovernor = await ZunamiGovernor.attach('');
    console.log('ZunamiGovernor:', zunamiGovernor.address);

    await timelockController.grantRole(await timelockController.PROPOSER_ROLE(), zunamiGovernor.address);
    console.log('Grant TimelockController\'s PROPOSER_ROLE to ZunamiGovernor: ', zunamiGovernor.address);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
