const { ethers } = require('hardhat');

async function main() {

    const tokenConverterAddress = '0xf48A59434609b6e934c2cF091848FA2D28b34bfc';

    // // zunUSD
    // const zunamiPoolAddress = '0x8C0D76C9B18779665475F3E212D9Ca1Ed6A1A0e6';
    // const zunamiPoolControllerAddress = '0x2F858e4d6a96c81E37a130314D6cECB64FDC6f4E';
    //
    // // zunUSD APS:
    // const zunamiPoolAddress = '0x28e487bbF6b64867C29e61DccbCD17aB64082889';
    // const zunamiPoolControllerAddress = '0xd9F559280c9d308549e84946C0d668a817fcCFB5';

    // // zunETH:
    // const zunamiPoolAddress = '0xc2e660C62F72c2ad35AcE6DB78a616215E2F2222';
    // const zunamiPoolControllerAddress = '0x4BD57f97E35E7c3302Dc3A8d4d803826856F9f32';

    // // zunETH APS:
    // const zunamiPoolAddress = '0x5Ab3aa11a40eB34f1d2733f08596532871bd28e2';
    // const zunamiPoolControllerAddress = '0xD8132d8cfCA9Ed8C95e46Cb59ae6E2C9963dA61f';

    // zunBTC:
    const zunamiPoolAddress = '0x0FA308AE0ddE633b6eDE22ba719E7E0Bc45FC6dB';
    const zunamiPoolControllerAddress = '0x8d6C5C61E815A53b1D24AC94DEEC62f31911EeB4';

    // // zunBTC APS:
    // const zunamiPoolAddress = '0x3c6e1ffffc293e93bb383b375ba348b85e828D82';
    // const zunamiPoolControllerAddress = ' 0xAEa5f929bC26Dea0c3f5d6dcb0e00ce83751Fc41';



    const ZunamiPool = await ethers.getContractFactory('ZunamiPoolZunUSD');
    const zunamiPool = await ZunamiPool.attach(zunamiPoolAddress);
    console.log('ZunamiPoolZunUSD:', zunamiPool.address);

    const ZunamiPoolController = await ethers.getContractFactory('ZunamiPoolControllerZunUSD');
    const zunamiPoolController = await ZunamiPoolController.attach(
        zunamiPoolControllerAddress
    );
    console.log('ZunamiPoolControllerZunUSD:', zunamiPoolController.address);

    const TokenConverterFactory = await ethers.getContractFactory('TokenConverter');
    const tokenConverter = await TokenConverterFactory.attach(
        tokenConverterAddress
    );
    console.log('TokenConverter:', tokenConverter.address);

    const StrategyFactory = await ethers.getContractFactory("VaultStrat");

    const length = await zunamiPool.strategyCount();
    for (let i = 0; i < length; i++) {
        console.log('Strategy ', i, ' :');
        const strategyInfo = await zunamiPool.strategyInfo(i);
        const strategyAddress = strategyInfo.strategy;
        const strategy = await StrategyFactory.attach(strategyAddress);
        const totalHoldings = await strategy.totalHoldings();
        console.log(' -- total holdings:', ethers.utils.formatUnits(totalHoldings, 18));

        const minted = strategyInfo.minted;
        console.log(' -- minted:', ethers.utils.formatUnits(minted, 18));
        console.log(' -- diff:', ethers.utils.formatUnits(totalHoldings.sub(minted)));
        console.log(' -- peg(%):', Math.trunc(Number(totalHoldings.sub(minted)) / Number(totalHoldings) * 10000) / 100);

    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
