import { ethers, upgrades } from 'hardhat';
import { loadFixture, mine, mineUpTo } from '@nomicfoundation/hardhat-network-helpers';
import { parseUnits } from 'ethers/lib/utils';
import { expect } from 'chai';

import { ERC20, ZunamiToken, ZUNStakingRewardDistributor } from '../../typechain-types';
import { BigNumber, BigNumberish } from 'ethers';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { getSignTypedData } from '../utils/signature';

const ethUnits = (amount: number | string) => parseUnits(amount.toString(), 'ether');

const BLOCKS_IN_1_DAYS = (24 * 60 * 60) / 12;
const BLOCKS_IN_4_MONTHS = BLOCKS_IN_1_DAYS * 30 * 4;
const ACC_REWARD_PRECISION = 1e12;
const zeroAddress = ethers.constants.AddressZero;

const toBn = (value: number | string) => ethers.BigNumber.from(value);

describe('ZUNStakingRewardDistributor tests', () => {
    async function deployFixture() {
        // Contracts are deployed using the first signer/account by default
        const [admin, user1, user2, user3, earlyExitReceiver] = await ethers.getSigners();

        // deploy test ERC20 token
        const ERC20TokenFactory = await ethers.getContractFactory('ERC20Token');
        const ZunTokenFactory = await ethers.getContractFactory('ZunamiToken');
        const ZUN = (await ZunTokenFactory.deploy(admin.address)) as ZunamiToken;
        const REWARD = (await ERC20TokenFactory.deploy(18)) as ERC20;
        const REWARD2 = (await ERC20TokenFactory.deploy(18)) as ERC20;

        // deploy distributor contract
        const StakingRewardDistributorFactory = await ethers.getContractFactory(
            'ZUNStakingRewardDistributor'
        );

        const instance = await upgrades.deployProxy(
            StakingRewardDistributorFactory,
            [ZUN.address, 'Zunami Voting Token', 'vlZUN', admin.address],
            {
                kind: 'uups',
            }
        );
        await instance.deployed();

        const stakingRewardDistributor = instance as ZUNStakingRewardDistributor;

        await stakingRewardDistributor.setEarlyExitReceiver(earlyExitReceiver.address);

        return {
            stakingRewardDistributor,
            ZUN,
            REWARD,
            REWARD2,
            admin,
            users: [user1, user2, user3],
            earlyExitReceiver,
        };
    }

    async function depositByTwoUsersState(
        depositAmount1: number | string,
        depositAmount2: number | string,
        fixture: any
    ) {
        const { stakingRewardDistributor, ZUN, REWARD, REWARD2, admin, users } = fixture;

        // start balances
        expect(await ZUN.balanceOf(stakingRewardDistributor.address)).to.eq(ethUnits('0'));
        expect(await ZUN.balanceOf(admin.address)).to.eq(ethUnits('100000000'));
        expect(await ZUN.balanceOf(users[0].address)).to.eq(ethUnits('0'));
        expect(await ZUN.balanceOf(users[1].address)).to.eq(ethUnits('0'));
        expect(await stakingRewardDistributor.balanceOf(users[0].address)).to.eq(ethUnits('0'));
        expect(await stakingRewardDistributor.balanceOf(users[1].address)).to.eq(ethUnits('0'));

        // add reward tokens and pool
        const tid1 = 0;
        await stakingRewardDistributor.addRewardToken(REWARD.address);
        const tid2 = 1;
        await stakingRewardDistributor.addRewardToken(REWARD2.address);

        // add DISTRIBUTOR_ROLE to admin
        await stakingRewardDistributor.grantRole(
            await stakingRewardDistributor.DISTRIBUTOR_ROLE(),
            admin.address
        );

        // users deposit ZUN tokens
        if (depositAmount1) {
            const amount1 = ethUnits(depositAmount1);
            await ZUN.transfer(users[0].address, amount1);
            await ZUN.connect(users[0]).approve(stakingRewardDistributor.address, amount1);
            await stakingRewardDistributor.connect(users[0]).deposit(amount1, users[0].address);
            expect(await stakingRewardDistributor.balanceOf(users[0].address)).to.eq(amount1);
        }
        if (depositAmount2) {
            const amount2 = ethUnits(depositAmount2);
            await ZUN.transfer(users[1].address, amount2);
            await ZUN.connect(users[1]).approve(stakingRewardDistributor.address, amount2);
            await stakingRewardDistributor.connect(users[1]).deposit(amount2, users[1].address);
            expect(await stakingRewardDistributor.balanceOf(users[1].address)).to.eq(amount2);
        }

        // check rewards info
        const rewardTokenInfoBefore = await stakingRewardDistributor.rewardTokenInfo(tid1);
        expect(rewardTokenInfoBefore.distribution).to.be.eq(0);

        return {
            tid1,
            tid2,
        };
    }

    it('should return initial tokenRatio = 1', async () => {
        const { stakingRewardDistributor } = await loadFixture(deployFixture);
        expect(await stakingRewardDistributor.getRecapitalizationRatio()).to.eq(ethUnits(1));
    });

    it('should deposit ZUN tokens and get vlZUN', async () => {
        const { stakingRewardDistributor, ZUN, users } = await loadFixture(deployFixture);

        // balances of ZUN and vlZUN are empty
        expect(await ZUN.balanceOf(users[0].address)).to.eq(ethUnits('0'));
        expect(await ZUN.balanceOf(users[1].address)).to.eq(ethUnits('0'));
        expect(await stakingRewardDistributor.balanceOf(users[0].address)).to.eq(ethUnits('0'));
        expect(await stakingRewardDistributor.balanceOf(users[1].address)).to.eq(ethUnits('0'));

        // try to deposit without tokens
        await expect(
            stakingRewardDistributor.connect(users[0]).deposit(ethUnits('1000'), users[0].address)
        ).to.be.revertedWithCustomError(ZUN, 'ERC20InsufficientAllowance');

        // users receive ZUN and deposit to distributor
        await ZUN.transfer(users[0].address, ethUnits('1000'));
        await ZUN.transfer(users[1].address, ethUnits('2000'));
        await ZUN.connect(users[0]).approve(stakingRewardDistributor.address, ethUnits('1000'));
        await ZUN.connect(users[1]).approve(stakingRewardDistributor.address, ethUnits('2000'));
        const tx1 = await stakingRewardDistributor
            .connect(users[0])
            .deposit(ethUnits('1000'), users[0].address);
        const tx2 = await stakingRewardDistributor
            .connect(users[1])
            .deposit(ethUnits('2000'), users[1].address);

        await expect(tx1)
            .to.emit(stakingRewardDistributor, 'Deposited')
            .withArgs(users[0].address, 0, ethUnits('1000'), tx1.blockNumber! + BLOCKS_IN_4_MONTHS);
        await expect(tx2)
            .to.emit(stakingRewardDistributor, 'Deposited')
            .withArgs(users[1].address, 0, ethUnits('2000'), tx2.blockNumber! + BLOCKS_IN_4_MONTHS);
        expect(await stakingRewardDistributor.balanceOf(users[0].address)).to.eq(ethUnits('1000'));
        expect(await stakingRewardDistributor.balanceOf(users[1].address)).to.eq(ethUnits('2000'));
        expect((await stakingRewardDistributor.userLocks(users[0].address, 0)).amount).to.eq(
            ethUnits('1000')
        );
        expect((await stakingRewardDistributor.userLocks(users[0].address, 0)).untilBlock).to.eq(
            tx1.blockNumber! + BLOCKS_IN_4_MONTHS
        );
        expect((await stakingRewardDistributor.userLocks(users[1].address, 0)).amount).to.eq(
            ethUnits('2000')
        );
        expect((await stakingRewardDistributor.userLocks(users[1].address, 0)).untilBlock).to.eq(
            tx2.blockNumber! + BLOCKS_IN_4_MONTHS
        );
        expect(await stakingRewardDistributor.totalAmount()).to.eq(ethUnits('3000'));
    });

    it('should deposit with permit', async () => {
        // given
        const { stakingRewardDistributor, ZUN, users } = await loadFixture(deployFixture);
        const depositAmount = ethUnits('1000');
        await ZUN.transfer(users[0].address, depositAmount);
        const { deadline, v, r, s } = await getSignTypedData(
            users[0],
            ZUN,
            stakingRewardDistributor.address,
            depositAmount
        );

        // when
        const tx1 = await stakingRewardDistributor
            .connect(users[0])
            .depositWithPermit(depositAmount, users[0].address, deadline, v, r, s);

        // then
        await expect(tx1)
            .to.emit(stakingRewardDistributor, 'Deposited')
            .withArgs(users[0].address, 0, ethUnits('1000'), tx1.blockNumber! + BLOCKS_IN_4_MONTHS);
        expect(await stakingRewardDistributor.balanceOf(users[0].address)).to.eq(ethUnits('1000'));
        expect((await stakingRewardDistributor.userLocks(users[0].address, 0)).amount).to.eq(
            ethUnits('1000')
        );
        expect((await stakingRewardDistributor.userLocks(users[0].address, 0)).untilBlock).to.eq(
            tx1.blockNumber! + BLOCKS_IN_4_MONTHS
        );
        expect(await stakingRewardDistributor.totalAmount()).to.eq(ethUnits('1000'));
    });

    it('should revert deposit when amount is zero', async () => {
        const { stakingRewardDistributor, users } = await loadFixture(deployFixture);

        // try to deposit with zero amount
        await expect(
            stakingRewardDistributor.connect(users[0]).deposit(ethUnits(0), users[0].address)
        ).to.be.revertedWithCustomError(stakingRewardDistributor, 'ZeroAmount');
    });

    it('withdraw immediately after deposit', async () => {
        const fixture = await loadFixture(deployFixture);

        const depositAmount1 = 1000;
        const depositAmount2 = 2000;
        await depositByTwoUsersState(depositAmount1, depositAmount2, fixture);
        const { stakingRewardDistributor, ZUN, users, earlyExitReceiver } = fixture;

        // check balances before withdraw
        expect(await stakingRewardDistributor.balanceOf(users[0].address)).to.eq(
            ethUnits(depositAmount1)
        );
        expect(await ZUN.balanceOf(users[0].address)).to.eq(ethUnits(0));
        expect(await ZUN.balanceOf(earlyExitReceiver.address)).to.eq(ethUnits(0));
        expect(await ZUN.balanceOf(stakingRewardDistributor.address)).to.eq(
            ethUnits(depositAmount1 + depositAmount2)
        );
        const totalAmountsBefore = await stakingRewardDistributor.totalAmount();

        const withdrawAmount = ethUnits(depositAmount1);
        const tx = await stakingRewardDistributor
            .connect(users[0])
            .withdraw(0, false, users[0].address);

        const transferredAmount = withdrawAmount.div(100).mul(85);
        await expect(tx)
            .to.emit(stakingRewardDistributor, 'Withdrawn')
            .withArgs(users[0].address, 0, withdrawAmount, withdrawAmount, transferredAmount);
        // check balances after withdraw - 15% of withdrawal has transfered to earlyExitReceiver
        expect(await stakingRewardDistributor.balanceOf(users[0].address)).to.eq(0);
        expect(await ZUN.balanceOf(users[0].address)).to.eq(transferredAmount);
        expect(await ZUN.balanceOf(earlyExitReceiver.address)).to.eq(
            withdrawAmount.div(100).mul(15)
        );
        expect(await ZUN.balanceOf(stakingRewardDistributor.address)).to.eq(
            ethUnits(depositAmount2)
        );

        // check pool amount
        expect(await stakingRewardDistributor.balanceOf(users[0].address)).to.eq(0);
        const totalAmountsAfter = await stakingRewardDistributor.totalAmount();
        expect(totalAmountsAfter).to.eq(totalAmountsBefore.sub(ethUnits(depositAmount1)));

        // check lock info
        const lockInfo = await stakingRewardDistributor.userLocks(users[0].address, 0);
        expect(lockInfo.amount).to.eq(ethUnits(depositAmount1));
        expect(lockInfo.untilBlock).to.eq(0);
    });

    it('withdraw after lock period', async () => {
        const fixture = await loadFixture(deployFixture);

        const depositAmount1 = 1000;
        const depositAmount2 = 2000;
        await depositByTwoUsersState(depositAmount1, depositAmount2, fixture);
        const { stakingRewardDistributor, ZUN, users, earlyExitReceiver } = fixture;

        // check balances before withdraw
        expect(await stakingRewardDistributor.balanceOf(users[0].address)).to.eq(
            ethUnits(depositAmount1)
        );
        expect(await ZUN.balanceOf(users[0].address)).to.eq(ethUnits(0));
        expect(await ZUN.balanceOf(earlyExitReceiver.address)).to.eq(ethUnits(0));
        expect(await ZUN.balanceOf(stakingRewardDistributor.address)).to.eq(
            ethUnits(depositAmount1 + depositAmount2)
        );
        const totalAmountsBefore = await stakingRewardDistributor.totalAmount();

        // mine blocks to unlock the withdraw without early exit fee
        await mineUpTo((await stakingRewardDistributor.userLocks(users[0].address, 0)).untilBlock);

        const withdrawAmount = ethUnits(depositAmount1);
        const tx = await stakingRewardDistributor
            .connect(users[0])
            .withdraw(0, false, users[0].address);

        await expect(tx)
            .to.emit(stakingRewardDistributor, 'Withdrawn')
            .withArgs(users[0].address, 0, withdrawAmount, withdrawAmount, withdrawAmount);
        expect(await stakingRewardDistributor.balanceOf(users[0].address)).to.eq(0);
        expect(await ZUN.balanceOf(users[0].address)).to.eq(withdrawAmount);
        expect(await ZUN.balanceOf(earlyExitReceiver.address)).to.eq(0);
        expect(await ZUN.balanceOf(stakingRewardDistributor.address)).to.eq(
            ethUnits(depositAmount2)
        );

        // check pool amount
        expect(await stakingRewardDistributor.balanceOf(users[0].address)).to.eq(0);
        const totalAmountsAfter = await stakingRewardDistributor.totalAmount();
        expect(totalAmountsAfter).to.eq(totalAmountsBefore.sub(ethUnits(depositAmount1)));
        // check lock info
        const lockInfo = await stakingRewardDistributor.userLocks(users[0].address, 0);
        expect(lockInfo.amount).to.eq(ethUnits(depositAmount1));
        expect(lockInfo.untilBlock).to.eq(0);
    });

    it('withdraw after lock period with claim', async () => {
        const fixture = await loadFixture(deployFixture);
        const { stakingRewardDistributor, ZUN, REWARD, users, admin, earlyExitReceiver } = fixture;

        await stakingRewardDistributor.grantRole(
            await stakingRewardDistributor.DISTRIBUTOR_ROLE(),
            admin.address
        );

        // deposit
        const depositAmount1 = 1000;
        const depositAmount2 = 2000;
        await depositByTwoUsersState(depositAmount1, depositAmount2, fixture);

        // distribute rewards
        const tid = '0';
        await REWARD.approve(stakingRewardDistributor.address, ethUnits('100000000'));
        await stakingRewardDistributor.distribute(REWARD.address, ethUnits('100000000'));
        expect(await REWARD.balanceOf(stakingRewardDistributor.address)).to.eq(
            ethUnits('100000000')
        );

        // check balances before withdraw
        expect(await stakingRewardDistributor.balanceOf(users[0].address)).to.eq(
            ethUnits(depositAmount1)
        );
        expect(await ZUN.balanceOf(users[0].address)).to.eq(ethUnits(0));
        expect(await ZUN.balanceOf(earlyExitReceiver.address)).to.eq(ethUnits(0));
        expect(await ZUN.balanceOf(stakingRewardDistributor.address)).to.eq(
            ethUnits(depositAmount1 + depositAmount2)
        );
        const totalAmountsBefore = await stakingRewardDistributor.totalAmount();

        // mine blocks to unlock the withdraw without early exit fee
        await mineUpTo((await stakingRewardDistributor.userLocks(users[0].address, 0)).untilBlock);

        const withdrawAmount = ethUnits(depositAmount1);
        const expectedReward = await stakingRewardDistributor.getPendingReward(
            tid,
            users[0].address
        );

        const tx = await stakingRewardDistributor
            .connect(users[0])
            .withdraw(0, true, users[0].address);

        await expect(tx)
            .to.emit(stakingRewardDistributor, 'Withdrawn')
            .withArgs(users[0].address, 0, withdrawAmount, withdrawAmount, withdrawAmount);
        expect(await stakingRewardDistributor.balanceOf(users[0].address)).to.eq(0);
        expect(await ZUN.balanceOf(users[0].address)).to.eq(withdrawAmount);
        expect(await ZUN.balanceOf(earlyExitReceiver.address)).to.eq(0);
        expect(await ZUN.balanceOf(stakingRewardDistributor.address)).to.eq(
            ethUnits(depositAmount2)
        );

        // check pool amount
        expect(await stakingRewardDistributor.balanceOf(users[0].address)).to.eq(0);
        const totalAmountsAfter = await stakingRewardDistributor.totalAmount();
        expect(totalAmountsAfter).to.eq(totalAmountsBefore.sub(ethUnits(depositAmount1)));
        // check lock info
        const lockInfo = await stakingRewardDistributor.userLocks(users[0].address, 0);
        expect(lockInfo.amount).to.eq(ethUnits(depositAmount1));
        expect(lockInfo.untilBlock).to.eq(0);
        // check rewards
        expect(await REWARD.balanceOf(users[0].address)).to.eq(expectedReward);
    });

    it('withdraw should revert when no lock with provided index', async () => {
        const { stakingRewardDistributor, ZUN, REWARD, REWARD2, admin, users, earlyExitReceiver } =
            await loadFixture(deployFixture);

        await expect(
            stakingRewardDistributor.connect(users[0]).withdraw(0, false, users[0].address)
        ).to.be.revertedWithCustomError(stakingRewardDistributor, 'LockDoesNotExist');
    });

    it('withdraw should revert when already unlocked', async () => {
        const fixture = await loadFixture(deployFixture);

        const depositAmount1 = 1000;
        const depositAmount2 = 2000;
        await depositByTwoUsersState(depositAmount1, depositAmount2, fixture);
        const { stakingRewardDistributor, ZUN, users, earlyExitReceiver } = fixture;

        // mine blocks to unlock the withdraw without early exit fee and withdraw
        await mineUpTo((await stakingRewardDistributor.userLocks(users[0].address, 0)).untilBlock);
        await stakingRewardDistributor.connect(users[0]).withdraw(0, false, users[0].address);

        // try to withdraw again
        await expect(
            stakingRewardDistributor.connect(users[0]).withdraw(0, false, users[0].address)
        ).to.be.revertedWithCustomError(stakingRewardDistributor, 'Unlocked');
    });

    it('withdraw pool tokens from staking reward distributor', async () => {
        const fixture = await loadFixture(deployFixture);

        const depositAmount1 = 1000;
        const depositAmount2 = 2000;
        await depositByTwoUsersState(depositAmount1, depositAmount2, fixture);
        const { stakingRewardDistributor, ZUN, users } = fixture;

        // add RECAPITALIZATION_ROLE to user[2]
        await stakingRewardDistributor.grantRole(
            await stakingRewardDistributor.RECAPITALIZATION_ROLE(),
            users[2].address
        );

        // check balances before withdraw
        expect(await ZUN.balanceOf(users[2].address)).to.eq(ethUnits(0));
        expect(await stakingRewardDistributor.recapitalizedAmount()).to.eq(0);

        // withdraw pool tokens from staking reward distributor
        const withdrawAmount = 2500;
        const tx = await stakingRewardDistributor
            .connect(users[2])
            .withdrawToken(ethUnits(withdrawAmount));

        await expect(tx)
            .to.emit(stakingRewardDistributor, 'WithdrawnToken')
            .withArgs(ethUnits(withdrawAmount));
        // check balances after withdraw
        expect(await ZUN.balanceOf(users[2].address)).to.eq(ethUnits(withdrawAmount));
        expect(await stakingRewardDistributor.recapitalizedAmount()).to.eq(
            ethUnits(withdrawAmount)
        );
    });

    it('user deposit and withdraw reduced amount when recapitalizedAmount > 0', async () => {
        const fixture = await loadFixture(deployFixture);
        const depositAmount1 = 1000;
        const depositAmount2 = 2000;
        // deposit before withdraw token
        await depositByTwoUsersState(depositAmount1, depositAmount2, fixture);
        const { stakingRewardDistributor, ZUN, users, admin } = fixture;
        await stakingRewardDistributor.grantRole(
            await stakingRewardDistributor.RECAPITALIZATION_ROLE(),
            admin.address
        );

        // withdraw pool token from staking reward distributor
        const withdrawTokenAmount = ethUnits(1010);
        expect(await stakingRewardDistributor.getRecapitalizationRatio()).to.eq(ethUnits(1));
        await stakingRewardDistributor.connect(admin).withdrawToken(withdrawTokenAmount);

        // check that token ratio and recapitalized amount are updated
        const expectedRatio = BigNumber.from('663333333333333333');
        expect(await stakingRewardDistributor.recapitalizedAmount()).to.eq(withdrawTokenAmount);
        expect(await stakingRewardDistributor.getRecapitalizationRatio()).to.eq(expectedRatio);

        // deposit doesn't change the ratio
        const newDepositAmount = ethUnits(1000);
        await ZUN.transfer(users[2].address, newDepositAmount);
        await depositToPool(stakingRewardDistributor, ZUN, users[2], newDepositAmount);

        expect(await stakingRewardDistributor.balanceOf(users[2].address)).to.eq(newDepositAmount);
        expect(await stakingRewardDistributor.getRecapitalizationRatio()).to.eq(expectedRatio);

        // withdraw tokens by all users after lock period (without early exit fee) and check that tokenRatio is not changed
        await mineUpTo((await stakingRewardDistributor.userLocks(users[2].address, 0)).untilBlock);

        const withdrawAmount1 = ethUnits(depositAmount1);
        const amountReduced1 = withdrawAmount1.mul(expectedRatio).div(ethUnits(1));
        const tx1 = await stakingRewardDistributor
            .connect(users[0])
            .withdraw(0, false, users[0].address);
        await expect(tx1)
            .to.emit(stakingRewardDistributor, 'Withdrawn')
            .withArgs(users[0].address, 0, withdrawAmount1, amountReduced1, amountReduced1);
        expect(await stakingRewardDistributor.getRecapitalizationRatio()).to.eq(expectedRatio);

        const withdrawAmount2 = ethUnits(depositAmount2);
        const amountReduced2 = withdrawAmount2.mul(expectedRatio).div(ethUnits(1));
        const tx2 = await stakingRewardDistributor
            .connect(users[1])
            .withdraw(0, false, users[1].address);
        await expect(tx2)
            .to.emit(stakingRewardDistributor, 'Withdrawn')
            .withArgs(users[1].address, 0, withdrawAmount2, amountReduced2, amountReduced2);
        //FIXME: decide what to do with increase in the ratio after withdraw
        const expectedRatioWithdraw = BigNumber.from('663333333333333334');
        expect(await stakingRewardDistributor.getRecapitalizationRatio()).to.eq(
            expectedRatioWithdraw
        );

        const withdrawAmount3 = newDepositAmount;
        const amountReduced3 = withdrawAmount3.mul(expectedRatioWithdraw).div(ethUnits(1));
        const tx3 = await stakingRewardDistributor
            .connect(users[2])
            .withdraw(0, false, users[2].address);
        await expect(tx3)
            .to.emit(stakingRewardDistributor, 'Withdrawn')
            .withArgs(users[2].address, 0, withdrawAmount3, amountReduced3, amountReduced3);

        // check that token ratio, balances and recapitalized amount are updated
        expect(await stakingRewardDistributor.getRecapitalizationRatio()).to.eq(ethUnits(1));
        expect(await stakingRewardDistributor.recapitalizedAmount()).to.eq(0);
        expect(await stakingRewardDistributor.balanceOf(users[0].address)).to.eq(0);
        expect(await stakingRewardDistributor.balanceOf(users[1].address)).to.eq(0);
        expect(await stakingRewardDistributor.balanceOf(users[2].address)).to.eq(0);
        expect(await ZUN.balanceOf(users[0].address)).to.eq(amountReduced1);
        expect(await ZUN.balanceOf(users[1].address)).to.eq(amountReduced2);
        expect(await ZUN.balanceOf(users[2].address)).to.eq(amountReduced3);
    });

    it('user deposit and withdraw reduced amount with early exit fee when recapitalizedAmount > 0', async () => {
        const fixture = await loadFixture(deployFixture);
        const depositAmount1 = 1000;
        const depositAmount2 = 2000;
        // deposit before withdraw token
        await depositByTwoUsersState(depositAmount1, depositAmount2, fixture);
        const { stakingRewardDistributor, ZUN, users, admin } = fixture;
        await stakingRewardDistributor.grantRole(
            await stakingRewardDistributor.RECAPITALIZATION_ROLE(),
            admin.address
        );

        // withdraw pool token from staking reward distributor
        const withdrawTokenAmount = ethUnits(1010);
        expect(await stakingRewardDistributor.getRecapitalizationRatio()).to.eq(ethUnits(1));
        await stakingRewardDistributor.connect(admin).withdrawToken(withdrawTokenAmount);

        // check that token ratio and recapitalized amount are updated
        const expectedRatio = BigNumber.from('663333333333333333');
        expect(await stakingRewardDistributor.recapitalizedAmount()).to.eq(withdrawTokenAmount);
        expect(await stakingRewardDistributor.getRecapitalizationRatio()).to.eq(expectedRatio);

        // deposit doesn't change the ratio
        const newDepositAmount = ethUnits(1000);
        await ZUN.transfer(users[2].address, newDepositAmount);
        await depositToPool(stakingRewardDistributor, ZUN, users[2], newDepositAmount);

        expect(await stakingRewardDistributor.balanceOf(users[2].address)).to.eq(newDepositAmount);
        expect(await stakingRewardDistributor.getRecapitalizationRatio()).to.eq(expectedRatio);

        const withdrawAmount1 = ethUnits(depositAmount1);
        const amountReduced1 = withdrawAmount1.mul(expectedRatio).div(ethUnits(1));
        const amountReducedWithFee1 = amountReduced1.div(100).mul(85);
        const tx1 = await stakingRewardDistributor
            .connect(users[0])
            .withdraw(0, false, users[0].address);
        await expect(tx1)
            .to.emit(stakingRewardDistributor, 'Withdrawn')
            .withArgs(users[0].address, 0, withdrawAmount1, amountReduced1, amountReducedWithFee1);
        expect(await stakingRewardDistributor.getRecapitalizationRatio()).to.eq(expectedRatio);

        const withdrawAmount2 = ethUnits(depositAmount2);
        const amountReduced2 = withdrawAmount2.mul(expectedRatio).div(ethUnits(1));
        const amountReducedWithFee2 = amountReduced2.div(100).mul(85);
        const tx2 = await stakingRewardDistributor
            .connect(users[1])
            .withdraw(0, false, users[1].address);
        await expect(tx2)
            .to.emit(stakingRewardDistributor, 'Withdrawn')
            .withArgs(users[1].address, 0, withdrawAmount2, amountReduced2, amountReducedWithFee2);
        //FIXME: decide what to do with increase in the ratio after withdraw
        const expectedRatioWithdraw = BigNumber.from('663333333333333334');
        expect(await stakingRewardDistributor.getRecapitalizationRatio()).to.eq(
            expectedRatioWithdraw
        );

        const withdrawAmount3 = newDepositAmount;
        const amountReduced3 = withdrawAmount3.mul(expectedRatioWithdraw).div(ethUnits(1));
        const amountReducedWithFee3 = amountReduced3.div(100).mul(85);
        const tx3 = await stakingRewardDistributor
            .connect(users[2])
            .withdraw(0, false, users[2].address);
        await expect(tx3)
            .to.emit(stakingRewardDistributor, 'Withdrawn')
            .withArgs(users[2].address, 0, withdrawAmount3, amountReduced3, amountReducedWithFee3);

        // check that token ratio, balances and recapitalized amount are updated
        expect(await stakingRewardDistributor.getRecapitalizationRatio()).to.eq(ethUnits(1));
        expect(await stakingRewardDistributor.recapitalizedAmount()).to.eq(0);
        expect(await stakingRewardDistributor.balanceOf(users[0].address)).to.eq(0);
        expect(await stakingRewardDistributor.balanceOf(users[1].address)).to.eq(0);
        expect(await stakingRewardDistributor.balanceOf(users[2].address)).to.eq(0);
        expect(await ZUN.balanceOf(users[0].address)).to.eq(amountReducedWithFee1);
        expect(await ZUN.balanceOf(users[1].address)).to.eq(amountReducedWithFee2);
        expect(await ZUN.balanceOf(users[2].address)).to.eq(amountReducedWithFee3);
    });

    it('deposit and withdraw when ZUN added as reward token after lock period', async () => {
        const fixture = await loadFixture(deployFixture);
        const { stakingRewardDistributor, ZUN, users, earlyExitReceiver } = fixture;

        // add ZUN as reward token
        await stakingRewardDistributor.addRewardToken(ZUN.address);

        const depositAmount1 = 1000;
        const depositAmount2 = 2000;
        await depositByTwoUsersState(depositAmount1, depositAmount2, fixture);

        // check balances before withdraw
        expect(await stakingRewardDistributor.balanceOf(users[0].address)).to.eq(
            ethUnits(depositAmount1)
        );
        expect(await ZUN.balanceOf(users[0].address)).to.eq(ethUnits(0));
        expect(await ZUN.balanceOf(earlyExitReceiver.address)).to.eq(ethUnits(0));
        expect(await ZUN.balanceOf(stakingRewardDistributor.address)).to.eq(
            ethUnits(depositAmount1 + depositAmount2)
        );
        const totalAmountsBefore = await stakingRewardDistributor.totalAmount();

        // mine blocks to unlock the withdraw without early exit fee
        await mineUpTo((await stakingRewardDistributor.userLocks(users[0].address, 0)).untilBlock);

        const withdrawAmount = ethUnits(depositAmount1);
        const tx = await stakingRewardDistributor
            .connect(users[0])
            .withdraw(0, false, users[0].address);

        await expect(tx)
            .to.emit(stakingRewardDistributor, 'Withdrawn')
            .withArgs(users[0].address, 0, withdrawAmount, withdrawAmount, withdrawAmount);
        expect(await stakingRewardDistributor.balanceOf(users[0].address)).to.eq(0);
        expect(await ZUN.balanceOf(users[0].address)).to.eq(withdrawAmount);
        expect(await ZUN.balanceOf(earlyExitReceiver.address)).to.eq(0);
        expect(await ZUN.balanceOf(stakingRewardDistributor.address)).to.eq(
            ethUnits(depositAmount2)
        );

        // check pool amount
        expect(await stakingRewardDistributor.balanceOf(users[0].address)).to.eq(0);
        const totalAmountsAfter = await stakingRewardDistributor.totalAmount();
        expect(totalAmountsAfter).to.eq(totalAmountsBefore.sub(ethUnits(depositAmount1)));
        // check lock info
        const lockInfo = await stakingRewardDistributor.userLocks(users[0].address, 0);
        expect(lockInfo.amount).to.eq(ethUnits(depositAmount1));
        expect(lockInfo.untilBlock).to.eq(0);
    });

    it('deposit and withdraw when ZUN added as reward token after lock period with claim', async () => {
        const fixture = await loadFixture(deployFixture);
        const { stakingRewardDistributor, ZUN, REWARD, users, admin, earlyExitReceiver } = fixture;

        await stakingRewardDistributor.grantRole(
            await stakingRewardDistributor.DISTRIBUTOR_ROLE(),
            admin.address
        );

        // add ZUN as reward token
        await stakingRewardDistributor.addRewardToken(ZUN.address);
        const zunTid = await stakingRewardDistributor.rewardTokenTidByAddress(ZUN.address);

        // deposit
        const depositAmount1 = 1000;
        const depositAmount2 = 2000;
        await depositByTwoUsersState(depositAmount1, depositAmount2, fixture);

        // distribute REWARD
        const tid = await stakingRewardDistributor.rewardTokenTidByAddress(REWARD.address);
        await REWARD.approve(stakingRewardDistributor.address, ethUnits('100000000'));
        await stakingRewardDistributor.distribute(REWARD.address, ethUnits('100000000'));
        expect(await REWARD.balanceOf(stakingRewardDistributor.address)).to.eq(
            ethUnits('100000000')
        );
        // distribute ZUN reward
        const zunDistributionAmount = ethUnits('1000');
        await ZUN.transfer(admin.address, zunDistributionAmount);
        await ZUN.approve(stakingRewardDistributor.address, zunDistributionAmount);
        const distributeTx = await stakingRewardDistributor.distribute(
            ZUN.address,
            zunDistributionAmount
        );
        await expect(distributeTx).to.changeTokenBalance(
            ZUN,
            stakingRewardDistributor,
            zunDistributionAmount
        );

        // check balances before withdraw
        expect(await stakingRewardDistributor.balanceOf(users[0].address)).to.eq(
            ethUnits(depositAmount1)
        );
        expect(await ZUN.balanceOf(users[0].address)).to.eq(ethUnits(0));
        expect(await ZUN.balanceOf(earlyExitReceiver.address)).to.eq(ethUnits(0));
        expect(await ZUN.balanceOf(stakingRewardDistributor.address)).to.eq(
            ethUnits(depositAmount1 + depositAmount2).add(zunDistributionAmount)
        );
        const totalAmountsBefore = await stakingRewardDistributor.totalAmount();

        // mine blocks to unlock the withdraw without early exit fee
        await mineUpTo((await stakingRewardDistributor.userLocks(users[0].address, 0)).untilBlock);

        const withdrawAmount = ethUnits(depositAmount1);
        const expectedReward = await stakingRewardDistributor.getPendingReward(
            tid,
            users[0].address
        );
        const expectedZunReward = await stakingRewardDistributor.getPendingReward(
            zunTid,
            users[0].address
        );

        const tx = await stakingRewardDistributor
            .connect(users[0])
            .withdraw(0, true, users[0].address);
        await expect(tx)
            .to.emit(stakingRewardDistributor, 'Withdrawn')
            .withArgs(users[0].address, 0, withdrawAmount, withdrawAmount, withdrawAmount);
        await expect(tx).changeTokenBalances(
            ZUN,
            [users[0], stakingRewardDistributor],
            [withdrawAmount.add(expectedZunReward), withdrawAmount.add(expectedZunReward).mul(-1)]
        );
        await expect(tx).changeTokenBalance(REWARD, users[0], expectedReward);
        expect(await stakingRewardDistributor.balanceOf(users[0].address)).to.eq(0);
        expect(await ZUN.balanceOf(earlyExitReceiver.address)).to.eq(0);

        // check pool amount
        expect(await stakingRewardDistributor.balanceOf(users[0].address)).to.eq(0);
        const totalAmountsAfter = await stakingRewardDistributor.totalAmount();
        expect(totalAmountsAfter).to.eq(totalAmountsBefore.sub(ethUnits(depositAmount1)));
        // check lock info
        const lockInfo = await stakingRewardDistributor.userLocks(users[0].address, 0);
        expect(lockInfo.amount).to.eq(ethUnits(depositAmount1));
        expect(lockInfo.untilBlock).to.eq(0);
    });

    it('check rounding when user deposit and withdraw reduced amount when recapitalizedAmount > 0', async () => {
        const fixture = await loadFixture(deployFixture);
        const depositAmount1 = 1500;
        const depositAmount2 = 1500;
        // deposit before withdraw token
        await depositByTwoUsersState(depositAmount1, depositAmount2, fixture);
        const { stakingRewardDistributor, ZUN, users, admin } = fixture;
        await stakingRewardDistributor.grantRole(
            await stakingRewardDistributor.RECAPITALIZATION_ROLE(),
            admin.address
        );

        // withdraw pool token from staking reward distributor
        const withdrawTokenAmount = ethUnits(50);
        expect(await stakingRewardDistributor.getRecapitalizationRatio()).to.eq(ethUnits(1));
        await stakingRewardDistributor.connect(admin).withdrawToken(withdrawTokenAmount);

        // check that token ratio and recapitalized amount are updated
        expect(await stakingRewardDistributor.recapitalizedAmount()).to.eq(withdrawTokenAmount);
        const expectedRecapitalizationRatio = BigNumber.from('983333333333333333');
        expect(await stakingRewardDistributor.getRecapitalizationRatio()).to.eq(
            expectedRecapitalizationRatio
        );

        // withdraw tokens by all users after lock period (without early exit fee) and check that tokenRatio is not changed
        await mineUpTo((await stakingRewardDistributor.userLocks(users[1].address, 0)).untilBlock);

        const withdrawAmount1 = ethUnits(depositAmount1);
        const amountReduced1 = withdrawAmount1.mul(expectedRecapitalizationRatio).div(ethUnits(1));
        const tx1 = await stakingRewardDistributor
            .connect(users[0])
            .withdraw(0, false, users[0].address);
        await expect(tx1)
            .to.emit(stakingRewardDistributor, 'Withdrawn')
            .withArgs(users[0].address, 0, withdrawAmount1, amountReduced1, amountReduced1);
        expect(await stakingRewardDistributor.getRecapitalizationRatio()).to.eq(
            expectedRecapitalizationRatio
        );

        const withdrawAmount2 = ethUnits(depositAmount2);
        const amountReduced2 = withdrawAmount2.mul(expectedRecapitalizationRatio).div(ethUnits(1));
        const tx2 = await stakingRewardDistributor
            .connect(users[1])
            .withdraw(0, false, users[1].address);
        await expect(tx2)
            .to.emit(stakingRewardDistributor, 'Withdrawn')
            .withArgs(users[1].address, 0, withdrawAmount2, amountReduced2, amountReduced2);

        // check that token ratio, balances and recapitalized amount are updated
        expect(await stakingRewardDistributor.getRecapitalizationRatio()).to.eq(ethUnits(1));
        expect(await stakingRewardDistributor.recapitalizedAmount()).to.eq(0);
        expect(await stakingRewardDistributor.balanceOf(users[0].address)).to.eq(0);
        expect(await stakingRewardDistributor.balanceOf(users[1].address)).to.eq(0);
        expect(await ZUN.balanceOf(users[0].address)).to.eq(amountReduced1);
        expect(await ZUN.balanceOf(users[1].address)).to.eq(amountReduced2);
    });

    it('user deposit before `withdrawToken` and withdraw after `returnToken`', async () => {
        const fixture = await loadFixture(deployFixture);
        const depositAmount1 = 1000;
        const depositAmount2 = 2000;
        // deposit before withdraw token
        await depositByTwoUsersState(depositAmount1, depositAmount2, fixture);
        const { stakingRewardDistributor, ZUN, users, admin } = fixture;
        await stakingRewardDistributor.grantRole(
            await stakingRewardDistributor.RECAPITALIZATION_ROLE(),
            admin.address
        );
        // withdraw pool token from staking reward distributor
        const withdrawTokenAmount = 100;
        expect(await stakingRewardDistributor.getRecapitalizationRatio()).to.eq(ethUnits(1));
        await stakingRewardDistributor.connect(admin).withdrawToken(ethUnits(withdrawTokenAmount));
        // check that token ratio and recapitalized amount are updated
        expect(await stakingRewardDistributor.recapitalizedAmount()).to.eq(
            ethUnits(withdrawTokenAmount)
        );

        const expectedRecapitalizationRatio = BigNumber.from('966666666666666666');
        expect(await stakingRewardDistributor.getRecapitalizationRatio()).to.eq(
            expectedRecapitalizationRatio
        );

        // deposit after withdraw token
        const newDepositAmount = ethUnits(1000);
        await ZUN.transfer(users[2].address, newDepositAmount);
        await depositToPool(stakingRewardDistributor, ZUN, users[2], newDepositAmount);
        expect(await stakingRewardDistributor.balanceOf(users[2].address)).to.eq(newDepositAmount);

        // return pool tokens from staking reward distributor
        const debtTokenAmount = await stakingRewardDistributor.recapitalizedAmount();
        await ZUN.approve(stakingRewardDistributor.address, debtTokenAmount);
        await stakingRewardDistributor.returnToken(debtTokenAmount);
        expect(await stakingRewardDistributor.getRecapitalizationRatio()).to.eq(ethUnits(1));

        // withdraw tokens by all users after lock period (without early exit fee)
        await mineUpTo((await stakingRewardDistributor.userLocks(users[2].address, 0)).untilBlock);

        const withdrawAmount1 = ethUnits(depositAmount1);
        const tx1 = await stakingRewardDistributor
            .connect(users[0])
            .withdraw(0, false, users[0].address);
        await expect(tx1)
            .to.emit(stakingRewardDistributor, 'Withdrawn')
            .withArgs(users[0].address, 0, withdrawAmount1, withdrawAmount1, withdrawAmount1);

        const withdrawAmount2 = ethUnits(depositAmount2);
        const tx2 = await stakingRewardDistributor
            .connect(users[1])
            .withdraw(0, false, users[1].address);
        await expect(tx2)
            .to.emit(stakingRewardDistributor, 'Withdrawn')
            .withArgs(users[1].address, 0, withdrawAmount2, withdrawAmount2, withdrawAmount2);

        const withdrawAmount3 = newDepositAmount;
        const tx3 = await stakingRewardDistributor
            .connect(users[2])
            .withdraw(0, false, users[2].address);
        await expect(tx3)
            .to.emit(stakingRewardDistributor, 'Withdrawn')
            .withArgs(users[2].address, 0, withdrawAmount3, withdrawAmount3, withdrawAmount3);

        expect(await stakingRewardDistributor.balanceOf(users[0].address)).to.eq(0);
        expect(await stakingRewardDistributor.balanceOf(users[1].address)).to.eq(0);
        expect(await stakingRewardDistributor.balanceOf(users[2].address)).to.eq(0);
        expect(await ZUN.balanceOf(users[0].address)).to.eq(withdrawAmount1);
        expect(await ZUN.balanceOf(users[1].address)).to.eq(withdrawAmount2);
        expect(await ZUN.balanceOf(users[2].address)).to.eq(withdrawAmount3);
    });

    it('return pool tokens to staking reward distributor', async () => {
        const fixture = await loadFixture(deployFixture);

        const depositAmount1 = 1000;
        const depositAmount2 = 2000;
        await depositByTwoUsersState(depositAmount1, depositAmount2, fixture);
        const { stakingRewardDistributor, ZUN, users } = fixture;

        // add RECAPITALIZATION_ROLE to user[2]
        await stakingRewardDistributor.grantRole(
            await stakingRewardDistributor.RECAPITALIZATION_ROLE(),
            users[2].address
        );

        // check balances before withdraw
        expect(await ZUN.balanceOf(users[2].address)).to.eq(ethUnits(0));
        expect(await stakingRewardDistributor.recapitalizedAmount()).to.eq(0);

        // withdraw pool tokens from staking reward distributor
        const withdrawAmount = 2500;
        await stakingRewardDistributor.connect(users[2]).withdrawToken(ethUnits(withdrawAmount));

        // check balances after withdraw
        expect(await ZUN.balanceOf(users[2].address)).to.eq(ethUnits(withdrawAmount));
        expect(await stakingRewardDistributor.recapitalizedAmount()).to.eq(
            ethUnits(withdrawAmount)
        );

        // return pool tokens from staking reward distributor
        await ZUN.connect(users[2]).approve(
            stakingRewardDistributor.address,
            ethUnits(withdrawAmount)
        );
        const tx = await stakingRewardDistributor
            .connect(users[2])
            .returnToken(ethUnits(withdrawAmount));

        await expect(tx)
            .to.emit(stakingRewardDistributor, 'ReturnedToken')
            .withArgs(ethUnits(withdrawAmount));
        // check balances after return
        expect(await ZUN.balanceOf(users[2].address)).to.eq(ethUnits(0));
        expect(await stakingRewardDistributor.recapitalizedAmount()).to.eq(ethUnits(0));
    });

    it('should revert if early exit receiver is zero address', async () => {
        const fixture = await loadFixture(deployFixture);
        const { stakingRewardDistributor } = fixture;
        await expect(
            stakingRewardDistributor.setEarlyExitReceiver(zeroAddress)
        ).to.be.revertedWithCustomError(stakingRewardDistributor, 'ZeroAddress');
    });

    it('should revert if withdraw zero amount', async () => {
        const fixture = await loadFixture(deployFixture);
        const depositAmount1 = 1000;
        const depositAmount2 = 2000;
        await depositByTwoUsersState(depositAmount1, depositAmount2, fixture);
        const { stakingRewardDistributor, users } = fixture;

        await stakingRewardDistributor.grantRole(
            await stakingRewardDistributor.RECAPITALIZATION_ROLE(),
            users[2].address
        );
        await expect(
            stakingRewardDistributor.connect(users[2]).withdrawToken(0)
        ).to.be.revertedWithCustomError(stakingRewardDistributor, 'ZeroAmount');
    });

    it('should revert if withdraw wrong amount', async () => {
        const fixture = await loadFixture(deployFixture);
        const depositAmount1 = 1000;
        const depositAmount2 = 2000;
        await depositByTwoUsersState(depositAmount1, depositAmount2, fixture);
        const { stakingRewardDistributor, users } = fixture;

        await stakingRewardDistributor.grantRole(
            await stakingRewardDistributor.RECAPITALIZATION_ROLE(),
            users[2].address
        );
        await expect(
            stakingRewardDistributor.connect(users[2]).withdrawToken(ethUnits(100000000))
        ).to.be.revertedWithCustomError(stakingRewardDistributor, 'WrongAmount');
    });

    it('should revert if return zero tokens', async () => {
        const fixture = await loadFixture(deployFixture);
        const depositAmount1 = 1000;
        const depositAmount2 = 2000;
        await depositByTwoUsersState(depositAmount1, depositAmount2, fixture);
        const { stakingRewardDistributor, ZUN, users } = fixture;

        await stakingRewardDistributor.grantRole(
            await stakingRewardDistributor.RECAPITALIZATION_ROLE(),
            users[2].address
        );
        await ZUN.connect(users[2]).approve(
            stakingRewardDistributor.address,
            ethUnits(depositAmount2)
        );
        await expect(
            stakingRewardDistributor.connect(users[2]).returnToken(0)
        ).to.be.revertedWithCustomError(stakingRewardDistributor, 'ZeroAmount');
    });

    it('should revert if return wrong amount tokens', async () => {
        const fixture = await loadFixture(deployFixture);
        const depositAmount1 = 1000;
        const depositAmount2 = 2000;
        await depositByTwoUsersState(depositAmount1, depositAmount2, fixture);
        const { stakingRewardDistributor, ZUN, users } = fixture;

        await stakingRewardDistributor.grantRole(
            await stakingRewardDistributor.RECAPITALIZATION_ROLE(),
            users[2].address
        );
        await ZUN.connect(users[2]).approve(
            stakingRewardDistributor.address,
            ethUnits(depositAmount2)
        );
        await expect(
            stakingRewardDistributor.connect(users[2]).returnToken(ethUnits(100000000))
        ).to.be.revertedWithCustomError(stakingRewardDistributor, 'WrongAmount');
    });

    it('should deposit and withdraw if receiver zero address', async () => {
        const fixture = await loadFixture(deployFixture);

        const depositAmount1 = 1000;
        const depositAmount2 = 2000;
        await depositByTwoUsersState(depositAmount1, depositAmount2, fixture);
        const { stakingRewardDistributor, ZUN, users } = fixture;

        await ZUN.transfer(users[0].address, ethUnits(depositAmount1));
        await ZUN.connect(users[0]).approve(
            stakingRewardDistributor.address,
            ethUnits(depositAmount1)
        );
        await stakingRewardDistributor
            .connect(users[0])
            .deposit(ethUnits(depositAmount1), zeroAddress);
        expect(await stakingRewardDistributor.balanceOf(users[0].address)).to.eq(
            ethUnits(depositAmount1 * 2)
        );

        const withdrawAmount = ethUnits(depositAmount1);
        await stakingRewardDistributor
            .connect(users[0])
            .approve(stakingRewardDistributor.address, withdrawAmount);
        await stakingRewardDistributor.connect(users[0]).withdraw(0, false, zeroAddress);

        expect(await ZUN.balanceOf(users[0].address)).to.be.eq(
            ethUnits(depositAmount1).div(100).mul(85)
        );
    });

    it('should distribute rewards if reward is ZUN', async () => {
        const fixture = await loadFixture(deployFixture);

        const depositAmount1 = 1000;
        const depositAmount2 = 3000;
        await depositByTwoUsersState(depositAmount1, depositAmount2, fixture);
        const { stakingRewardDistributor, ZUN, users, admin } = fixture;

        await stakingRewardDistributor.grantRole(
            await stakingRewardDistributor.DISTRIBUTOR_ROLE(),
            admin.address
        );
        await stakingRewardDistributor.addRewardToken(ZUN.address);

        const balanceBefore = await ZUN.balanceOf(stakingRewardDistributor.address);
        const distributionAmount = 100000;
        await ZUN.approve(stakingRewardDistributor.address, ethUnits(distributionAmount));
        await stakingRewardDistributor.distribute(ZUN.address, ethUnits(distributionAmount));
        const balanceAfter = await ZUN.balanceOf(stakingRewardDistributor.address);
        expect(balanceAfter.sub(balanceBefore)).to.eq(ethUnits(distributionAmount));

        await stakingRewardDistributor.connect(users[0]).claim(users[0].address);
        await stakingRewardDistributor.connect(users[1]).claim(users[1].address);

        expect(await ZUN.balanceOf(users[0].address)).to.be.eq(ethUnits(distributionAmount).div(4));
        expect(await ZUN.balanceOf(users[1].address)).to.be.eq(
            ethUnits(distributionAmount).div(4).mul(3)
        );
    });

    it('should distribute reward token if user send some LP to another', async () => {
        const fixture = await loadFixture(deployFixture);

        const depositAmount1 = 1000;
        const { tid1, tid2 } = await depositByTwoUsersState(depositAmount1, 0, fixture);
        const { stakingRewardDistributor, ZUN, REWARD, REWARD2, users, earlyExitReceiver } =
            fixture;

        const distributionAmount = ethUnits('3000000');
        const distributionAmount2 = ethUnits('30000');

        await REWARD.approve(stakingRewardDistributor.address, distributionAmount.div(3));
        await stakingRewardDistributor.distribute(REWARD.address, distributionAmount.div(3));
        await REWARD2.approve(stakingRewardDistributor.address, distributionAmount2.div(3));
        await stakingRewardDistributor.distribute(REWARD2.address, distributionAmount2.div(3));

        await stakingRewardDistributor
            .connect(users[0])
            .transfer(users[1].address, ethUnits(depositAmount1));

        await REWARD.approve(stakingRewardDistributor.address, distributionAmount.div(3));
        await stakingRewardDistributor.distribute(REWARD.address, distributionAmount.div(3));
        await REWARD2.approve(stakingRewardDistributor.address, distributionAmount2.div(3));
        await stakingRewardDistributor.distribute(REWARD2.address, distributionAmount2.div(3));

        await stakingRewardDistributor.connect(users[0]).claim(users[0].address);
        await stakingRewardDistributor.connect(users[1]).claim(users[1].address);

        expect(await REWARD.balanceOf(users[0].address)).to.be.eq(distributionAmount.div(3));
        expect(await REWARD.balanceOf(users[1].address)).to.be.eq(distributionAmount.div(3));
        expect(await REWARD2.balanceOf(users[0].address)).to.be.eq(distributionAmount2.div(3));
        expect(await REWARD2.balanceOf(users[1].address)).to.be.eq(distributionAmount2.div(3));

        await stakingRewardDistributor
            .connect(users[1])
            .transfer(users[0].address, ethUnits(depositAmount1 / 2));

        await REWARD.approve(stakingRewardDistributor.address, distributionAmount.div(3));
        await stakingRewardDistributor.distribute(REWARD.address, distributionAmount.div(3));
        await REWARD2.approve(stakingRewardDistributor.address, distributionAmount2.div(3));
        await stakingRewardDistributor.distribute(REWARD2.address, distributionAmount2.div(3));

        await stakingRewardDistributor.connect(users[0]).claim(users[0].address);
        await stakingRewardDistributor.connect(users[1]).claim(users[1].address);

        expect(await REWARD.balanceOf(users[0].address)).to.be.eq(distributionAmount.div(2));
        expect(await REWARD.balanceOf(users[1].address)).to.be.eq(distributionAmount.div(2));
        expect(await REWARD2.balanceOf(users[0].address)).to.be.eq(distributionAmount2.div(2));
        expect(await REWARD2.balanceOf(users[1].address)).to.be.eq(distributionAmount2.div(2));
    });

    async function addRewardToken(
        stakingRewardDistributor: ZUNStakingRewardDistributor,
        rewardToken: string
    ) {
        const rewardTokenCountBefore = await stakingRewardDistributor.rewardTokenCount();
        await stakingRewardDistributor.addRewardToken(rewardToken);
        const rewardTokenCountAfter = await stakingRewardDistributor.rewardTokenCount();
        expect(rewardTokenCountBefore.add(1)).eq(rewardTokenCountAfter);
    }

    async function depositToPool(
        stakingRewardDistributor: ZUNStakingRewardDistributor,
        token: ERC20,
        signer: SignerWithAddress,
        amount: BigNumberish
    ) {
        await token.connect(signer).approve(stakingRewardDistributor.address, amount);
        await stakingRewardDistributor.connect(signer).deposit(amount, signer.address);
    }

    async function distributeRewardTokens(
        stakingRewardDistributor: ZUNStakingRewardDistributor,
        rewardToken: ERC20,
        amount: BigNumberish,
        admin: SignerWithAddress
    ) {
        const distributorRole = await stakingRewardDistributor.DISTRIBUTOR_ROLE();
        const isDistributorRoleGranted = await stakingRewardDistributor.hasRole(
            distributorRole,
            admin.address
        );

        if (!isDistributorRoleGranted)
            await stakingRewardDistributor.grantRole(distributorRole, admin.address);

        await rewardToken.connect(admin).approve(stakingRewardDistributor.address, amount);
        await stakingRewardDistributor.connect(admin).distribute(rewardToken.address, amount);
    }
});
