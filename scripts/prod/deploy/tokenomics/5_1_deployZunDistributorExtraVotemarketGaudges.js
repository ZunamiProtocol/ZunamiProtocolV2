const {ethers} = require('hardhat');

const ETH_crvUSD_zunUSD_BOUNTY_ID = 236;
const ARBITRUM_zunUSD_crvUSD_BOUNTY_ID = 244;
const ARBITRUM_zunETH_wETH_BOUNTY_ID = 245;
const ZUN_ADDRESS = "0x6b5204B0Be36771253Cc38e88012E02B752f0f36"

async function deployVotemarketGauge(bountyId) {
    const GaugeFactory = await ethers.getContractFactory(
        "VotemarketGauge"
    );
    const distributorGauge = await GaugeFactory.deploy(bountyId);
    await distributorGauge.deployed();
    console.log('VotemarketGauge for bountyID: ', bountyId, ' deployed to:', distributorGauge.address);
}

async function main() {
    console.log('Start deploy');

    const [admin] = await ethers.getSigners();
    console.log('Admin:', admin.address);

    console.log('ZUN address:', ZUN_ADDRESS);

    await deployVotemarketGauge(ETH_crvUSD_zunUSD_BOUNTY_ID);
    await deployVotemarketGauge(ARBITRUM_zunUSD_crvUSD_BOUNTY_ID);
    await deployVotemarketGauge(ARBITRUM_zunETH_wETH_BOUNTY_ID);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
