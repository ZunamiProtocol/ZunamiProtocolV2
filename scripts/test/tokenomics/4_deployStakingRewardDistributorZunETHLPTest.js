const { ethers, upgrades } = require('hardhat');

async function main() {
    console.log('Start deploy');

    const [admin] = await ethers.getSigners();

    console.log('Admin:', admin.address);

    const zunTokenAddress = '0xbf3127C1554C02f4e60031E29f890a1A700564f6';

    // Zunami USD APS LP Staking

    const apsZunETHControllerLP = '0xcC6Fc381ab661078b147591ecc8B78209634E42d';

    console.log('Deploy Zunami ETH APS LP Staking:');
    const StakingRewardDistributorFactory = await ethers.getContractFactory(
        'StakingRewardDistributor'
    );

    const stakingRewardDistributor = await upgrades.deployProxy(
        StakingRewardDistributorFactory,
        [apsZunETHControllerLP, 'Test Zunami ETH APS LP Staking', 'tapsZunETHLP-stk', admin.address],
        {
            kind: 'uups',
        }
    );

    await stakingRewardDistributor.deployed();
    console.log('Staking Reward Distributor LP:', stakingRewardDistributor.address);

    tx = await stakingRewardDistributor.addRewardToken(zunTokenAddress);
    await tx.wait();
    console.log('Reward token added: ', zunTokenAddress);

}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
