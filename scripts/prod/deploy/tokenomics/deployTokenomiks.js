const { ethers, upgrades } = require('hardhat');

async function main() {
    console.log('Start deploy');

    const [admin] = await ethers.getSigners();

    console.log('Admin:', admin.address);

    // ZUN Token

    console.log('Deploy Zun Token:');
    const ZUNToken = await ethers.getContractFactory('ZunamiToken');
    const zunToken = await ZUNToken.deploy(admin.address);
    await zunToken.deployed();
    console.log('Zunami Token (ZUN):', zunToken.address);

    const zunBalance = await zunToken.balanceOf(admin.address);
    console.log('ZUN balance:', ethers.utils.formatEther(zunBalance));

    // ZUN Staking Reward Distributor - vlZUN token

    console.log('Deploy Staking Reward Distributor ZUN:');
    const ZUNStakingRewardDistributorFactory = await ethers.getContractFactory(
        'ZUNStakingRewardDistributor'
    );
    const zunStakingRewardDistributor = await upgrades.deployProxy(
        ZUNStakingRewardDistributorFactory,
        [zunToken.address, 'Zunami Voting Token', 'vlZUN', admin.address],
        {
            kind: 'uups',
        }
    );

    await zunStakingRewardDistributor.deployed();
    console.log('ZUN Staking Reward Distributor:', zunStakingRewardDistributor.address);

    await zunStakingRewardDistributor.setEarlyExitReceiver(admin.address);
    console.log('Early exit receiver set to: ', admin.address);

    const rewards = [
        zunToken.address, // ZUN
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

    // DAO

    const vlZUN = zunStakingRewardDistributor.address;

    console.log('Deploy TimelockController:');
    const TimelockController = await ethers.getContractFactory('TimelockController');
    const timelockController = await TimelockController.deploy(
        172800, // 2 days
        [admin.address], // PROPOSERS
        [admin.address], // EXECUTOR
        admin.address
    );
    await timelockController.deployed();
    console.log('TimelockController:', timelockController.address);

    console.log('Deploy ZunamiGovernor:');
    const ZunamiGovernor = await ethers.getContractFactory('ZunamiGovernor');
    const zunamiGovernor = await ZunamiGovernor.deploy(vlZUN, timelockController.address);
    await zunamiGovernor.deployed();
    console.log('ZunamiGovernor:', zunamiGovernor.address);


    // Aps zunUSD LP Staking Reward Distributor

    console.log('Deploy StakingRewardDistributorGauge:');
    const StakingRewardDistributorGauge = await ethers.getContractFactory(
        'StakingRewardDistributorGauge'
    );
    const gauge = await StakingRewardDistributorGauge.deploy(
        zunToken.address,
        zunStakingRewardDistributor.address
    );
    await gauge.deployed();
    console.log('StakingRewardDistributorGauge:', gauge.address);

    // get current block number
    const blockNumber = await ethers.provider.getBlockNumber();
    console.log('Deploy ZunDistributor:');
    const ZunDistributor = await ethers.getContractFactory('ZunDistributor');
    const distributor = await ZunDistributor.deploy(
        zunToken.address,
        vlZUN,
        admin.address,
        blockNumber,
        [gauge.address],
        [ethers.utils.parseEther('100')]
    );
    await distributor.deployed();
    console.log('ZunDistributor:', distributor.address);

    // Zunami USD APS LP Staking

    const apsZunUSDControllerLP = '0xd9F559280c9d308549e84946C0d668a817fcCFB5';

    console.log('Deploy Zunami USD APS LP Staking:');
    const StakingRewardDistributorFactory = await ethers.getContractFactory(
        'StakingRewardDistributor'
    );

    const stakingRewardDistributor = await upgrades.deployProxy(
        StakingRewardDistributorFactory,
        [apsZunUSDControllerLP, 'Zunami USD APS LP Staking', 'apsZunUSDLP-stk', admin.address],
        {
            kind: 'uups',
        }
    );

    await stakingRewardDistributor.deployed();
    console.log('Staking Reward Distributor LP:', stakingRewardDistributor.address);

    tx = await stakingRewardDistributor.addRewardToken(zunToken.address);
    await tx.wait();
    console.log('Reward token added: ', zunToken.address);



}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
