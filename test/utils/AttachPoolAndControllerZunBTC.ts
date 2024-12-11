import { ethers } from 'hardhat';
import { ZunamiPool, ZunamiPoolThroughController } from '../../typechain-types';

export async function attachPoolAndControllerZunBTC(
    zunBTCPoolAddress: string,
    zunBTCPoolControllerAddress: string
) {
    const ZunamiPoolZunBTCFactory = await ethers.getContractFactory('ZunamiPoolZunBTC');
    const zunamiPool = (await ZunamiPoolZunBTCFactory.attach(zunBTCPoolAddress)) as ZunamiPool;

    const ZunamiPooControllerZunBTCFactory = await ethers.getContractFactory(
        'ZunamiPoolControllerZunBTC'
    );
    const zunamiPoolController = (await ZunamiPooControllerZunBTCFactory.attach(
        zunBTCPoolControllerAddress
    )) as ZunamiPoolThroughController;

    return { zunamiPool, zunamiPoolController };
}
