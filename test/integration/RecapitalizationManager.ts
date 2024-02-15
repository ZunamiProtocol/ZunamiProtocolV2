import { ethers, upgrades } from 'hardhat';
import * as addresses from '../address.json';
import {
    IERC20,
    RecapitalizationManager,
    SellingCurveRewardManager,
    StableConverter,
    StakingRewardDistributor,
    ZunamiToken,
} from '../../typechain-types';
import {
    impersonateAccount,
    loadFixture,
    mine,
    reset,
    setBalance,
} from '@nomicfoundation/hardhat-network-helpers';
import { expect } from 'chai';
import { BigNumber } from 'ethers';
import { parseEther, parseUnits } from 'ethers/lib/utils';
import { FORK_BLOCK_NUMBER, PROVIDER_URL } from '../../hardhat.config';
import { anyUint } from '@nomicfoundation/hardhat-chai-matchers/withArgs';
import { createStrategies } from '../utils/CreateStrategies';
import { createConvertersAndRewardManagerContracts } from '../utils/CreateConvertersAndRewardManagerContracts';
import { createStablecoins } from '../utils/CreateStablecoins';
import { mintStables } from '../utils/MintStables';
import { createAndInitConicOracles } from '../utils/CreateAndInitConicOracles';
import { createPoolAndControllerZunUSD } from '../utils/CreatePoolAndControllerZunUSD';
import { getMinAmountZunUSD } from '../utils/GetMinAmountZunUSD';

const parseZUN = (token: number) => BigNumber.from(token).mul(BigNumber.from(10).pow(18));

const CVX_SPONSOR = '0x3026BDf87ffc13533C862Ec0FA3EdAf34E02AE90';
const CRV_SPONSOR = '0x0E33Be39B13c576ff48E14392fBf96b02F40Cd34';
const FXS_SPONSOR = '0xb744bEA7E6892c380B781151554C7eBCc764910b';
const SDT_SPONSOR = '0xAced00E50cb81377495ea40A1A44005fe6d2482d';
const SPELL_SPONSOR = '0x8C54EbDD960056d2CfF5998df5695dACA1FC0190';

