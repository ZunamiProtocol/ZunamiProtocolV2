import { ethers } from 'hardhat';
import BigNumber from 'bignumber.js';
import { expect } from 'chai';
import chai from 'chai';
import { Contract } from '@ethersproject/contracts';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { FakeContract, smock } from '@defi-wonderland/smock';

const ADDRESS_ZERO = '0x0000000000000000000000000000000000000000';

import { IPool, IStakingRewardDistributor, IRewardManager, IERC20 } from '../../typechain-types';
import { mine } from '@nomicfoundation/hardhat-network-helpers';

chai.should(); // if you like should syntax
chai.use(smock.matchers);

const MINIMUM_LIQUIDITY = 1e3;

export const bn = (num: string | number) => new BigNumber(num);
export const decify = (value: any, decimals: any) =>
    bn(value).times(bn(10).pow(decimals)).integerValue();
export const undecify = (value: any, decimals: any) =>
    bn(value.toString()).dividedBy(bn(10).pow(decimals));
export const tokenify = (value: any) => decify(value, 18);
export const stablify = (value: any) => decify(value, 6);

async function stubToken(decimals: number, admin: SignerWithAddress) {
    const StubToken = await ethers.getContractFactory('ERC20Token', admin);
    const token = await StubToken.deploy(decimals);
    await token.deployed();
    return token;
}

