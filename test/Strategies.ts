import { ethers, network } from 'hardhat';
import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';
import { BigNumber, Contract, Signer } from 'ethers';
import { parseUnits } from 'ethers/lib/utils';
import { expect } from 'chai';

import { abi as erc20ABI } from '../artifacts/@openzeppelin/contracts/token/ERC20/ERC20.sol/ERC20.json';
import * as addrs from './address.json';

import {
    ChainlinkOracle,
    CurveLPOracle,
    CurveRegistryCache,
    GenericOracle,
    ZunamiPoolUZD,
    ZunamiPooControllerUZD,
    StableConverter,
    SellingCurveRewardManager,
} from '../typechain-types';

const crvUSD_USDT_pool_addr = '0x390f3595bca2df7d23783dfd126427cceb997bf4';
const crvUSD_USDC_pool_addr = '0x4dece678ceceb27446b35c672dc7d61f30bad69e';

const curve_TricryptoUSDC_addr = '0x7f86bf177dd4f3494b841a37e810a34dd56c829b';

const curve_TricryptoUSDC_abi = [
    {
        stateMutability: 'payable',
        type: 'function',
        name: 'exchange_underlying',
        inputs: [
            { name: 'i', type: 'uint256' },
            { name: 'j', type: 'uint256' },
            { name: 'dx', type: 'uint256' },
            { name: 'min_dy', type: 'uint256' },
        ],
        outputs: [{ name: '', type: 'uint256' }],
    },
    // {"stateMutability":"payable","type":"function","name":"exchange_underlying","inputs":[{"name":"i","type":"uint256"},{"name":"j","type":"uint256"},{"name":"dx","type":"uint256"},{"name":"min_dy","type":"uint256"},{"name":"receiver","type":"address"}],"outputs":[{"name":"","type":"uint256"}]}
];

const curve_3pool_addr = '0xbebc44782c7db0a1a60cb6fe97d0b483032ff1c7';
const curve_3pool_abi = [
    {
        name: 'exchange',
        outputs: [],
        inputs: [
            { type: 'int128', name: 'i' },
            { type: 'int128', name: 'j' },
            { type: 'uint256', name: 'dx' },
            { type: 'uint256', name: 'min_dy' },
        ],
        stateMutability: 'nonpayable',
        type: 'function',
    },
];

function getMinAmount(): BigNumber[] {
    const zero = ethers.utils.parseUnits('0', 'ether');
    const amount = '1000';
    const dai = ethers.utils.parseUnits(amount, 'ether');
    const usdc = ethers.utils.parseUnits(amount, 'mwei');
    const usdt = ethers.utils.parseUnits(amount, 'mwei');
    return [dai, usdc, usdt, zero, zero];
}

async function increaseChainTime(time: number) {
    await network.provider.send('evm_increaseTime', [time]);
    await network.provider.send('evm_mine');
}

