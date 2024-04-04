import { ethers } from 'hardhat';
import {
    IRewardManager,
    IStableConverter,
    INativeConverter,
    ITokenConverter,
} from '../../typechain-types';

export async function createConvertersAndRewardManagerContracts(
    stableConverterName: string,
    rewardManagerName: string
) {
    const StableConverterFactory = await ethers.getContractFactory(stableConverterName);
    const stableConverter = (await StableConverterFactory.deploy()) as IStableConverter;

    const SellingCurveRewardManagerFactory = await ethers.getContractFactory(rewardManagerName);
    const rewardManager = (await SellingCurveRewardManagerFactory.deploy(
        stableConverter.address
    )) as IRewardManager;

    const curveRouter = '0xF0d4c12A5768D806021F80a262B4d39d26C58b8D';
    const TokenConverterFactory = await ethers.getContractFactory('TokenConverter');
    const tokenConverter = (await TokenConverterFactory.deploy(curveRouter)) as ITokenConverter;

    return { stableConverter, rewardManager, tokenConverter };
}
