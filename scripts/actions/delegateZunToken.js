const { ethers } = require('hardhat');
async function main() {
    console.log('Start depositing tokens to controller');

    const [admin] = await ethers.getSigners();

    console.log('Admin:', admin.address);

    // testnet
    const zunAddr = '0xbf3127C1554C02f4e60031E29f890a1A700564f6';
    const zunStakingAddress = '0x27A0223c1a8a9688f31d47CB89542a5CBbBa20E9';

    const ERC20TokenFactory = await ethers.getContractFactory('ERC20Token');
    const zunToken = await ERC20TokenFactory.attach(zunAddr);
    console.log('ZUNToken:', zunToken.address);

    const ZunStaking = await ethers.getContractFactory('ZUNStakingRewardDistributor');
    const zunStaking = await ZunStaking.attach(zunStakingAddress);
    console.log('ZUNStakingRewardDistributor:', zunStaking.address);

    const receiver = admin.address;
    tx = await zunStaking.delegate(
        receiver
    )
    await tx.wait();

    console.log('Delegate: ', (await zunStaking.delegates(receiver)).toString());
    console.log('Delegated amount: ', (await zunStaking.getVotes(receiver)).toString());
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
