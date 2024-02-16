const { ethers } = require('hardhat');

async function main() {
    const omnipoolControllerAddr = '0x3694Db838a8cAf3b1c234529bB1b447bd849F357';
    const apsControllerAddr = '0x1C4e36edBa364406f181fe9B3a4E6FC023DED0bc';

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