describe('Single strategy tests', () => {
    const strategyNames = ['UsdcCrvUsdStakeDaoCurve', 'UsdtCrvUsdStakeDaoCurve'];

    async function deployFixture() {
        // Contracts are deployed using the first signer/account by default
        const [admin, alice, bob, feeCollector] = await ethers.getSigners();

        const dai = new ethers.Contract(addrs.stablecoins.dai, erc20ABI, admin);
        const usdt = new ethers.Contract(addrs.stablecoins.usdt, erc20ABI, admin);
        const usdc = new ethers.Contract(addrs.stablecoins.usdc, erc20ABI, admin);

        const curveTricryptoUSDC = new ethers.Contract(
            curve_TricryptoUSDC_addr,
            curve_TricryptoUSDC_abi,
            admin
        );

        const ethAmount = ethers.utils.parseEther('1100');
        await curveTricryptoUSDC.exchange_underlying(2, 0, ethAmount, 0, { value: ethAmount });

        const curve3pool = new ethers.Contract(curve_3pool_addr, curve_3pool_abi, admin);

        const usdcAmount = ethers.utils.parseUnits('500000', 'mwei');

        await usdc.approve(curve3pool.address, usdcAmount);
        await curve3pool.exchange(1, 0, usdcAmount, 0); // usdc -> dai

        await usdc.approve(curve3pool.address, usdcAmount);
        await curve3pool.exchange(1, 2, usdcAmount, 0); // usdc -> usdt

        const CurveRegistryCacheFactory = await ethers.getContractFactory('CurveRegistryCache');
        const curveRegistryCache = (await CurveRegistryCacheFactory.deploy()) as CurveRegistryCache;

        const ChainlinkOracleFactory = await ethers.getContractFactory('ChainlinkOracle');
        const chainlinkOracle = (await ChainlinkOracleFactory.deploy()) as ChainlinkOracle;

        const GenericOracleFactory = await ethers.getContractFactory('GenericOracle');
        const genericOracle = (await GenericOracleFactory.deploy()) as GenericOracle;

        const CurveLPOracleFactory = await ethers.getContractFactory('CurveLPOracle');
        const curveLPOracle = (await CurveLPOracleFactory.deploy(
            genericOracle.address,
            curveRegistryCache.address
        )) as CurveLPOracle;

        await genericOracle.initialize(curveLPOracle.address, chainlinkOracle.address);

        await curveRegistryCache.initPool(crvUSD_USDT_pool_addr);
        await curveRegistryCache.initPool(crvUSD_USDC_pool_addr);

        const ZunamiPoolUZDFactory = await ethers.getContractFactory('ZunamiPoolUZD');
        const zunamiPool = (await ZunamiPoolUZDFactory.deploy()) as ZunamiPoolUZD;

        const ZunamiPooControllerUZDFactory = await ethers.getContractFactory(
            'ZunamiPooControllerUZD'
        );
        const zunamiPoolController = (await ZunamiPooControllerUZDFactory.deploy(
            zunamiPool.address
        )) as ZunamiPooControllerUZD;

        await zunamiPoolController.setRewardTokens([
            addrs.crypto.crv,
            addrs.crypto.cvx,
            addrs.crypto.fxs,
            addrs.crypto.sdt,
        ]);
        await zunamiPool.grantRole(
            await zunamiPool.CONTROLLER_ROLE(),
            zunamiPoolController.address
        );

        const StableConverterFactory = await ethers.getContractFactory('StableConverter');
        const stableConverter = (await StableConverterFactory.deploy()) as StableConverter;

        const SellingCurveRewardManagerFactory = await ethers.getContractFactory(
            'SellingCurveRewardManager'
        );
        const rewardManager = (await SellingCurveRewardManagerFactory.deploy(
            stableConverter.address
        )) as SellingCurveRewardManager;

        const strategies = [];

        // Init all strategies
        for (const strategyName of strategyNames) {
            const factory = await ethers.getContractFactory(strategyName);
            const strategy = await factory.deploy(genericOracle.address);
            await strategy.deployed();

            strategy.setZunamiPool(zunamiPool.address);

            if (strategyName.includes('CrvUsdStakeDaoCurve')) {
                strategy.setStableConverter(stableConverter.address);
            }

            strategies.push(strategy);
        }

        for (const user of [admin, alice, bob]) {
            await dai
                .connect(user)
                .approve(zunamiPoolController.address, parseUnits('1000000', 'ether'));
            await usdc
                .connect(user)
                .approve(zunamiPoolController.address, parseUnits('1000000', 'mwei'));
            await usdt
                .connect(user)
                .approve(zunamiPoolController.address, parseUnits('1000000', 'mwei'));
        }

        for (const user of [alice, bob]) {
            await dai.transfer(user.getAddress(), ethers.utils.parseUnits('10000', 'ether'));
            await usdc.transfer(user.getAddress(), ethers.utils.parseUnits('10000', 'mwei'));
            await usdt.transfer(user.getAddress(), ethers.utils.parseUnits('10000', 'mwei'));
        }

        return {
            admin,
            alice,
            bob,
            feeCollector,
            zunamiPool,
            zunamiPoolController,
            strategies,
            stableConverter,
            rewardManager,
            curveRegistryCache,
            curveLPOracle,
            chainlinkOracle,
            genericOracle,
            dai,
            usdc,
            usdt,
        };
    }

    it('should deposit assets', async () => {
        const { admin, alice, bob, zunamiPool, zunamiPoolController, strategies, dai, usdc, usdt } =
            await loadFixture(deployFixture);

        for (let poolId = 0; poolId < strategies.length; poolId++) {
            await zunamiPool.addPool(strategies[poolId].address);
            await zunamiPoolController.setDefaultDepositPid(poolId);
            await zunamiPoolController.setDefaultWithdrawPid(poolId);

            for (const user of [admin, alice, bob]) {
                const daiBefore = await dai.balanceOf(user.getAddress());
                const usdcBefore = await usdc.balanceOf(user.getAddress());
                const usdtBefore = await usdt.balanceOf(user.getAddress());
                const zlpBefore = await zunamiPool.balanceOf(user.getAddress());

                await expect(
                    zunamiPoolController
                        .connect(user)
                        .deposit(getMinAmount(), await user.getAddress())
                ).to.emit(zunamiPool, 'Deposited');

                expect(await dai.balanceOf(user.getAddress())).to.lt(daiBefore);
                expect(await usdc.balanceOf(user.getAddress())).to.lt(usdcBefore);
                expect(await usdt.balanceOf(user.getAddress())).to.lt(usdtBefore);
                expect(await zunamiPool.balanceOf(user.getAddress())).to.gt(zlpBefore);
            }
        }
    });

    it('should withdraw assets', async () => {
        const { alice, bob, zunamiPool, zunamiPoolController, strategies } = await loadFixture(
            deployFixture
        );

        for (let poolId = 0; poolId < strategies.length; poolId++) {
            await zunamiPool.addPool(strategies[poolId].address);
            await zunamiPoolController.setDefaultDepositPid(poolId);
            await zunamiPoolController.setDefaultWithdrawPid(poolId);

            for (const user of [alice, bob]) {
                await expect(
                    zunamiPoolController.connect(user).deposit(getMinAmount(), user.getAddress())
                ).to.emit(zunamiPool, 'Deposited');

                let stableAmount = BigNumber.from(await zunamiPool.balanceOf(user.getAddress()));
                expect(stableAmount).to.gt(0);

                await zunamiPool.connect(user).approve(zunamiPoolController.address, stableAmount);

                await expect(
                    zunamiPoolController
                        .connect(user)
                        .withdraw(stableAmount, [0, 0, 0, 0, 0], user.getAddress())
                ).to.emit(zunamiPool, 'Withdrawn');
                stableAmount = BigNumber.from(await zunamiPool.balanceOf(user.getAddress()));
                expect(stableAmount).to.eq(0);
            }
        }
    });

    it('should claim and withdraw all rewards', async () => {
        const { admin, alice, zunamiPool, zunamiPoolController, strategies } = await loadFixture(
            deployFixture
        );

        for (let i = 0; i < strategies.length; i++) {
            const strategy = strategies[i];
            await zunamiPool.addPool(strategy.address);

            await zunamiPoolController.setDefaultDepositPid(i);
            await zunamiPoolController.setDefaultWithdrawPid(i);

            await expect(
                zunamiPoolController.connect(alice).deposit(getMinAmount(), admin.getAddress())
            ).to.emit(zunamiPool, 'Deposited');
        }

        await increaseChainTime(3600 * 24 * 7);

        await zunamiPoolController.claimRewards();

        let tokens;
        let balance;
        for (let strategy of strategies) {
            if (!strategy.token) {
                continue;
            }
            const config = await strategy.config();
            if (config.rewards) {
                tokens = [await strategy.token(), ...config.rewards].map(
                    (token) => new ethers.Contract(token, erc20ABI, admin)
                );
            } else {
                tokens = [await strategy.token(), config.crv, config.cvx].map(
                    (token) => new ethers.Contract(token, erc20ABI, admin)
                );
            }

            for (let token of tokens) {
                balance = await token.balanceOf(strategy.address);
                expect(balance).to.eq(0);
            }
        }
    });

    it.only('should moveFunds only to not outdated pool', async () => {
        const { admin, alice, zunamiPool, zunamiPoolController, strategies } = await loadFixture(
            deployFixture
        );

        const poolSrc = 0;
        const poolDst = 1;
        const percentage = 10_000;

        for (let poolId = 0; poolId < 2; poolId++) {
            await zunamiPool.addPool(strategies[poolId].address);
        }

        await zunamiPoolController.setDefaultDepositPid(poolSrc);
        await zunamiPoolController.setDefaultWithdrawPid(poolSrc);

        await expect((await zunamiPool.poolInfo(poolSrc)).deposited).to.be.eq(0);
        await expect(
            zunamiPoolController.connect(alice).deposit(getMinAmount(), admin.getAddress())
        ).to.emit(zunamiPool, 'Deposited');
        await expect((await zunamiPool.poolInfo(poolSrc)).deposited).to.be.gt(0);

        console.log(
            '(await zunamiPool.poolInfo(poolSrc)).deposited',
            (await zunamiPool.poolInfo(poolSrc)).deposited
        );
        console.log(
            '(await zunamiPool.poolInfo(poolDst)).deposited',
            (await zunamiPool.poolInfo(poolDst)).deposited
        );
        await expect((await zunamiPool.poolInfo(poolSrc)).deposited).to.be.gt(0);
        await expect((await zunamiPool.poolInfo(poolDst)).deposited).to.be.eq(0);
        await expect(zunamiPool.moveFundsBatch([poolSrc], [percentage], poolDst));
        await expect((await zunamiPool.poolInfo(poolSrc)).deposited).to.be.eq(0);
        await expect((await zunamiPool.poolInfo(poolDst)).deposited).to.be.gt(0);

        console.log(
            '(await zunamiPool.poolInfo(poolSrc)).deposited',
            (await zunamiPool.poolInfo(poolSrc)).deposited
        );
        console.log(
            '(await zunamiPool.poolInfo(poolDst)).deposited',
            (await zunamiPool.poolInfo(poolDst)).deposited
        );

        await expect(zunamiPool.moveFundsBatch([poolDst], [percentage], poolSrc));
        await expect((await zunamiPool.poolInfo(poolSrc)).deposited).to.be.gt(0);
        await expect((await zunamiPool.poolInfo(poolDst)).deposited).to.be.eq(0);

        console.log(
            '(await zunamiPool.poolInfo(poolSrc)).deposited',
            (await zunamiPool.poolInfo(poolSrc)).deposited
        );
        console.log(
            '(await zunamiPool.poolInfo(poolDst)).deposited',
            (await zunamiPool.poolInfo(poolDst)).deposited
        );
    });
});
