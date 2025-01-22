const {ethers} = require('hardhat');

const ZUN_ADDRESS = "0x6b5204B0Be36771253Cc38e88012E02B752f0f36"

async function deployStakingRewardDistributorGauge(stakingRewardDistributorAddress, admin) {

    const DistributorGaugeFactory = await ethers.getContractFactory("StakingRewardDistributorGauge");

    const distributorGauge = await DistributorGaugeFactory.deploy(
        ZUN_ADDRESS,
        stakingRewardDistributorAddress
    );
    await distributorGauge.deployed();
    console.log('StakingRewardDistributorGauge for ', stakingRewardDistributorAddress,' deployed to:', distributorGauge.address);

    const stakingRewardDistributor = await ethers.getContractAt('ZUNStakingRewardDistributor', stakingRewardDistributorAddress);
    await stakingRewardDistributor
        .connect(admin)
        .grantRole(
            await stakingRewardDistributor.DISTRIBUTOR_ROLE(),
            distributorGauge.address
        );
    console.log('StakingRewardDistributorGauge ', stakingRewardDistributorAddress, ' DISTRIBUTOR_ROLE granted to: ', distributorGauge.address);
}

async function main() {
    console.log('Start deploy');

    const [admin] = await ethers.getSigners();
    console.log('Admin:', admin.address);

    console.log('ZUN address:', ZUN_ADDRESS);

    const zunBtcStakingRewardDistributorAddress =
        "0xe03D3429b958E73eDF4Cf985a823c70B01B48280";

    await deployStakingRewardDistributorGauge(zunBtcStakingRewardDistributorAddress, admin);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
