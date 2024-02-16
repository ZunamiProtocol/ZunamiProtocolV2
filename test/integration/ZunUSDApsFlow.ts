import { ethers, network } from 'hardhat';
import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';
import { BigNumber } from 'ethers';
import { parseUnits } from 'ethers/lib/utils';
import { expect } from 'chai';

import { abi as erc20ABI } from '../../artifacts/@openzeppelin/contracts/token/ERC20/ERC20.sol/ERC20.json';

import { mintStables } from '../utils/MintStables';
import { createAndInitConicOracles } from '../utils/CreateAndInitConicOracles';
import { createConvertersAndRewardManagerContracts } from '../utils/CreateConvertersAndRewardManagerContracts';
import { createStablecoins } from '../utils/CreateStablecoins';
import { createStrategies } from '../utils/CreateStrategies';
import { createPoolAndControllerZunUSD } from '../utils/CreatePoolAndControllerZunUSD';
import { getMinAmountZunUSD } from '../utils/GetMinAmountZunUSD';

import { ZunamiPool, ZunamiPoolCompoundController, ZunamiDepositZap } from '../../typechain-types';

const ADDRESS_ZERO = '0x0000000000000000000000000000000000000000';
const MINIMUM_LIQUIDITY = 1e3;

import * as addrs from '../address.json';

const crvUSD_USDT_pool_addr = '0x390f3595bca2df7d23783dfd126427cceb997bf4';
const crvUSD_USDC_pool_addr = '0x4dece678ceceb27446b35c672dc7d61f30bad69e';

export async function createPoolAndCompoundController(token: string, rewardManager: string) {
    const ZunamiPoolFactory = await ethers.getContractFactory('ZunamiPool');
    const zunamiPool = (await ZunamiPoolFactory.deploy('APS', 'APS')) as ZunamiPool;

    await zunamiPool.setTokens(
        [token, ADDRESS_ZERO, ADDRESS_ZERO, ADDRESS_ZERO, ADDRESS_ZERO],
        [1, 0, 0, 0, 0]
    );

    const ZunamiPooControllerFactory = await ethers.getContractFactory(
        'ZunamiPoolCompoundController'
    );
    const zunamiPoolController = (await ZunamiPooControllerFactory.deploy(
        zunamiPool.address,
        'APS LP',
        'APSLP'
    )) as ZunamiPoolCompoundController;

    await zunamiPoolController.setRewardManager(rewardManager);

    await zunamiPoolController.setFeeTokenId(0);

    await zunamiPoolController.setRewardTokens([
        addrs.crypto.crv,
        addrs.crypto.cvx,
        addrs.crypto.fxs,
        addrs.crypto.sdt,
    ]);
    await zunamiPool.grantRole(await zunamiPool.CONTROLLER_ROLE(), zunamiPoolController.address);
    return { zunamiPool, zunamiPoolController };
}

async function mintTokenTo(
    receiverAddr: string,
    ethVault: Signer,
    tokenAddr: string,
    tokenVaultAddr: string,
    tokenAmount: BigNumber
) {
    const token = new ethers.Contract(tokenAddr, erc20ABI, ethVault);
    //fund vault with eth
    await ethVault.sendTransaction({
        to: tokenVaultAddr,
        value: ethers.utils.parseEther('1'),
    });
    await network.provider.request({
        method: 'hardhat_impersonateAccount',
        params: [tokenVaultAddr],
    });
    const tokenVaultSigner: Signer = ethers.provider.getSigner(tokenVaultAddr);
    await token.connect(tokenVaultSigner).transfer(receiverAddr, tokenAmount);
    await network.provider.request({
        method: 'hardhat_stopImpersonatingAccount',
        params: [tokenVaultAddr],
    });
}

