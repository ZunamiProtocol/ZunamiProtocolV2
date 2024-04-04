import {
    GenericOracle,
    INativeConverter,
    IStableConverter,
    ITokenConverter,
    ZunamiPool,
} from '../../typechain-types';
import { ethers } from 'hardhat';
import { ContractFactory } from 'ethers';

async function deployStrategy(
    strategyName: string,
    factory: ContractFactory,
    tokens: string[] | undefined,
    tokensDecimals: number[] | undefined
) {
    let strategy;
    if (strategyName == 'VaultStrat' && tokens && tokensDecimals) {
        strategy = await factory.deploy(tokens, tokensDecimals);
    } else {
        strategy = await factory.deploy();
    }
    await strategy.deployed();
    return strategy;
}

export async function createStrategies(
    strategyNames: string[],
    genericOracle: GenericOracle,
    zunamiPool: ZunamiPool,
    stableConverter: IStableConverter | undefined,
    tokenConverter: ITokenConverter | undefined,
    tokens: string[] | undefined,
    tokensDecimals: number[] | undefined
) {
    const strategies = [];

    // Init all strategies
    for (const strategyName of strategyNames) {
        const factory = await ethers.getContractFactory(strategyName);
        const strategy = await deployStrategy(strategyName, factory, tokens, tokensDecimals);

        await strategy.setZunamiPool(zunamiPool.address);

        if (!strategyName.includes('Vault')) {
            await strategy.setPriceOracle(genericOracle.address);
        }

        if (
            (tokenConverter && strategyName.includes('LlamalendCrvUsdERC4626Strat')) ||
            (tokenConverter && strategyName.includes('frxETH')) ||
            (tokenConverter && strategyName.includes('stEth'))
        ) {
            await strategy.setTokenConverter(tokenConverter.address);
        }

        if (
            (stableConverter && strategyName.includes('CrvUsdStakeDaoCurve')) ||
            (stableConverter && strategyName.includes('ConvexCurve'))
        ) {
            await strategy.setStableConverter(stableConverter.address);
        }

        strategies.push(strategy);
    }
    return strategies;
}