describe('RecapitalizationManager', () => {
    let admin: SignerWithAddress;
    let alice: SignerWithAddress;
    let bob: SignerWithAddress;
    let carol: SignerWithAddress;
    let rosa: SignerWithAddress;

    let stakingRewardDistributor: FakeContract<IStakingRewardDistributor>;
    let recapitalizationManager: Contract;
    let rewardTokens: Contract[];
    let zun: FakeContract<IERC20>;

    beforeEach(async () => {
        [admin, alice, bob, carol, rosa] = await ethers.getSigners();

        zun = (await smock.fake('IERC20')) as FakeContract<IERC20>;

        rewardTokens = [
            await stubToken(18, admin),
            await stubToken(18, admin),
            await stubToken(18, admin),
        ];

        stakingRewardDistributor = (await smock.fake(
            'IStakingRewardDistributor'
        )) as FakeContract<IStakingRewardDistributor>;

        const currentBlock = (await ethers.provider.getBlockNumber()) + 1;
        const RecapitalizationManager = await ethers.getContractFactory(
            'RecapitalizationManager',
            admin
        );
        recapitalizationManager = await RecapitalizationManager.deploy(zun.address);
        await recapitalizationManager.deployed();
        expect(recapitalizationManager.address).to.properAddress;

        await expect(await recapitalizationManager.rewardDistributionBlock()).to.be.equal(
            currentBlock
        );

        await expect(recapitalizationManager.setRewardTokens([])).to.be.revertedWithCustomError(
            recapitalizationManager,
            `WrongRewardTokens`
        );

        await recapitalizationManager.setRewardTokens(rewardTokens.map((t) => t.address));
    });

    it('should be created rightly', async () => {
        await expect(await recapitalizationManager.rewardTokens(0)).to.be.equal(
            rewardTokens[0].address
        );
        await expect(await recapitalizationManager.rewardTokens(1)).to.be.equal(
            rewardTokens[1].address
        );
        await expect(await recapitalizationManager.rewardTokens(2)).to.be.equal(
            rewardTokens[2].address
        );

        await expect(await recapitalizationManager.zunToken()).to.be.equal(zun.address);
        await expect(await recapitalizationManager.stakingRewardDistributor()).to.be.equal(
            ADDRESS_ZERO
        );
        const accumulationPeriod = await recapitalizationManager.INITIAL_ACCUMULATION_PERIOD();
        await expect(await recapitalizationManager.accumulationPeriod()).to.be.equal(
            accumulationPeriod.toString()
        );
    });

    it('should be set staking reward distributor', async () => {
        await expect(await recapitalizationManager.stakingRewardDistributor()).to.be.equal(
            ADDRESS_ZERO
        );

        await expect(
            recapitalizationManager.connect(bob).setRewardDistributor(bob.address)
        ).to.be.revertedWithCustomError(
            recapitalizationManager,
            `AccessControlUnauthorizedAccount`
        );

        await expect(
            recapitalizationManager.connect(admin).setRewardDistributor(ADDRESS_ZERO)
        ).to.be.revertedWithCustomError(recapitalizationManager, `ZeroAddress`);

        await recapitalizationManager.connect(admin).setRewardDistributor(bob.address);

        await expect(await recapitalizationManager.stakingRewardDistributor()).to.be.equal(
            bob.address
        );
    });

    it('should be set accumulation period', async () => {
        await expect(await recapitalizationManager.accumulationPeriod()).to.be.equal(
            await recapitalizationManager.INITIAL_ACCUMULATION_PERIOD()
        );

        const newAccumulationPeriod = (
            await recapitalizationManager.INITIAL_ACCUMULATION_PERIOD()
        ).add((14 * 24 * 60 * 60) / 12);

        await expect(
            recapitalizationManager.connect(bob).setAccumulationPeriod(newAccumulationPeriod)
        ).to.be.revertedWithCustomError(
            recapitalizationManager,
            `AccessControlUnauthorizedAccount`
        );

        await expect(
            recapitalizationManager.connect(admin).setAccumulationPeriod(0)
        ).to.be.revertedWithCustomError(recapitalizationManager, `ZeroParam`);

        await recapitalizationManager.connect(admin).setAccumulationPeriod(newAccumulationPeriod);

        await expect(await recapitalizationManager.accumulationPeriod()).to.be.equal(
            newAccumulationPeriod
        );
    });

    it('should distribute rewards', async () => {
        await expect(
            recapitalizationManager.connect(bob).distributeRewards()
        ).to.be.revertedWithCustomError(recapitalizationManager, `WrongRewardDistributionBlock`);

        await mine((await recapitalizationManager.accumulationPeriod()).toNumber());

        await recapitalizationManager.connect(bob).distributeRewards();
    });

    it('should recapitalize pool by rewards', async () => {
        const rewardManager = (await smock.fake('IRewardManager')) as FakeContract<IRewardManager>;
        const zunamiPool = (await smock.fake('IPool')) as FakeContract<IPool>;
        const poolToken = (await smock.fake('IERC20')) as FakeContract<IERC20>;
        const sid = 0;
        const tid = 0;

        const amount = tokenify(100);

        await zunamiPool.token.whenCalledWith(0).returns(ADDRESS_ZERO);
        await expect(
            recapitalizationManager
                .connect(admin)
                .recapitalizePoolByRewards(rewardManager.address, zunamiPool.address, sid, tid)
        ).to.be.revertedWithCustomError(recapitalizationManager, `WrongTid`);

        await zunamiPool.token.whenCalledWith(tid).returns(poolToken.address);
        await poolToken.balanceOf.returns(amount.toFixed());
        await poolToken.transfer.whenCalledWith(zunamiPool.address, amount.toFixed()).returns(true);
        await recapitalizationManager
            .connect(admin)
            .recapitalizePoolByRewards(rewardManager.address, zunamiPool.address, sid, tid);

        zunamiPool.depositStrategy
            .atCall(0)
            .should.be.calledWith(sid, [amount.toFixed(), 0, 0, 0, 0]);
    });

    it('should recapitalize pool by staked zun', async () => {
        const zunAmount = tokenify(100);
        const rewardManager = (await smock.fake('IRewardManager')) as FakeContract<IRewardManager>;
        const zunamiPool = (await smock.fake('IPool')) as FakeContract<IPool>;
        const poolToken = (await smock.fake('IERC20')) as FakeContract<IERC20>;
        const sid = 0;
        const tid = 0;

        await recapitalizationManager
            .connect(admin)
            .setRewardDistributor(stakingRewardDistributor.address);

        await zunamiPool.token.whenCalledWith(tid).returns(poolToken.address);
        await zun.transfer.whenCalledWith(rewardManager.address, zunAmount.toFixed()).returns(true);
        await poolToken.balanceOf.returns(zunAmount.toFixed());
        await poolToken.transfer
            .whenCalledWith(zunamiPool.address, zunAmount.toFixed())
            .returns(true);

        await recapitalizationManager
            .connect(admin)
            .recapitalizePoolByStackedZun(
                zunAmount.toString(),
                rewardManager.address,
                zunamiPool.address,
                sid,
                tid
            );

        stakingRewardDistributor.withdrawPoolToken
            .atCall(0)
            .should.be.calledWith(zun.address, zunAmount.toString());
        rewardManager.handle
            .atCall(0)
            .should.be.calledWith(zun.address, zunAmount.toFixed(), poolToken.address);
        zunamiPool.depositStrategy
            .atCall(0)
            .should.be.calledWith(sid, [zunAmount.toFixed(), 0, 0, 0, 0]);
    });

    it('should capitalize staked zun by rewards', async () => {
        const rewardManager = (await smock.fake('IRewardManager')) as FakeContract<IRewardManager>;

        await recapitalizationManager
            .connect(admin)
            .setRewardDistributor(stakingRewardDistributor.address);

        const zunAmount = tokenify(100);
        await zun.balanceOf
            .whenCalledWith(recapitalizationManager.address)
            .returns(zunAmount.toFixed());

        await zun.approve
            .whenCalledWith(stakingRewardDistributor.address, zunAmount.toFixed())
            .returns(true);

        await stakingRewardDistributor.recapitalizedAmounts
            .whenCalledWith(0)
            .returns(zunAmount.toFixed());

        await recapitalizationManager
            .connect(admin)
            .restoreStakedZunByRewards(rewardManager.address);

        stakingRewardDistributor.returnPoolToken
            .atCall(0)
            .should.be.calledWith(zun.address, zunAmount.toFixed());
    });
});
