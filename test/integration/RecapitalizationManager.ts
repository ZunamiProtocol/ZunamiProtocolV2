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

const CVX_SPONSOR = '0x3026BDf87ffc13533C862Ec0FA3EdAf34E02AE90';
const CRV_SPONSOR = '0x0E33Be39B13c576ff48E14392fBf96b02F40Cd34';
const FXS_SPONSOR = '0xb744bEA7E6892c380B781151554C7eBCc764910b';
const SDT_SPONSOR = '0xAced00E50cb81377495ea40A1A44005fe6d2482d';
const SPELL_SPONSOR = '0x8C54EbDD960056d2CfF5998df5695dACA1FC0190';
const DAI_SPONSOR = '0x60FaAe176336dAb62e284Fe19B885B095d29fB7F';

const parseDAI = (token: number) => BigNumber.from(token).mul(BigNumber.from(10).pow(18));
const parseZUN = (token: number) => BigNumber.from(token).mul(BigNumber.from(10).pow(18));

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
        await stakingRewardDistributor.addRewardToken(ZUN.address);

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
            ZUN.address,
        ];
        await recapitalizationManager.setRewardTokens(rewards);
        await recapitalizationManager.setRewardDistributor(stakingRewardDistributor.address);

        await stakingRewardDistributor.grantRole(
            stakingRewardDistributor.DISTRIBUTOR_ROLE(),
            recapitalizationManager.address
        );
        await stakingRewardDistributor.grantRole(
            stakingRewardDistributor.RECAPITALIZATION_ROLE(),
            recapitalizationManager.address
        );

        // get reward tokens
        const CRV = (await ethers.getContractAt('IERC20', addresses.crypto.crv)) as IERC20;
        const CVX = (await ethers.getContractAt('IERC20', addresses.crypto.cvx)) as IERC20;
        const FXS = (await ethers.getContractAt('IERC20', addresses.crypto.fxs)) as IERC20;
        const SDT = (await ethers.getContractAt('IERC20', addresses.crypto.sdt)) as IERC20;
        const SPELL = (await ethers.getContractAt('IERC20', addresses.crypto.spell)) as IERC20;
        const DAI = (await ethers.getContractAt('IERC20', addresses.stablecoins.dai)) as IERC20;

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
            DAI,
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
            expect(await stakingRewardDistributor.isRewardTokenAdded(ZUN.address)).is.true;

            expect(await stakingRewardDistributor.poolCount()).to.equal(1);

            expect(await recapitalizationManager.rewardTokens(0)).to.equal(addresses.crypto.crv);
            expect(await recapitalizationManager.rewardTokens(1)).to.equal(addresses.crypto.cvx);
            expect(await recapitalizationManager.rewardTokens(2)).to.equal(addresses.crypto.fxs);
            expect(await recapitalizationManager.rewardTokens(3)).to.equal(addresses.crypto.sdt);
            expect(await recapitalizationManager.rewardTokens(4)).to.equal(ZUN.address);
            expect(await recapitalizationManager.zunToken()).to.equal(ZUN.address);
            expect(await recapitalizationManager.stakingRewardDistributor()).to.equal(
                stakingRewardDistributor.address
            );
            expect(await recapitalizationManager.accumulationPeriod()).to.equal(
                (14 * 24 * 60 * 60) / 12
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
            const { recapitalizationManager, stakingRewardDistributor, CRV, CVX, FXS, SDT } =
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
            const { recapitalizationManager, CRV, SDT } = await loadFixture(deployFixture);
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
            const expectedRewardAmounts = [expectedCRV, 0, 0, expectedSDT, 0];

            // when
            const tx = await recapitalizationManager.recapitalizePoolByRewards(
                sellingCurveRewardManager.address,
                zunUSD.address,
                sid,
                tid,
                expectedRewardAmounts
            );

            // then
            await expect(tx)
                .to.emit(recapitalizationManager, 'RecapitalizedPoolByRewards')
                .withArgs(
                    sellingCurveRewardManager.address,
                    zunUSD.address,
                    sid,
                    tid,
                    tx.blockNumber,
                    expectedRewardAmounts
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
        it('Should not recapitalize pool by rewards because wrong amounts length', async () => {
            // given
            const { recapitalizationManager, CRV, SDT } = await loadFixture(deployFixture);
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

            const expectedRewardAmounts = [0];

            const tid = 0;
            const sid = 0;

            // when
            const tx = recapitalizationManager.recapitalizePoolByRewards(
                sellingCurveRewardManager.address,
                zunUSD.address,
                sid,
                tid,
                expectedRewardAmounts
            );

            // then
            await expect(tx)
                .to.revertedWithCustomError(recapitalizationManager, 'WrongRewardTokensLength')
                .withArgs(5);
        });

        it('Should not recapitalize pool by rewards because not enough amount of token', async () => {
            // given
            const { recapitalizationManager, CRV, SDT, CVX } = await loadFixture(deployFixture);
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
            const expectedRewardAmounts = [expectedCRV, 1, 0, expectedSDT, 0];

            // when
            const tx = recapitalizationManager.recapitalizePoolByRewards(
                sellingCurveRewardManager.address,
                zunUSD.address,
                sid,
                tid,
                expectedRewardAmounts
            );

            // then
            await expect(tx).to.revertedWith('ERC20: transfer amount exceeds balance');
        });
    });

    describe('Recapitalize pool by staked zun', async () => {
        it('Should recapitalize pool by staked zun', async () => {
            // given
            const {
                recapitalizationManager,
                otherAccount,
                otherAccount1,
                stakingRewardDistributor,
                ZUN,
                DAI,
            } = await loadFixture(deployFixture);
            // deploy zunUSD
            const { zunUSD } = await deployZunUSDPoolWithStrategies();

            // grant controller role for recapitalization manager
            await zunUSD.grantRole(await zunUSD.CONTROLLER_ROLE(), recapitalizationManager.address);
            const tid = 0; // DAI zunUSD pool tokenId
            const sid = 1; // UsdcCrvUsdStakeDaoCurve strategy

            // prepare sponsor account for StubZunToRewardManager and deploy it for ZUN -> pool depositToken conversion
            const rewardManagerSponsor = otherAccount1;
            await provideLiquidity(
                addresses.stablecoins.dai,
                DAI_SPONSOR,
                rewardManagerSponsor.address,
                parseDAI(10000)
            );
            const StubZunToDAITokenManager = await ethers.getContractFactory(
                'StubZunToDAITokenManager'
            );
            const stubZunToDAITokenManager = await StubZunToDAITokenManager.deploy(
                ZUN.address,
                rewardManagerSponsor.address
            );
            await stubZunToDAITokenManager.deployed();

            // approve stubZunToDAITokenManager to spend rewardManagerSponsor DAI tokens
            await DAI.connect(rewardManagerSponsor).approve(
                stubZunToDAITokenManager.address,
                parseDAI(10000)
            );

            // deposit zun tokens to reward distributor
            await ZUN.transfer(otherAccount.address, parseEther('1000'));
            await ZUN.connect(otherAccount).approve(
                stakingRewardDistributor.address,
                parseZUN(1000)
            );
            await stakingRewardDistributor
                .connect(otherAccount)
                .deposit(0, parseZUN(1000), otherAccount.address);

            // when
            const tx = await recapitalizationManager.recapitalizePoolByStackedZun(
                parseZUN(500),
                stubZunToDAITokenManager.address,
                zunUSD.address,
                sid,
                tid
            );

            // then
            await expect(tx)
                .to.emit(recapitalizationManager, 'RecapitalizedPoolByStackedZun')
                .withArgs(
                    parseZUN(500),
                    stubZunToDAITokenManager.address,
                    zunUSD.address,
                    sid,
                    tid
                );
            await expect(tx)
                .to.emit(stakingRewardDistributor, 'WithdrawnPoolToken')
                .withArgs(ZUN.address, parseZUN(500));
            await expect(tx).to.changeTokenBalances(
                ZUN,
                [stakingRewardDistributor.address, stubZunToDAITokenManager.address],
                [parseZUN(500).mul(-1), parseZUN(500)]
            );
            // check that transfer in DAI happened to strategy (with 1:1 conversion to ZUN)
            const strategyAddress = (await zunUSD.strategyInfo(sid)).strategy;
            await expect(tx)
                .to.emit(DAI, 'Transfer')
                .withArgs(zunUSD.address, strategyAddress, parseZUN(500));
        });
        it('Should recapitalize pool by staked zun twice and reward distributor has deposits by different users', async () => {
            // given
            const {
                recapitalizationManager,
                otherAccount,
                otherAccount1,
                stakingRewardDistributor,
                ZUN,
                DAI,
            } = await loadFixture(deployFixture);
            // deploy zunUSD
            const { zunUSD } = await deployZunUSDPoolWithStrategies();

            // grant controller role for recapitalization manager
            await zunUSD.grantRole(await zunUSD.CONTROLLER_ROLE(), recapitalizationManager.address);
            const tid = 0; // DAI zunUSD pool tokenId
            const sid = 1; // UsdcCrvUsdStakeDaoCurve strategy

            // prepare sponsor account for StubZunToRewardManager and deploy it for ZUN -> pool depositToken conversion
            const rewardManagerSponsor = otherAccount1;
            await provideLiquidity(
                addresses.stablecoins.dai,
                DAI_SPONSOR,
                rewardManagerSponsor.address,
                parseDAI(10000)
            );
            const StubZunToDAITokenManager = await ethers.getContractFactory(
                'StubZunToDAITokenManager'
            );
            const stubZunToDAITokenManager = await StubZunToDAITokenManager.deploy(
                ZUN.address,
                rewardManagerSponsor.address
            );
            await stubZunToDAITokenManager.deployed();

            // approve stubZunToDAITokenManager to spend rewardManagerSponsor DAI tokens
            await DAI.connect(rewardManagerSponsor).approve(
                stubZunToDAITokenManager.address,
                parseDAI(10000)
            );

            // deposit zun tokens to reward distributor by two different users
            await ZUN.transfer(otherAccount.address, parseZUN(500));
            await ZUN.transfer(otherAccount1.address, parseZUN(500));
            await ZUN.connect(otherAccount).approve(
                stakingRewardDistributor.address,
                parseZUN(500)
            );
            await ZUN.connect(otherAccount1).approve(
                stakingRewardDistributor.address,
                parseZUN(500)
            );
            await stakingRewardDistributor
                .connect(otherAccount)
                .deposit(0, parseZUN(500), otherAccount.address);
            await stakingRewardDistributor
                .connect(otherAccount1)
                .deposit(0, parseZUN(500), otherAccount.address);

            // make first recapitalization
            await recapitalizationManager.recapitalizePoolByStackedZun(
                parseZUN(500),
                stubZunToDAITokenManager.address,
                zunUSD.address,
                sid,
                tid
            );

            // when (second recapitalization)
            const tx = await recapitalizationManager.recapitalizePoolByStackedZun(
                parseZUN(400),
                stubZunToDAITokenManager.address,
                zunUSD.address,
                sid,
                tid
            );

            // then
            await expect(tx)
                .to.emit(recapitalizationManager, 'RecapitalizedPoolByStackedZun')
                .withArgs(
                    parseZUN(400),
                    stubZunToDAITokenManager.address,
                    zunUSD.address,
                    sid,
                    tid
                );
            await expect(tx)
                .to.emit(stakingRewardDistributor, 'WithdrawnPoolToken')
                .withArgs(ZUN.address, parseZUN(400));
            await expect(tx).to.changeTokenBalances(
                ZUN,
                [stakingRewardDistributor.address, stubZunToDAITokenManager.address],
                [parseZUN(400).mul(-1), parseZUN(400)]
            );
            // check that transfer in DAI happened to strategy (with 1:1 conversion to ZUN)
            const strategyAddress = (await zunUSD.strategyInfo(sid)).strategy;
            await expect(tx)
                .to.emit(DAI, 'Transfer')
                .withArgs(zunUSD.address, strategyAddress, parseZUN(400));
        });
        it('Should not recapitalize pool by staked zun if reward distributor doesn`t have enough tokens', async () => {
            // given
            const {
                recapitalizationManager,
                otherAccount,
                otherAccount1,
                stakingRewardDistributor,
                ZUN,
                DAI,
            } = await loadFixture(deployFixture);
            // deploy zunUSD
            const { zunUSD } = await deployZunUSDPoolWithStrategies();

            // grant controller role for recapitalization manager
            await zunUSD.grantRole(await zunUSD.CONTROLLER_ROLE(), recapitalizationManager.address);
            const tid = 0; // DAI zunUSD pool tokenId
            const sid = 1; // UsdcCrvUsdStakeDaoCurve strategy

            // prepare sponsor account for StubZunToRewardManager and deploy it for ZUN -> pool depositToken conversion
            const rewardManagerSponsor = otherAccount1;
            await provideLiquidity(
                addresses.stablecoins.dai,
                DAI_SPONSOR,
                rewardManagerSponsor.address,
                parseDAI(10000)
            );
            const StubZunToDAITokenManager = await ethers.getContractFactory(
                'StubZunToDAITokenManager'
            );
            const stubZunToDAITokenManager = await StubZunToDAITokenManager.deploy(
                ZUN.address,
                rewardManagerSponsor.address
            );
            await stubZunToDAITokenManager.deployed();

            // approve stubZunToDAITokenManager to spend rewardManagerSponsor DAI tokens
            await DAI.connect(rewardManagerSponsor).approve(
                stubZunToDAITokenManager.address,
                parseDAI(10000)
            );

            // deposit zun tokens to reward distributor
            await ZUN.transfer(otherAccount.address, parseEther('1000'));
            await ZUN.connect(otherAccount).approve(
                stakingRewardDistributor.address,
                parseZUN(1000)
            );
            await stakingRewardDistributor
                .connect(otherAccount)
                .deposit(0, parseZUN(1000), otherAccount.address);

            // when
            const tx = recapitalizationManager.recapitalizePoolByStackedZun(
                parseZUN(2000),
                stubZunToDAITokenManager.address,
                zunUSD.address,
                sid,
                tid
            );

            // then
            await expect(tx).to.revertedWithCustomError(stakingRewardDistributor, 'WrongAmount');
        });
    });
    describe('Restore staked zun by rewards', async () => {
        it('Should restore staked zun by rewards', async () => {
            // given
            const {
                owner,
                otherAccount,
                otherAccount1,
                DAI,
                recapitalizationManager,
                stakingRewardDistributor,
                ZUN,
            } = await loadFixture(deployFixture);

            // deploy zunUSD and recapitalize pool by staked zun
            const { zunUSD } = await deployZunUSDPoolWithStrategies();
            await zunUSD.grantRole(await zunUSD.CONTROLLER_ROLE(), recapitalizationManager.address);
            const tid = 0; // DAI zunUSD pool tokenId
            const sid = 1; // UsdcCrvUsdStakeDaoCurve strategy
            const rewardManagerSponsor = otherAccount1;
            await provideLiquidity(
                addresses.stablecoins.dai,
                DAI_SPONSOR,
                rewardManagerSponsor.address,
                parseDAI(10000)
            );
            const StubZunToDAITokenManager = await ethers.getContractFactory(
                'StubZunToDAITokenManager'
            );
            const stubZunToDAITokenManager = await StubZunToDAITokenManager.deploy(
                ZUN.address,
                rewardManagerSponsor.address
            );
            await stubZunToDAITokenManager.deployed();
            await DAI.connect(rewardManagerSponsor).approve(
                stubZunToDAITokenManager.address,
                parseDAI(10000)
            );
            await ZUN.transfer(otherAccount.address, parseEther('1000'));
            await ZUN.connect(otherAccount).approve(
                stakingRewardDistributor.address,
                parseZUN(1000)
            );
            await stakingRewardDistributor
                .connect(otherAccount)
                .deposit(0, parseZUN(1000), otherAccount.address);
            const recapitalizationAmount = parseZUN(40);
            await recapitalizationManager.recapitalizePoolByStackedZun(
                recapitalizationAmount,
                stubZunToDAITokenManager.address,
                zunUSD.address,
                sid,
                tid
            );

            // provide new rewards to recapitalization manager
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

            // deploy StubRewardToZunManager and approve spending from ZUN holder
            const StubRewardToZunManager = await ethers.getContractFactory(
                'StubRewardToZunManager'
            );
            const zunTokenHolder = owner;
            const stubRewardToZunManager = await StubRewardToZunManager.deploy(
                ZUN.address,
                zunTokenHolder.address
            );
            await stubRewardToZunManager.deployed();
            await ZUN.connect(owner).approve(stubRewardToZunManager.address, parseZUN(40));

            // when
            const tx = await recapitalizationManager.restoreStakedZunByRewards(
                stubRewardToZunManager.address
            );

            // then
            await expect(tx)
                .to.emit(recapitalizationManager, 'RestoredStakedZunByRewards')
                .withArgs(parseZUN(40), stubRewardToZunManager.address, tx.blockNumber);
            await expect(tx)
                .to.emit(stakingRewardDistributor, 'ReturnedPoolToken')
                .withArgs(ZUN.address, parseZUN(40));
            expect(await stakingRewardDistributor.recapitalizedAmounts(0)).to.equal(0);
        });
        it('Should restore staked zun by rewards partially', async () => {
            // given
            const {
                owner,
                otherAccount,
                otherAccount1,
                DAI,
                recapitalizationManager,
                stakingRewardDistributor,
                ZUN,
            } = await loadFixture(deployFixture);

            // deploy zunUSD and recapitalize pool by staked zun
            const { zunUSD } = await deployZunUSDPoolWithStrategies();
            await zunUSD.grantRole(await zunUSD.CONTROLLER_ROLE(), recapitalizationManager.address);
            const tid = 0; // DAI zunUSD pool tokenId
            const sid = 1; // UsdcCrvUsdStakeDaoCurve strategy
            const rewardManagerSponsor = otherAccount1;
            await provideLiquidity(
                addresses.stablecoins.dai,
                DAI_SPONSOR,
                rewardManagerSponsor.address,
                parseDAI(10000)
            );
            const StubZunToDAITokenManager = await ethers.getContractFactory(
                'StubZunToDAITokenManager'
            );
            const stubZunToDAITokenManager = await StubZunToDAITokenManager.deploy(
                ZUN.address,
                rewardManagerSponsor.address
            );
            await stubZunToDAITokenManager.deployed();
            await DAI.connect(rewardManagerSponsor).approve(
                stubZunToDAITokenManager.address,
                parseDAI(10000)
            );
            await ZUN.transfer(otherAccount.address, parseEther('1000'));
            await ZUN.connect(otherAccount).approve(
                stakingRewardDistributor.address,
                parseZUN(1000)
            );
            await stakingRewardDistributor
                .connect(otherAccount)
                .deposit(0, parseZUN(1000), otherAccount.address);
            const recapitalizationAmount = parseZUN(40);
            await recapitalizationManager.recapitalizePoolByStackedZun(
                recapitalizationAmount,
                stubZunToDAITokenManager.address,
                zunUSD.address,
                sid,
                tid
            );

            // provide new rewards to recapitalization manager
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

            // deploy StubRewardToZunManager and approve spending from ZUN holder
            const StubRewardToZunManager = await ethers.getContractFactory(
                'StubRewardToZunManager'
            );
            const zunTokenHolder = owner;
            const stubRewardToZunManager = await StubRewardToZunManager.deploy(
                ZUN.address,
                zunTokenHolder.address
            );
            await stubRewardToZunManager.deployed();
            await ZUN.connect(owner).approve(stubRewardToZunManager.address, parseZUN(40));

            // when
            const tx = await recapitalizationManager.restoreStakedZunByRewards(
                stubRewardToZunManager.address
            );

            // then
            await expect(tx)
                .to.emit(recapitalizationManager, 'RestoredStakedZunByRewards')
                .withArgs(parseZUN(4), stubRewardToZunManager.address, tx.blockNumber);
            await expect(tx)
                .to.emit(stakingRewardDistributor, 'ReturnedPoolToken')
                .withArgs(ZUN.address, parseZUN(4));
            // should be spent during reward distribution
            expect(await stakingRewardDistributor.recapitalizedAmounts(0)).to.equal(parseZUN(36));
        });
        it('Should send remaining ZUN during reward distribution after restoring staked zun by rewards', async () => {
            // given
            const {
                owner,
                otherAccount,
                otherAccount1,
                DAI,
                recapitalizationManager,
                stakingRewardDistributor,
                ZUN,
            } = await loadFixture(deployFixture);

            // deploy zunUSD and recapitalize pool by staked zun
            const { zunUSD } = await deployZunUSDPoolWithStrategies();
            await zunUSD.grantRole(await zunUSD.CONTROLLER_ROLE(), recapitalizationManager.address);
            const tid = 0; // DAI zunUSD pool tokenId
            const sid = 1; // UsdcCrvUsdStakeDaoCurve strategy
            const rewardManagerSponsor = otherAccount1;
            await provideLiquidity(
                addresses.stablecoins.dai,
                DAI_SPONSOR,
                rewardManagerSponsor.address,
                parseDAI(10000)
            );
            const StubZunToDAITokenManager = await ethers.getContractFactory(
                'StubZunToDAITokenManager'
            );
            const stubZunToDAITokenManager = await StubZunToDAITokenManager.deploy(
                ZUN.address,
                rewardManagerSponsor.address
            );
            await stubZunToDAITokenManager.deployed();
            await DAI.connect(rewardManagerSponsor).approve(
                stubZunToDAITokenManager.address,
                parseDAI(10000)
            );
            await ZUN.transfer(otherAccount.address, parseEther('1000'));
            await ZUN.connect(otherAccount).approve(
                stakingRewardDistributor.address,
                parseZUN(1000)
            );
            await stakingRewardDistributor
                .connect(otherAccount)
                .deposit(0, parseZUN(1000), otherAccount.address);
            const recapitalizationAmount = parseZUN(40);
            await recapitalizationManager.recapitalizePoolByStackedZun(
                recapitalizationAmount,
                stubZunToDAITokenManager.address,
                zunUSD.address,
                sid,
                tid
            );

            // provide new rewards to recapitalization manager
            await provideLiquidity(
                addresses.crypto.crv,
                CRV_SPONSOR,
                recapitalizationManager.address,
                parseEther('100')
            );
            await provideLiquidity(
                addresses.crypto.cvx,
                CVX_SPONSOR,
                recapitalizationManager.address,
                parseEther('100')
            );
            await provideLiquidity(
                addresses.crypto.fxs,
                FXS_SPONSOR,
                recapitalizationManager.address,
                parseEther('100')
            );
            await provideLiquidity(
                addresses.crypto.sdt,
                SDT_SPONSOR,
                recapitalizationManager.address,
                parseEther('100')
            );

            // deploy StubRewardToZunManager and approve spending from ZUN holder
            const StubRewardToZunManager = await ethers.getContractFactory(
                'StubRewardToZunManager'
            );
            const zunTokenHolder = owner;
            const stubRewardToZunManager = await StubRewardToZunManager.deploy(
                ZUN.address,
                zunTokenHolder.address
            );
            await stubRewardToZunManager.deployed();
            await ZUN.connect(owner).approve(stubRewardToZunManager.address, parseZUN(400));

            // restore staked zun by rewards
            await recapitalizationManager.restoreStakedZunByRewards(stubRewardToZunManager.address);

            // mine to accumulation period
            await mine((await recapitalizationManager.accumulationPeriod()).toNumber());

            // when
            const tx = await recapitalizationManager.distributeRewards();

            // then
            await expect(tx)
                .to.emit(recapitalizationManager, 'DistributedRewards')
                .withArgs(tx.blockNumber);
            await expect(tx)
                .to.emit(stakingRewardDistributor, 'RewardPerBlockSet')
                .withArgs(4, anyUint);
            await expect(tx).to.changeTokenBalances(
                ZUN,
                [recapitalizationManager.address, stakingRewardDistributor.address],
                [parseZUN(360).mul(-1), parseZUN(360)]
            );
            expect(await ZUN.balanceOf(recapitalizationManager.address)).to.equal(0);
        });
    });

    describe('Withdraw stuck token', async () => {
        it('Should withdraw all stuck token', async () => {
            // given
            const { owner, recapitalizationManager, CRV } = await loadFixture(deployFixture);
            // provide new rewards to recapitalization manager
            await provideLiquidity(
                addresses.crypto.crv,
                CRV_SPONSOR,
                recapitalizationManager.address,
                parseEther('100')
            );
            const expectedWithdrawAmount = await CRV.balanceOf(recapitalizationManager.address);

            // when
            const tx = await recapitalizationManager.withdrawStuckToken(
                addresses.crypto.crv,
                ethers.constants.MaxUint256
            );

            // then
            await expect(tx)
                .to.emit(recapitalizationManager, 'WithdrawnStuckToken')
                .withArgs(addresses.crypto.crv, expectedWithdrawAmount);
            await expect(tx).to.changeTokenBalances(
                CRV,
                [recapitalizationManager.address, owner.address],
                [expectedWithdrawAmount.mul(-1), expectedWithdrawAmount]
            );
        });
        it('Should withdraw part of stuck token', async () => {
            // given
            const { owner, recapitalizationManager, CRV } = await loadFixture(deployFixture);
            // provide new rewards to recapitalization manager
            await provideLiquidity(
                addresses.crypto.crv,
                CRV_SPONSOR,
                recapitalizationManager.address,
                parseEther('100')
            );
            const expectedWithdrawAmount = parseEther('50');

            // when
            const tx = await recapitalizationManager.withdrawStuckToken(
                addresses.crypto.crv,
                expectedWithdrawAmount
            );

            // then
            await expect(tx)
                .to.emit(recapitalizationManager, 'WithdrawnStuckToken')
                .withArgs(addresses.crypto.crv, expectedWithdrawAmount);
            await expect(tx).to.changeTokenBalances(
                CRV,
                [recapitalizationManager.address, owner.address],
                [expectedWithdrawAmount.mul(-1), expectedWithdrawAmount]
            );
        });
        it('Should not withdraw stuck token by not the ADMIN', async () => {
            // given
            const { otherAccount, recapitalizationManager, CRV } = await loadFixture(deployFixture);
            // provide new rewards to recapitalization manager
            await provideLiquidity(
                addresses.crypto.crv,
                CRV_SPONSOR,
                recapitalizationManager.address,
                parseEther('100')
            );

            // when
            const tx = recapitalizationManager
                .connect(otherAccount)
                .withdrawStuckToken(addresses.crypto.crv, parseEther('100'));

            // then
            await expect(tx)
                .to.revertedWithCustomError(
                    recapitalizationManager,
                    'AccessControlUnauthorizedAccount'
                )
                .withArgs(otherAccount.address, await recapitalizationManager.DEFAULT_ADMIN_ROLE());
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