describe('ZunUSD flow APS tests', () => {
    const strategyNames = ['ZunUSDVaultStrat'];
    const strategyApsNames = ['VaultStrat'];

    async function deployFixture() {
        // Contracts are deployed using the first signer/account by default
        const [admin, alice, bob, feeCollector] = await ethers.getSigners();

        const { dai, usdt, usdc } = createStablecoins(admin);

        await mintStables(admin, usdc);

        const { curveRegistryCache, chainlinkOracle, genericOracle, curveLPOracle } =
            await createAndInitConicOracles([crvUSD_USDT_pool_addr, crvUSD_USDC_pool_addr]);

        const { stableConverter, rewardManager } = await createConvertersAndRewardManagerContracts(
            'StableConverter',
            'SellingCurveRewardManager'
        );

        const { zunamiPool, zunamiPoolController, frxEthNativeConverter } =
            await createPoolAndControllerZunUSD();

        const { stableConverter: stableConverterAps, rewardManager: rewardManagerAps } =
            await createConvertersAndRewardManagerContracts(
                'StubStableConverter',
                'SellingCurveRewardManager'
            );

        const { zunamiPool: zunamiPoolAps, zunamiPoolController: zunamiPoolControllerAps } =
            await createPoolAndCompoundController(zunamiPool.address, rewardManagerAps.address);

        const strategies = await createStrategies(
            strategyNames,
            genericOracle,
            zunamiPool,
            stableConverter,
            frxEthNativeConverter,
            undefined,
            undefined
        );

        const strategiesAps = await createStrategies(
            strategyApsNames,
            genericOracle,
            zunamiPoolAps,
            stableConverter,
            frxEthNativeConverter,
            [zunamiPool.address, ADDRESS_ZERO, ADDRESS_ZERO, ADDRESS_ZERO, ADDRESS_ZERO],
            [1, 0, 0, 0, 0]
        );

        const tokenApprovedAmount = '10000';
        for (const user of [admin, alice, bob]) {
            await dai
                .connect(user)
                .approve(zunamiPoolController.address, parseUnits(tokenApprovedAmount, 'ether'));
            await usdc
                .connect(user)
                .approve(zunamiPoolController.address, parseUnits(tokenApprovedAmount, 'mwei'));
            await usdt
                .connect(user)
                .approve(zunamiPoolController.address, parseUnits(tokenApprovedAmount, 'mwei'));
        }

        const tokenAmount = '10000';
        for (const user of [alice, bob]) {
            await dai.transfer(user.getAddress(), ethers.utils.parseUnits(tokenAmount, 'ether'));
            await usdc.transfer(user.getAddress(), ethers.utils.parseUnits(tokenAmount, 'mwei'));
            await usdt.transfer(user.getAddress(), ethers.utils.parseUnits(tokenAmount, 'mwei'));
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
            zunamiPoolAps,
            zunamiPoolControllerAps,
            strategiesAps,
            stableConverterAps,
            rewardManagerAps,
            curveRegistryCache,
            curveLPOracle,
            chainlinkOracle,
            genericOracle,
            dai,
            usdc,
            usdt,
        };
    }

    it('should compound all rewards', async () => {
        const {
            admin,
            zunamiPool,
            zunamiPoolController,
            zunamiPoolAps,
            zunamiPoolControllerAps,
            strategies,
            strategiesAps,
            stableConverterAps,
        } = await loadFixture(deployFixture);

        for (let i = 0; i < strategies.length; i++) {
            const strategy = strategies[i];
            await zunamiPool.addStrategy(strategy.address);

            await zunamiPoolController.setDefaultDepositSid(i);
            await zunamiPoolController.setDefaultWithdrawSid(i);

            await expect(
                zunamiPoolController
                    .connect(admin)
                    .deposit(getMinAmountZunUSD('10000'), admin.getAddress())
            ).to.emit(zunamiPool, 'Deposited');
        }

        for (let i = 0; i < strategiesAps.length; i++) {
            const strategy = strategiesAps[i];
            await zunamiPoolAps.addStrategy(strategy.address);

            await zunamiPoolControllerAps.setDefaultDepositSid(i);
            await zunamiPoolControllerAps.setDefaultWithdrawSid(i);

            const zStableBalance = parseUnits('10000', 'ether');

            await zunamiPool.approve(zunamiPoolControllerAps.address, zStableBalance);

            await expect(
                zunamiPoolControllerAps
                    .connect(admin)
                    .deposit([zStableBalance, 0, 0, 0, 0], admin.getAddress())
            ).to.emit(zunamiPoolAps, 'Deposited');
        }

        expect(await zunamiPoolControllerAps.collectedManagementFee()).to.eq(0);

        await zunamiPoolControllerAps.autoCompoundAll();

        expect(await zunamiPoolControllerAps.collectedManagementFee()).to.eq(0);

        // "0xD533a949740bb3306d119CC777fa900bA034cd52", // CRV
        // "0xF977814e90dA44bFA03b6295A0616a897441aceC", // CRV Vault
        await mintTokenTo(
            zunamiPoolControllerAps.address, // zEthFrxEthCurveConvex
            admin,
            '0x4e3FBD56CD56c3e72c1403e103b45Db9da5B9D2B', // CVX
            '0x28C6c06298d514Db089934071355E5743bf21d60', // CVX Vault
            parseUnits('100', 'ether')
        );

        await zunamiPool.transfer(
            stableConverterAps.address,
            ethers.utils.parseUnits('20000', 'ether').sub(MINIMUM_LIQUIDITY)
        );

        await zunamiPoolControllerAps.autoCompoundAll();

        expect(await zunamiPoolControllerAps.collectedManagementFee()).to.not.eq(0);

        expect(await zunamiPool.balanceOf(zunamiPoolControllerAps.address)).to.eq(
            await zunamiPoolControllerAps.collectedManagementFee()
        );

        await zunamiPoolControllerAps.claimManagementFee();

        expect(await zunamiPoolControllerAps.collectedManagementFee()).to.eq(0);

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

        for (let i = 0; i < strategiesAps.length; i++) {
            let sharesAmount = BigNumber.from(
                await zunamiPoolControllerAps.balanceOf(admin.getAddress())
            );
            expect(sharesAmount).to.gt(0);

            let assetsBefore = BigNumber.from(await zunamiPool.balanceOf(admin.getAddress()));

            await expect(
                zunamiPoolControllerAps.withdraw(sharesAmount, [0, 0, 0, 0, 0], admin.getAddress())
            ).to.emit(zunamiPoolAps, 'Withdrawn');
            sharesAmount = BigNumber.from(
                await zunamiPoolControllerAps.balanceOf(admin.getAddress())
            );
            expect(sharesAmount).to.eq(0);

            expect(
                BigNumber.from(await zunamiPool.balanceOf(admin.getAddress())).sub(assetsBefore)
            ).to.gt(0);
        }
    });

    it('should deposit to aps using zap', async () => {
        const {
            admin,
            zunamiPool,
            zunamiPoolController,
            zunamiPoolAps,
            zunamiPoolControllerAps,
            dai,
            usdc,
            usdt,
            strategies,
            strategiesAps,
        } = await loadFixture(deployFixture);

        // Add strategies to omnipool and aps pool
        const sid = 0;
        await zunamiPool.addStrategy(strategies[sid].address);
        await zunamiPoolAps.addStrategy(strategiesAps[sid].address);

        //deploy zap
        const ZunamiDepositZapFactory = await ethers.getContractFactory('ZunamiDepositZap');
        const zunamiDepositZap = (await ZunamiDepositZapFactory.deploy(
            zunamiPoolController.address,
            zunamiPoolControllerAps.address
        )) as ZunamiDepositZap;

        expect(await zunamiPoolControllerAps.balanceOf(admin.getAddress())).to.eq(0);

        const tokenAmount = '10000';
        await dai
            .connect(admin)
            .approve(zunamiDepositZap.address, parseUnits(tokenAmount, 'ether'));
        await usdc
            .connect(admin)
            .approve(zunamiDepositZap.address, parseUnits(tokenAmount, 'mwei'));
        await usdt
            .connect(admin)
            .approve(zunamiDepositZap.address, parseUnits(tokenAmount, 'mwei'));

        await zunamiDepositZap
            .connect(admin)
            .deposit(getMinAmountZunUSD(tokenAmount), admin.getAddress());

        expect(await zunamiPoolControllerAps.balanceOf(admin.getAddress())).to.gt(0);
    });
});
