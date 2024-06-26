const { ethers } = require('hardhat');

async function main() {
    // // zunUSD
    // const omnipoolControllerAddr = '0x618eee502CDF6b46A2199C21D1411f3F6065c940';
    // const apsControllerAddr = '0xd9F559280c9d308549e84946C0d668a817fcCFB5';

    // zunETH
    const omnipoolControllerAddr = '0x54A00DA65c79DDCe24E7fe4691737FD70F7797DF';
    const apsControllerAddr = '0xD8132d8cfCA9Ed8C95e46Cb59ae6E2C9963dA61f';

    const ZunamiDepositZapFactory = await ethers.getContractFactory('ZunamiDepositZap');
    const zunamiDepositZap = await ZunamiDepositZapFactory.deploy(
        omnipoolControllerAddr,
        apsControllerAddr
    );
    console.log(
        'ZunamiDepositZapFactory deployed to:',
        zunamiDepositZap.address,
        'with args:',
        omnipoolControllerAddr,
        apsControllerAddr
    );
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
