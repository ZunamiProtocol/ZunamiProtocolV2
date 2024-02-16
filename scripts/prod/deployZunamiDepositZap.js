const { ethers } = require('hardhat');

async function main() {
    const omnipoolControllerAddr = '0x9df40870830d24c0506F7Cf5042f14C04590F8e5';
    const apsControllerAddr = '0xd5deE282790a73297efF143f2466A253E5191266';

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