describe('Recapitalization Manager', async () => {
    async function deployFixture() {
        // set block number of the fork
        await reset(PROVIDER_URL, 19199332);

        const [owner, otherAccount, otherAccount1, earlyExitReceiver] = await ethers.getSigners();

        // deploy zunami tokens
        const ZunToken = await ethers.getContractFactory('ZunamiToken');
        const ZUN = (await ZunToken.deploy(owner.address)) as ZunamiToken;
        await ZUN.deployed();
        const ZunamiVotingToken = await ethers.getContractFactory('ZunamiVotingToken');
        const vlZUN = await ZunamiVotingToken.deploy(owner.address);
        await vlZUN.deployed();

        // deploy distributor contract
        const StakingRewardDistributor = await ethers.getContractFactory(
            'StakingRewardDistributor'
        );
        const instance = await upgrades.deployProxy(StakingRewardDistributor, [], {
            kind: 'uups',
        });
        await instance.deployed();
        const stakingRewardDistributor = instance as StakingRewardDistributor;
        await vlZUN.grantRole(vlZUN.ISSUER_ROLE(), stakingRewardDistributor.address);

        await stakingRewardDistributor.setEarlyExitReceiver(earlyExitReceiver.address);
        await stakingRewardDistributor.addPool(100, ZUN.address, vlZUN.address, false);
        await stakingRewardDistributor.addRewardToken(addresses.crypto.crv);
        await stakingRewardDistributor.addRewardToken(addresses.crypto.cvx);
        await stakingRewardDistributor.addRewardToken(addresses.crypto.fxs);
        await stakingRewardDistributor.addRewardToken(addresses.crypto.sdt);

        // deploy recapitalization manager
        const RecapitalizationManager = await ethers.getContractFactory('RecapitalizationManager');
        const recapitalizationManager = (await RecapitalizationManager.deploy(
            ZUN.address
        )) as RecapitalizationManager;
        await recapitalizationManager.deployed();

        const rewards = [
            addresses.crypto.crv,
            addresses.crypto.cvx,
            addresses.crypto.fxs,
            addresses.crypto.sdt,
        ];
        await recapitalizationManager.setRewardTokens(rewards);
        await recapitalizationManager.setRewardDistributor(stakingRewardDistributor.address);

        await stakingRewardDistributor.grantRole(
            stakingRewardDistributor.DISTRIBUTOR_ROLE(),
            recapitalizationManager.address
        );

        // get reward tokens
        const CRV = (await ethers.getContractAt('IERC20', addresses.crypto.crv)) as IERC20;
        const CVX = (await ethers.getContractAt('IERC20', addresses.crypto.cvx)) as IERC20;
        const FXS = (await ethers.getContractAt('IERC20', addresses.crypto.fxs)) as IERC20;
        const SDT = (await ethers.getContractAt('IERC20', addresses.crypto.sdt)) as IERC20;
        const SPELL = (await ethers.getContractAt('IERC20', addresses.crypto.spell)) as IERC20;

        return {
            owner,
            otherAccount,
            otherAccount1,
            ZUN,
            stakingRewardDistributor,
            recapitalizationManager,
            earlyExitReceiver,
            CRV,
            CVX,
            FXS,
            SDT,
            SPELL,
        };
    }

    // Reset the network to the initial state
    after(async function () {
        await reset(PROVIDER_URL, FORK_BLOCK_NUMBER);
    });

    describe('Deployment', async () => {
        it('Should correctly deploy the contracts', async () => {
            // given
            const {
                owner,
                recapitalizationManager,
                ZUN,
                stakingRewardDistributor,
                earlyExitReceiver,
            } = await loadFixture(deployFixture);

            // then
            expect(await ZUN.totalSupply()).to.equal(parseZUN(100000000));
            expect(await ZUN.balanceOf(owner.address)).to.equal(parseZUN(100000000));

            expect(await stakingRewardDistributor.earlyExitReceiver()).to.equal(
                earlyExitReceiver.address
            );
            expect(await stakingRewardDistributor.isRewardTokenAdded(addresses.crypto.crv)).is.true;
            expect(await stakingRewardDistributor.isRewardTokenAdded(addresses.crypto.cvx)).is.true;
            expect(await stakingRewardDistributor.isRewardTokenAdded(addresses.crypto.fxs)).is.true;
            expect(await stakingRewardDistributor.isRewardTokenAdded(addresses.crypto.sdt)).is.true;
            expect(await stakingRewardDistributor.poolCount()).to.equal(1);

            expect(await recapitalizationManager.rewardTokens(0)).to.equal(addresses.crypto.crv);
            expect(await recapitalizationManager.rewardTokens(1)).to.equal(addresses.crypto.cvx);
            expect(await recapitalizationManager.rewardTokens(2)).to.equal(addresses.crypto.fxs);
            expect(await recapitalizationManager.rewardTokens(3)).to.equal(addresses.crypto.sdt);
            expect(await recapitalizationManager.zunToken()).to.equal(ZUN.address);
            expect(await recapitalizationManager.stakingRewardDistributor()).to.equal(
                stakingRewardDistributor.address
            );
            expect(await recapitalizationManager.accumulationPeriod()).to.equal(
                await recapitalizationManager.INITIAL_ACCUMULATION_PERIOD()
            );
            expect(
                await recapitalizationManager.hasRole(
                    recapitalizationManager.DEFAULT_ADMIN_ROLE(),
                    owner.address
                )
            );
            expect(
                await recapitalizationManager.hasRole(
                    recapitalizationManager.EMERGENCY_ADMIN_ROLE(),
                    owner.address
                )
            );
        });
    });

    describe('Reward distribution', async () => {
        it('Should distribute rewards from recapitalization manager', async () => {
            // given
            const { recapitalizationManager, stakingRewardDistributor, CRV, CVX, FXS, SDT } =
                await loadFixture(deployFixture);
            await provideLiquidity(
                addresses.crypto.crv,
                CRV_SPONSOR,
                recapitalizationManager.address,
                parseEther('10')
            );
            await provideLiquidity(
                addresses.crypto.cvx,
                CVX_SPONSOR,
                recapitalizationManager.address,
                parseEther('10')
            );
            await provideLiquidity(
                addresses.crypto.fxs,
                FXS_SPONSOR,
                recapitalizationManager.address,
                parseEther('10')
            );
            await provideLiquidity(
                addresses.crypto.sdt,
                SDT_SPONSOR,
                recapitalizationManager.address,
                parseEther('10')
            );

            await mine((await recapitalizationManager.accumulationPeriod()).toNumber());

            // when
            const tx = await recapitalizationManager.distributeRewards();

            // then
            await expect(tx)
                .to.emit(recapitalizationManager, 'DistributedRewards')
                .withArgs(tx.blockNumber);
            await expect(tx)
                .to.emit(stakingRewardDistributor, 'RewardPerBlockSet')
                .withArgs(0, anyUint)
                .emit(stakingRewardDistributor, 'RewardPerBlockSet')
                .withArgs(1, anyUint)
                .emit(stakingRewardDistributor, 'RewardPerBlockSet')
                .withArgs(2, anyUint)
                .emit(stakingRewardDistributor, 'RewardPerBlockSet')
                .withArgs(3, anyUint);
            expect(await CRV.balanceOf(stakingRewardDistributor.address)).is.equal(
                parseEther('10')
            );
            expect(await CVX.balanceOf(stakingRewardDistributor.address)).is.equal(
                parseEther('10')
            );
            expect(await FXS.balanceOf(stakingRewardDistributor.address)).is.equal(
                parseEther('10')
            );
            expect(await SDT.balanceOf(stakingRewardDistributor.address)).is.equal(
                parseEther('10')
            );
        });
        it('Should distribute rewards from recapitalization manager except of unknown reward', async () => {
            // given
            const { recapitalizationManager, stakingRewardDistributor, CRV, CVX, FXS, SDT, SPELL } =
                await loadFixture(deployFixture);
            await provideLiquidity(
                addresses.crypto.crv,
                CRV_SPONSOR,
                recapitalizationManager.address,
                parseEther('10')
            );
            await provideLiquidity(
                addresses.crypto.cvx,
                CVX_SPONSOR,
                recapitalizationManager.address,
                parseEther('10')
            );
            await provideLiquidity(
                addresses.crypto.fxs,
                FXS_SPONSOR,
                recapitalizationManager.address,
                parseEther('10')
            );
            await provideLiquidity(
                addresses.crypto.sdt,
                SDT_SPONSOR,
                recapitalizationManager.address,
                parseEther('10')
            );
            await provideLiquidity(
                addresses.crypto.spell,
                SPELL_SPONSOR,
                recapitalizationManager.address,
                parseEther('10')
            );

            await mine((await recapitalizationManager.accumulationPeriod()).toNumber());

            // when
            const tx = await recapitalizationManager.distributeRewards();

            // then
            await expect(tx)
                .to.emit(recapitalizationManager, 'DistributedRewards')
                .withArgs(tx.blockNumber);
            await expect(tx)
                .to.emit(stakingRewardDistributor, 'RewardPerBlockSet')
                .withArgs(0, anyUint)
                .emit(stakingRewardDistributor, 'RewardPerBlockSet')
                .withArgs(1, anyUint)
                .emit(stakingRewardDistributor, 'RewardPerBlockSet')
                .withArgs(2, anyUint)
                .emit(stakingRewardDistributor, 'RewardPerBlockSet')
                .withArgs(3, anyUint);
            expect(await CRV.balanceOf(stakingRewardDistributor.address)).is.equal(
                parseEther('10')
            );
            expect(await CVX.balanceOf(stakingRewardDistributor.address)).is.equal(
                parseEther('10')
            );
            expect(await FXS.balanceOf(stakingRewardDistributor.address)).is.equal(
                parseEther('10')
            );
            expect(await SDT.balanceOf(stakingRewardDistributor.address)).is.equal(
                parseEther('10')
            );
            expect(await SPELL.balanceOf(stakingRewardDistributor.address)).is.equal(0);
        });
        it('Should not distribute rewards from recapitalization manager when amounts are zero', async () => {
            // given
            const { owner, recapitalizationManager, stakingRewardDistributor, CRV, CVX, FXS, SDT } =
                await loadFixture(deployFixture);

            await mine((await recapitalizationManager.accumulationPeriod()).toNumber());

            // when
            await recapitalizationManager.distributeRewards();

            // then
            expect(await CRV.balanceOf(stakingRewardDistributor.address)).is.equal(0);
            expect(await CVX.balanceOf(stakingRewardDistributor.address)).is.equal(0);
            expect(await FXS.balanceOf(stakingRewardDistributor.address)).is.equal(0);
            expect(await SDT.balanceOf(stakingRewardDistributor.address)).is.equal(0);
        });

        it('Should distribute rewards from recapitalization manager twice', async () => {
            // given
            const { owner, recapitalizationManager, stakingRewardDistributor, CRV, CVX, FXS, SDT } =
                await loadFixture(deployFixture);
            // first distribution
            await provideLiquidity(
                addresses.crypto.crv,
                CRV_SPONSOR,
                recapitalizationManager.address,
                parseEther('10')
            );
            await provideLiquidity(
                addresses.crypto.cvx,
                CVX_SPONSOR,
                recapitalizationManager.address,
                parseEther('10')
            );
            await provideLiquidity(
                addresses.crypto.fxs,
                FXS_SPONSOR,
                recapitalizationManager.address,
                parseEther('10')
            );
            await provideLiquidity(
                addresses.crypto.sdt,
                SDT_SPONSOR,
                recapitalizationManager.address,
                parseEther('10')
            );

            await mine((await recapitalizationManager.accumulationPeriod()).toNumber());
            await recapitalizationManager.distributeRewards();

            // prepare for second distribution
            await provideLiquidity(
                addresses.crypto.crv,
                CRV_SPONSOR,
                recapitalizationManager.address,
                parseEther('1')
            );
            await provideLiquidity(
                addresses.crypto.cvx,
                CVX_SPONSOR,
                recapitalizationManager.address,
                parseEther('1')
            );
            await provideLiquidity(
                addresses.crypto.fxs,
                FXS_SPONSOR,
                recapitalizationManager.address,
                parseEther('1')
            );
            await provideLiquidity(
                addresses.crypto.sdt,
                SDT_SPONSOR,
                recapitalizationManager.address,
                parseEther('1')
            );

            await mine((await recapitalizationManager.accumulationPeriod()).toNumber());

            // when
            const tx = await recapitalizationManager.distributeRewards();

            // then
            await expect(tx)
                .to.emit(recapitalizationManager, 'DistributedRewards')
                .withArgs(tx.blockNumber);
            await expect(tx)
                .to.emit(stakingRewardDistributor, 'RewardPerBlockSet')
                .withArgs(0, anyUint)
                .emit(stakingRewardDistributor, 'RewardPerBlockSet')
                .withArgs(1, anyUint)
                .emit(stakingRewardDistributor, 'RewardPerBlockSet')
                .withArgs(2, anyUint)
                .emit(stakingRewardDistributor, 'RewardPerBlockSet')
                .withArgs(3, anyUint);
            expect(await CRV.balanceOf(stakingRewardDistributor.address)).is.equal(
                parseEther('11')
            );
            expect(await CVX.balanceOf(stakingRewardDistributor.address)).is.equal(
                parseEther('11')
            );
            expect(await FXS.balanceOf(stakingRewardDistributor.address)).is.equal(
                parseEther('11')
            );
            expect(await SDT.balanceOf(stakingRewardDistributor.address)).is.equal(
                parseEther('11')
            );
        });
        it('Should distribute rewards after claiming in zunUSD pool', async () => {
            // given
            const { recapitalizationManager, stakingRewardDistributor, CRV, SDT } =
                await loadFixture(deployFixture);
            // deploy zunUSD
            const { zunUSDController } = await deployZunUSDPoolWithStrategies();
            await zunUSDController.changeRewardCollector(recapitalizationManager.address);
            // claim zunUSD strategies rewards
            await mine((await recapitalizationManager.accumulationPeriod()).toNumber());
            await zunUSDController.claimRewards();
            const expectedCRV = await CRV.balanceOf(recapitalizationManager.address);
            const expectedSDT = await SDT.balanceOf(recapitalizationManager.address);

            // when
            const tx = await recapitalizationManager.distributeRewards();

            // then
            await expect(tx)
                .to.emit(stakingRewardDistributor, 'RewardPerBlockSet')
                .withArgs(0, anyUint)
                .emit(stakingRewardDistributor, 'RewardPerBlockSet')
                .withArgs(3, anyUint);
            expect(await CRV.balanceOf(stakingRewardDistributor.address)).is.equal(expectedCRV);
            expect(await SDT.balanceOf(stakingRewardDistributor.address)).is.equal(expectedSDT);
        });
    });

    describe('Recapitalize pool by rewards', async () => {
        it('Should recapitalize pool by rewards', async () => {
            // given
            const { recapitalizationManager, stakingRewardDistributor, CRV, SDT } =
                await loadFixture(deployFixture);
            // deploy zunUSD
            const { zunUSD, zunUSDController } = await deployZunUSDPoolWithStrategies();
            await zunUSDController.changeRewardCollector(recapitalizationManager.address);
            // grant controller role for recapitalization manager
            await zunUSD.grantRole(await zunUSD.CONTROLLER_ROLE(), recapitalizationManager.address);
            // deploy SellingCurveRewardManager
            const sellingCurveRewardManager = await deploySellingCurveRewardManager();
            // claim zunUSD strategies rewards
            await mine((await recapitalizationManager.accumulationPeriod()).toNumber());
            await zunUSDController.claimRewards();

            const expectedCRV = await CRV.balanceOf(recapitalizationManager.address);
            const expectedSDT = await SDT.balanceOf(recapitalizationManager.address);
            const tid = 0;
            const sid = 0;
            const poolFeeToken = (await ethers.getContractAt(
                'IERC20',
                await zunUSD.token(tid)
            )) as IERC20;
            const strategyAddress = (await zunUSD.strategyInfo(sid)).strategy;
            const expectedDepositInFeeToken = (
                await sellingCurveRewardManager.valuate(
                    CRV.address,
                    expectedCRV,
                    poolFeeToken.address
                )
            ).add(
                await sellingCurveRewardManager.valuate(
                    SDT.address,
                    expectedSDT,
                    poolFeeToken.address
                )
            );

            console.log(`${expectedDepositInFeeToken}`);

            // when
            const tx = await recapitalizationManager.recapitalizePoolByRewards(
                sellingCurveRewardManager.address,
                zunUSD.address,
                sid,
                tid
            );

            // then
            await expect(tx)
                .to.emit(recapitalizationManager, 'RecapitalizedPoolByRewards')
                .withArgs(
                    sellingCurveRewardManager.address,
                    zunUSD.address,
                    sid,
                    tid,
                    tx.blockNumber
                );
            // check that transfer to strategy is near the evaluated value because of slippage during rewards selling
            await expect(tx)
                .to.emit(poolFeeToken, 'Transfer')
                .withArgs(zunUSD.address, strategyAddress, (amount: BigNumber) =>
                    amount
                        .sub(expectedDepositInFeeToken)
                        .abs()
                        .lte(BigNumber.from('100000000000000'))
                );
        });
    });
});

