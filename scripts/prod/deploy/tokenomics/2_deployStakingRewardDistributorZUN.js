const { ethers, upgrades } = require('hardhat');

async function main() {
    console.log('Start deploy');

    const [admin] = await ethers.getSigners();

    console.log('Admin:', admin.address);

    const zunTokenAddress = '0x6b5204b0be36771253cc38e88012e02b752f0f36';

    // ZUN Staking Reward Distributor - vlZUN token
    console.log('Deploy vlZUN:');
    const ZUNStakingRewardDistributorFactory = await ethers.getContractFactory(
        'ZUNStakingRewardDistributor'
    );
    const zunStakingRewardDistributor = await upgrades.deployProxy(
        ZUNStakingRewardDistributorFactory,
        [zunTokenAddress, 'Zunami Voting Token', 'vlZUN', admin.address],
        {
            kind: 'uups',
        }
    );

    await zunStakingRewardDistributor.deployed();
    console.log('ZUN Staking Reward Distributor(vlZUN):', zunStakingRewardDistributor.address);

    await zunStakingRewardDistributor.setEarlyExitReceiver(admin.address);
    console.log('Early exit receiver set to: ', admin.address);

    const rewards = [
        zunTokenAddress, // ZUN
        '0xD533a949740bb3306d119CC777fa900bA034cd52', // CRV
        '0x4e3FBD56CD56c3e72c1403e103b45Db9da5B9D2B', // CVX
        '0x73968b9a57c6E53d41345FD57a6E6ae27d6CDB2F', // SDT
        '0x3432B6A60D23Ca0dFCa7761B7ab56459D9C964D0', // FRX
    ];

    for (let i = 0; i < rewards.length; i++) {
        const tx = await zunStakingRewardDistributor.addRewardToken(rewards[i]);
        await tx.wait();
        console.log('Reward token added to ZUN staking: ', rewards[i]);
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
