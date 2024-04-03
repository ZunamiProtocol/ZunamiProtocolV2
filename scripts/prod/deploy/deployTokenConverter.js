const { ethers } = require('hardhat');
const { setupTokenConverterStables } = require ('../../../test/utils/TokenConverterSetup.js');

async function main() {
    const curveRouterAddr = '0xF0d4c12A5768D806021F80a262B4d39d26C58b8D';

    console.log('Start deploy');
    const TokenConverterFactory = await ethers.getContractFactory('TokenConverter');
    const tokenConverter = await TokenConverterFactory.deploy(curveRouterAddr);
    await tokenConverter.deployed();
    console.log('tokenConverter deployed to:', tokenConverter.address);

    console.log('Starting setup token converter');
    await setupTokenConverterStables(tokenConverter);
    console.log('Token сonverter configured');
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