async function deployZunUSDPoolWithStrategies() {
    // Contracts are deployed using the first signer/account by default
    const [owner, otherAccount, otherAccount2] = await ethers.getSigners();
    const { dai, usdt, usdc } = createStablecoins(owner);

    await mintStables(owner, usdc);

    const crvUSD_USDT_pool_addr = '0x390f3595bca2df7d23783dfd126427cceb997bf4';
    const crvUSD_USDC_pool_addr = '0x4dece678ceceb27446b35c672dc7d61f30bad69e';
    const { genericOracle } = await createAndInitConicOracles([
        crvUSD_USDT_pool_addr,
        crvUSD_USDC_pool_addr,
    ]);

    const { zunamiPool, zunamiPoolController } = await createPoolAndControllerZunUSD();

    const { stableConverter, rewardManager, frxEthNativeConverter } =
        await createConvertersAndRewardManagerContracts(
            'StableConverter',
            'SellingCurveRewardManager'
        );

    const strategyNames = [
        'UsdtCrvUsdStakeDaoCurve',
        'UsdcCrvUsdStakeDaoCurve',
        'ZunUSDVaultStrat',
    ];
    const strategies = await createStrategies(
        strategyNames,
        genericOracle,
        zunamiPool,
        stableConverter,
        frxEthNativeConverter,
        undefined,
        undefined
    );

    const tokenApprovedAmount = '1000000';
    for (const user of [owner, otherAccount, otherAccount2]) {
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

    for (const user of [otherAccount, otherAccount2]) {
        await dai.transfer(user.getAddress(), ethers.utils.parseUnits(tokenAmount, 'ether'));
        await usdc.transfer(user.getAddress(), ethers.utils.parseUnits(tokenAmount, 'mwei'));
        await usdt.transfer(user.getAddress(), ethers.utils.parseUnits(tokenAmount, 'mwei'));
    }

    for (let i = 0; i < strategies.length; i++) {
        const strategy = strategies[i];
        await zunamiPool.addStrategy(strategy.address);
        await zunamiPoolController.setDefaultDepositSid(i);
        await zunamiPoolController.setDefaultWithdrawSid(i);
        await expect(
            zunamiPoolController
                .connect(otherAccount)
                .deposit(getMinAmountZunUSD('1000'), owner.getAddress())
        ).to.emit(zunamiPool, 'Deposited');
    }

    return {
        zunUSD: zunamiPool,
        zunUSDController: zunamiPoolController,
        zunUSDStrategies: strategies,
    };
}

async function deploySellingCurveRewardManager() {
    const StableConverter = await ethers.getContractFactory('StableConverter');
    const converter = (await StableConverter.deploy()) as StableConverter;

    const SellingCurveRewardManager = await ethers.getContractFactory('SellingCurveRewardManager');
    const rewardManager = (await SellingCurveRewardManager.deploy(
        converter.address
    )) as SellingCurveRewardManager;

    return rewardManager;
}

async function provideLiquidity(
    tokenAddress: string,
    sponsor: string,
    recipient: string,
    amount: BigNumber
) {
    await impersonateAccount(sponsor);
    const impersonatedSigner = await ethers.getSigner(sponsor);

    // set balance to cover any tx costs
    await setBalance(sponsor, ethers.utils.parseEther('2').toHexString());

    const token = (await ethers.getContractAt('IERC20', tokenAddress)) as IERC20;

    await token.connect(impersonatedSigner).transfer(recipient, amount);
}
