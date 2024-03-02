import { ethers, upgrades } from 'hardhat';
import { loadFixture, mine } from '@nomicfoundation/hardhat-network-helpers';
import { parseUnits } from 'ethers/lib/utils';
import { expect } from 'chai';

import { ERC20, ZUNStakingRewardDistributor } from '../../typechain-types';
import { BigNumberish } from 'ethers';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';

const ethUnits = (amount: number | string) => parseUnits(amount.toString(), 'ether');

const BLOCKS_IN_1_DAYS = (24 * 60 * 60) / 12;
const BLOCKS_IN_1_WEEKS = BLOCKS_IN_1_DAYS * 7;
const BLOCKS_IN_2_WEEKS = BLOCKS_IN_1_WEEKS * 2;
const BLOCKS_IN_3_WEEKS = BLOCKS_IN_1_WEEKS * 3;
const BLOCKS_IN_4_MONTHS = BLOCKS_IN_1_DAYS * 30 * 4;
const ACC_REWARD_PRECISION = 1e12;

const toBn = (value: number | string) => ethers.BigNumber.from(value);

describe('ZUNStakingRewardDistributor tests', () => {
    async function deployFixture() {
        // Contracts are deployed using the first signer/account by default
        const [admin, user1, user2, user3, earlyExitReceiver] = await ethers.getSigners();

        // deploy test ERC20 token
        const ERC20TokenFactory = await ethers.getContractFactory('ERC20Token');
        const ZUN = (await ERC20TokenFactory.deploy(18)) as ERC20;
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
        depositAmount1: boolean | number | string,
        depositAmount2: boolean | number | string,
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

    it('add and deposit to the second pool for rewards', async () => {
        const fixture = await loadFixture(deployFixture);

        // deploy test ERC20 token
        const ERC20TokenFactory = await ethers.getContractFactory('ERC20Token');
        const POOLTOKEN = (await ERC20TokenFactory.deploy(18)) as ERC20;

        const depositAmount1 = 1000;
        const depositAmount2 = 2000;
        const { tid1 } = await depositByTwoUsersState(depositAmount1, depositAmount2, fixture);
        const { stakingRewardDistributor, REWARD, users } = fixture;

        // first distribution of REWARD
        const firstDistributionAmount1 = ethUnits('1000000');
        await REWARD.approve(stakingRewardDistributor.address, firstDistributionAmount1);
        await stakingRewardDistributor.distribute(REWARD.address, firstDistributionAmount1);

        await mine(BLOCKS_IN_1_DAYS);

        // check pending rewards for single pool
        const rewardTokenInfo1 = await stakingRewardDistributor.rewardTokenInfo(tid1);
        const reward1 = rewardTokenInfo1.distribution;
        const accRewardPerShare1 = reward1
            .mul(ACC_REWARD_PRECISION)
            .div(ethUnits(depositAmount1 + depositAmount2));
        const accruedRewards1 = ethUnits(depositAmount1)
            .mul(accRewardPerShare1)
            .div(ACC_REWARD_PRECISION);
        expect(await stakingRewardDistributor.getPendingReward(tid1, users[0].address)).to.eq(
            accruedRewards1
        );

        // deposit to the second pool
        const secondPoolDepositAmount = ethUnits(depositAmount1);
        await POOLTOKEN.transfer(users[0].address, secondPoolDepositAmount);
        await POOLTOKEN.connect(users[0]).approve(
            stakingRewardDistributor.address,
            secondPoolDepositAmount
        );
        await stakingRewardDistributor
            .connect(users[0])
            .deposit(secondPoolDepositAmount, users[0].address);
        expect(await stakingRewardDistributor.balanceOf(users[0].address)).to.eq(
            secondPoolDepositAmount.add(ethUnits(depositAmount1))
        );

        await mine(BLOCKS_IN_1_DAYS);

        // check pending rewards for two pools with 100 and 200 allocation points
        const rewardTokenInfo2 = await stakingRewardDistributor.rewardTokenInfo(tid1);
        const reward2 = rewardTokenInfo2.distribution
            .mul(BLOCKS_IN_1_DAYS)
            .mul(200)
            .div(100 + 200);
        const accRewardPerShare2 = reward2.mul(ACC_REWARD_PRECISION).div(secondPoolDepositAmount);
        const accruedRewards2 = secondPoolDepositAmount
            .mul(accRewardPerShare2)
            .div(ACC_REWARD_PRECISION);
        expect(await stakingRewardDistributor.getPendingReward(tid1, users[0].address)).to.eq(
            accruedRewards2
        );
    });

    it('should deposit ZUN tokens and get vlZUN', async () => {
        const { stakingRewardDistributor, ZUN, REWARD, REWARD2, admin, users, earlyExitReceiver } =
            await loadFixture(deployFixture);

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
        await stakingRewardDistributor
            .connect(users[0])
            .deposit(ethUnits('1000'), users[0].address);
        await stakingRewardDistributor
            .connect(users[1])
            .deposit(ethUnits('2000'), users[1].address);
        expect(await stakingRewardDistributor.balanceOf(users[0].address)).to.eq(ethUnits('1000'));
        expect(await stakingRewardDistributor.balanceOf(users[1].address)).to.eq(ethUnits('2000'));
    });

    it('reward tokens distribution', async () => {
        const fixture = await loadFixture(deployFixture);

        const depositAmount1 = 1000;
        const depositAmount2 = 2000;
        const { tid1 } = await depositByTwoUsersState(depositAmount1, depositAmount2, fixture);
        const { stakingRewardDistributor, REWARD } = fixture;

        // distribution
        const distributionAmount = ethUnits('100000000');
        await REWARD.approve(stakingRewardDistributor.address, distributionAmount);
        await stakingRewardDistributor.distribute(REWARD.address, distributionAmount);

        // check rewards info
        const currentBlock = await ethers.provider.getBlockNumber();
        const rewardTokenInfo = await stakingRewardDistributor.rewardTokenInfo(tid1);
        expect(rewardTokenInfo.distribution).to.be.eq(0);
    });

    it('second distribution at the same block as first', async () => {
        const fixture = await loadFixture(deployFixture);

        const depositAmount1 = 1000;
        const depositAmount2 = 2000;
        const { tid1 } = await depositByTwoUsersState(depositAmount1, depositAmount2, fixture);
        const { stakingRewardDistributor, REWARD } = fixture;

        await ethers.provider.send('evm_setAutomine', [false]);

        // distribution
        const distributionAmount = ethUnits('50000000');
        await REWARD.approve(stakingRewardDistributor.address, distributionAmount);
        await stakingRewardDistributor.distribute(REWARD.address, distributionAmount);

        await REWARD.approve(stakingRewardDistributor.address, distributionAmount);
        await stakingRewardDistributor.distribute(REWARD.address, distributionAmount);

        await mine();
        await ethers.provider.send('evm_setAutomine', [true]);

        // check rewards info
        const currentBlock = await ethers.provider.getBlockNumber();
        const rewardTokenInfo = await stakingRewardDistributor.rewardTokenInfo(tid1);
        expect(rewardTokenInfo.distribution).to.be.eq(
            distributionAmount.mul(2).div(BLOCKS_IN_2_WEEKS)
        );
    });

    it('second distribution after 1 week', async () => {
        const fixture = await loadFixture(deployFixture);

        const depositAmount1 = 1000;
        const depositAmount2 = 2000;
        const { tid1 } = await depositByTwoUsersState(depositAmount1, depositAmount2, fixture);
        const { stakingRewardDistributor, REWARD } = fixture;

        // first distribution
        const firstDistributionAmount = ethUnits('10000000');
        await REWARD.approve(stakingRewardDistributor.address, firstDistributionAmount);
        await stakingRewardDistributor.distribute(REWARD.address, firstDistributionAmount);
        const firstDistributionBlock = await ethers.provider.getBlockNumber();
        const firstRewardPerShare = firstDistributionAmount.div(BLOCKS_IN_2_WEEKS);

        await mine(BLOCKS_IN_1_WEEKS);

        // second distribution after a week
        const secondDistributionAmount = ethUnits('20000000');
        await REWARD.approve(stakingRewardDistributor.address, secondDistributionAmount);
        await stakingRewardDistributor.distribute(REWARD.address, secondDistributionAmount);
        const secondDistributionBlock = await ethers.provider.getBlockNumber();

        // check rewards info
        const rewardTokenInfo = await stakingRewardDistributor.rewardTokenInfo(tid1);
        const remainderBlocks =
            firstDistributionBlock + BLOCKS_IN_2_WEEKS - secondDistributionBlock;
        expect(rewardTokenInfo.distribution).to.be.eq(
            secondDistributionAmount
                .add(firstRewardPerShare.mul(remainderBlocks))
                .div(BLOCKS_IN_2_WEEKS)
        );
    });

    it('second distribution after 2 weeks - edge case', async () => {
        const fixture = await loadFixture(deployFixture);

        const depositAmount1 = 1000;
        const depositAmount2 = 2000;
        const { tid1 } = await depositByTwoUsersState(depositAmount1, depositAmount2, fixture);
        const { stakingRewardDistributor, REWARD } = fixture;

        // first distribution
        const firstDistributionAmount = ethUnits('10000000');
        await REWARD.approve(stakingRewardDistributor.address, firstDistributionAmount);
        await stakingRewardDistributor.distribute(REWARD.address, firstDistributionAmount);
        const firstDistributionBlock = await ethers.provider.getBlockNumber();
        const firstRewardPerShare = firstDistributionAmount.div(BLOCKS_IN_2_WEEKS);

        await mine(BLOCKS_IN_2_WEEKS);

        // second distribution after a week
        const secondDistributionAmount = ethUnits('20000000');
        await REWARD.approve(stakingRewardDistributor.address, secondDistributionAmount);
        await stakingRewardDistributor.distribute(REWARD.address, secondDistributionAmount);
        const secondDistributionBlock = await ethers.provider.getBlockNumber();

        // check rewards info
        const rewardTokenInfo = await stakingRewardDistributor.rewardTokenInfo(tid1);
        expect(rewardTokenInfo.distribution).to.be.eq(
            secondDistributionAmount.div(BLOCKS_IN_2_WEEKS)
        );
    });

    it('second distribution after 3 weeks', async () => {
        const fixture = await loadFixture(deployFixture);

        const depositAmount1 = 1000;
        const depositAmount2 = 2000;
        const { tid1 } = await depositByTwoUsersState(depositAmount1, depositAmount2, fixture);
        const { stakingRewardDistributor, REWARD } = fixture;

        // first distribution
        const firstDistributionAmount = ethUnits('10000000');
        await REWARD.approve(stakingRewardDistributor.address, firstDistributionAmount);
        await stakingRewardDistributor.distribute(REWARD.address, firstDistributionAmount);
        const firstDistributionBlock = await ethers.provider.getBlockNumber();
        const firstRewardPerShare = firstDistributionAmount.div(BLOCKS_IN_2_WEEKS);

        await mine(BLOCKS_IN_3_WEEKS);

        // second distribution after 3 weeks
        const secondDistributionAmount = ethUnits('20000000');
        await REWARD.approve(stakingRewardDistributor.address, secondDistributionAmount);
        await stakingRewardDistributor.distribute(REWARD.address, secondDistributionAmount);
        const secondDistributionBlock = await ethers.provider.getBlockNumber();

        // check rewards info
        const rewardTokenInfo = await stakingRewardDistributor.rewardTokenInfo(tid1);
        expect(rewardTokenInfo.distribution).to.be.eq(
            secondDistributionAmount.div(BLOCKS_IN_2_WEEKS)
        );
    });

    it('second distribution after 3 weeks for two rewards', async () => {
        const fixture = await loadFixture(deployFixture);

        const depositAmount1 = 1000;
        const depositAmount2 = 2000;
        const { tid1, tid2 } = await depositByTwoUsersState(
            depositAmount1,
            depositAmount2,
            fixture
        );
        const { stakingRewardDistributor, REWARD, REWARD2 } = fixture;

        // first distribution of REWARD
        const firstDistributionAmount1 = ethUnits('1000000');
        await REWARD.approve(stakingRewardDistributor.address, firstDistributionAmount1);
        await stakingRewardDistributor.distribute(REWARD.address, firstDistributionAmount1);
        const firstDistributionBlock1 = await ethers.provider.getBlockNumber();
        const firstRewardPerShare1 = firstDistributionAmount1.div(BLOCKS_IN_2_WEEKS);

        // do a delay in a day between distribution of REWARD and REWARD2
        await mine(BLOCKS_IN_1_DAYS);

        // first distribution of REWARD
        const firstDistributionAmount2 = ethUnits('1600000');
        await REWARD2.approve(stakingRewardDistributor.address, firstDistributionAmount2);
        await stakingRewardDistributor.distribute(REWARD2.address, firstDistributionAmount2);
        const firstDistributionBlock2 = await ethers.provider.getBlockNumber();
        const firstRewardPerShare2 = firstDistributionAmount2.div(BLOCKS_IN_2_WEEKS);

        await mine(BLOCKS_IN_3_WEEKS);

        // second distribution after 3 weeks of REWARD
        const secondDistributionAmount1 = ethUnits('2000000');
        await REWARD.approve(stakingRewardDistributor.address, secondDistributionAmount1);
        await stakingRewardDistributor.distribute(REWARD.address, secondDistributionAmount1);
        const secondDistributionBlock1 = await ethers.provider.getBlockNumber();

        // second distribution after 3 weeks of REWARD2
        const secondDistributionAmount2 = ethUnits('2500000');
        await REWARD2.approve(stakingRewardDistributor.address, secondDistributionAmount2);
        await stakingRewardDistributor.distribute(REWARD2.address, secondDistributionAmount2);
        const secondDistributionBlock2 = await ethers.provider.getBlockNumber();

        // check rewards info of REWARD
        const rewardTokenInfo1 = await stakingRewardDistributor.rewardTokenInfo(tid1);
        const secondRewardPerShare1 = secondDistributionAmount1.div(BLOCKS_IN_2_WEEKS);
        expect(rewardTokenInfo1.distribution).to.be.eq(secondRewardPerShare1);

        // check rewards info of REWARD2
        const rewardTokenInfo2 = await stakingRewardDistributor.rewardTokenInfo(tid2);
        const secondRewardPerShare2 = secondDistributionAmount2.div(BLOCKS_IN_2_WEEKS);
        expect(rewardTokenInfo2.distribution).to.be.eq(secondRewardPerShare2);
    });

    it('claim 1 day after distribution for one reward token', async () => {
        const fixture = await loadFixture(deployFixture);

        const depositAmount1 = 1000;
        const depositAmount2 = 2000;
        const { tid1 } = await depositByTwoUsersState(depositAmount1, depositAmount2, fixture);
        const { stakingRewardDistributor, REWARD, users } = fixture;

        // distribution
        const distributionAmount = ethUnits('100000000');
        await REWARD.approve(stakingRewardDistributor.address, distributionAmount);
        await stakingRewardDistributor.distribute(REWARD.address, distributionAmount);

        await mine(BLOCKS_IN_1_DAYS);

        // check balances before claim
        expect(await REWARD.balanceOf(users[0].address)).to.eq(0);

        // claim
        await stakingRewardDistributor.connect(users[0]).claim(users[0].address);

        // check balances after claim
        const accruedRewards = ethUnits(depositAmount1);
        expect(await REWARD.balanceOf(users[0].address)).to.eq(accruedRewards);
    });

    it('get pending rewards 2 weeks after distribution for one reward token', async () => {
        const fixture = await loadFixture(deployFixture);

        const depositAmount1 = 1000;
        const depositAmount2 = 2000;
        const { tid1 } = await depositByTwoUsersState(depositAmount1, depositAmount2, fixture);
        const { stakingRewardDistributor, REWARD, users } = fixture;

        // distribution
        const distributionAmount = ethUnits('100000000');
        await REWARD.approve(stakingRewardDistributor.address, distributionAmount);
        await stakingRewardDistributor.distribute(REWARD.address, distributionAmount);

        await mine(BLOCKS_IN_2_WEEKS);

        // get pending rewards
        const total = await stakingRewardDistributor.getPendingReward(tid1, users[0].address);

        // check pending rewards
        const rewardTokenInfo = await stakingRewardDistributor.rewardTokenInfo(tid1);
        const reward = ethUnits('100000000');
        const accRewardPerShare = reward
            .mul(ACC_REWARD_PRECISION)
            .div(ethUnits(depositAmount1 + depositAmount2));
        const accruedRewards = ethUnits(depositAmount1)
            .mul(accRewardPerShare)
            .div(ACC_REWARD_PRECISION);
        expect(total).to.eq(accruedRewards);
    });

    it('withdraw ZUN tokens immediately after deposit', async () => {
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
        await stakingRewardDistributor
            .connect(users[0])
            .approve(stakingRewardDistributor.address, withdrawAmount);
        await stakingRewardDistributor
            .connect(users[0])
            .withdraw(withdrawAmount, false, users[0].address);

        // check balances after withdraw - 15% of withdrawal has transfered to earlyExitReceiver
        expect(await stakingRewardDistributor.balanceOf(users[0].address)).to.eq(0);
        expect(await ZUN.balanceOf(users[0].address)).to.eq(withdrawAmount.div(100).mul(85));
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
    });

    it('withdraw ZUN tokens after 4 months', async () => {
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

        await mine(BLOCKS_IN_4_MONTHS);

        const withdrawAmount = ethUnits(depositAmount1);
        await stakingRewardDistributor
            .connect(users[0])
            .approve(stakingRewardDistributor.address, withdrawAmount);
        await stakingRewardDistributor
            .connect(users[0])
            .withdraw(withdrawAmount, false, users[0].address);

        // check balances after withdraw
        expect(await stakingRewardDistributor.balanceOf(users[0].address)).to.eq(0);
        expect(await ZUN.balanceOf(users[0].address)).to.eq(withdrawAmount);
        expect(await ZUN.balanceOf(earlyExitReceiver.address)).to.eq(0);
        expect(await ZUN.balanceOf(stakingRewardDistributor.address)).to.eq(
            ethUnits(depositAmount2)
        );
    });

    it('withdraw ZUN tokens immediately after deposit', async () => {
        const fixture = await loadFixture(deployFixture);

        const depositAmount1 = 1000;
        const depositAmount2 = 2000;
        const { tid1, tid2 } = await depositByTwoUsersState(
            depositAmount1,
            depositAmount2,
            fixture
        );
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
        await stakingRewardDistributor
            .connect(users[0])
            .approve(stakingRewardDistributor.address, withdrawAmount);
        await stakingRewardDistributor
            .connect(users[0])
            .withdraw(withdrawAmount, false, users[0].address);

        // check balances after withdraw - 15% of withdrawal has transfered to earlyExitReceiver
        expect(await stakingRewardDistributor.balanceOf(users[0].address)).to.eq(0);
        expect(await ZUN.balanceOf(users[0].address)).to.eq(withdrawAmount.div(100).mul(85));
        expect(await ZUN.balanceOf(earlyExitReceiver.address)).to.eq(
            withdrawAmount.div(100).mul(15)
        );
        expect(await ZUN.balanceOf(stakingRewardDistributor.address)).to.eq(
            ethUnits(depositAmount2)
        );

        expect(stakingRewardDistributor.balanceOf(users[0].address)).to.eq(0);
        const totalAmountsAfter = await stakingRewardDistributor.totalAmount();
        expect(totalAmountsAfter).to.eq(totalAmountsBefore.sub(ethUnits(depositAmount1)));
    });

    it('update staking balance by moving staking token', async () => {
        const fixture = await loadFixture(deployFixture);

        const depositAmount1 = 1000;
        const depositAmount2 = 2000;
        const { tid1, tid2 } = await depositByTwoUsersState(
            depositAmount1,
            depositAmount2,
            fixture
        );
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

        const transferAmount = ethUnits(depositAmount1);
        await stakingRewardDistributor.connect(users[0]).transfer(users[2].address, transferAmount);

        expect(await stakingRewardDistributor.totalAmount()).to.eq(totalAmountsBefore);
        expect(await stakingRewardDistributor.balanceOf(users[0].address)).to.eq(0);
        expect(await stakingRewardDistributor.balanceOf(users[0].address)).to.eq(0);
        expect(await stakingRewardDistributor.balanceOf(users[2].address)).to.eq(transferAmount);
        expect(await stakingRewardDistributor.balanceOf(users[2].address)).to.eq(transferAmount);

        await stakingRewardDistributor.connect(users[2]).transfer(users[1].address, transferAmount);

        expect(await stakingRewardDistributor.totalAmount()).to.eq(totalAmountsBefore);
        expect(await stakingRewardDistributor.balanceOf(users[2].address)).to.eq(0);
        expect(await stakingRewardDistributor.balanceOf(users[2].address)).to.eq(0);
        expect(await stakingRewardDistributor.balanceOf(users[1].address)).to.eq(
            transferAmount.add(ethUnits(depositAmount2))
        );
        expect(await stakingRewardDistributor.balanceOf(users[1].address)).to.eq(
            transferAmount.add(ethUnits(depositAmount2))
        );
    });

    it('withdraw stuck tokens', async () => {
        const { stakingRewardDistributor, users, admin } = await loadFixture(deployFixture);

        // deploy test ERC20 token
        const ERC20TokenFactory = await ethers.getContractFactory('ERC20Token');
        const WETH = (await ERC20TokenFactory.deploy(18)) as ERC20;
        const initalAdminBalance = await WETH.balanceOf(admin.address);

        // user has 100 WETH
        const amount = ethUnits(100);
        await WETH.transfer(users[0].address, amount);

        // check balances before
        const adminBalanceWETHBefore = await WETH.balanceOf(admin.address);
        expect(adminBalanceWETHBefore).to.eq(initalAdminBalance.sub(amount));

        await WETH.connect(users[0]).transfer(stakingRewardDistributor.address, amount);
        await stakingRewardDistributor.withdrawStuckToken(WETH.address, amount);

        // check balances after
        const adminBalanceWETHAfter = await WETH.balanceOf(admin.address);
        expect(adminBalanceWETHBefore).to.eq(adminBalanceWETHAfter.sub(amount));
        expect(adminBalanceWETHAfter).to.eq(initalAdminBalance);
    });

    it('withdraw all stuck tokens', async () => {
        const { stakingRewardDistributor, users, admin } = await loadFixture(deployFixture);

        // deploy test ERC20 token
        const ERC20TokenFactory = await ethers.getContractFactory('ERC20Token');
        const WETH = (await ERC20TokenFactory.deploy(18)) as ERC20;
        const initalAdminBalance = await WETH.balanceOf(admin.address);

        // user has 100 WETH
        const amount = ethUnits(100);
        await WETH.transfer(users[0].address, amount);

        // check balances before
        const adminBalanceWETHBefore = await WETH.balanceOf(admin.address);
        expect(adminBalanceWETHBefore).to.eq(initalAdminBalance.sub(amount));

        await WETH.connect(users[0]).transfer(stakingRewardDistributor.address, amount);
        await stakingRewardDistributor.withdrawStuckToken(
            WETH.address,
            ethers.constants.MaxUint256
        );

        // check balances after
        const adminBalanceWETHAfter = await WETH.balanceOf(admin.address);
        expect(adminBalanceWETHBefore).to.eq(adminBalanceWETHAfter.sub(amount));
        expect(adminBalanceWETHAfter).to.eq(initalAdminBalance);
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
        await stakingRewardDistributor.connect(users[2]).withdrawToken(ethUnits(withdrawAmount));

        // check balances after withdraw
        expect(await ZUN.balanceOf(users[2].address)).to.eq(ethUnits(withdrawAmount));
        expect(await stakingRewardDistributor.recapitalizedAmount()).to.eq(
            ethUnits(withdrawAmount)
        );
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
        await stakingRewardDistributor.connect(users[2]).returnToken(ethUnits(withdrawAmount));

        // check balances after return
        expect(await ZUN.balanceOf(users[2].address)).to.eq(ethUnits(0));
        expect(await stakingRewardDistributor.recapitalizedAmount()).to.eq(ethUnits(0));
    });

    it('withdraw ajusted amount of tokens because of recapitalization', async () => {
        const fixture = await loadFixture(deployFixture);

        const depositAmount1 = 1000;
        const depositAmount2 = 2000;
        await depositByTwoUsersState(depositAmount1, depositAmount2, fixture);
        const { stakingRewardDistributor, ZUN, users, earlyExitReceiver } = fixture;

        // add ZUN token as reward token
        const tid3 = 2;
        await stakingRewardDistributor.addRewardToken(ZUN.address);

        await mine(BLOCKS_IN_4_MONTHS);

        // add RECAPITALIZATION_ROLE to user[2]
        await stakingRewardDistributor.grantRole(
            await stakingRewardDistributor.RECAPITALIZATION_ROLE(),
            users[2].address
        );

        // check balances before withdraw pool tokens
        expect(await ZUN.balanceOf(users[2].address)).to.eq(0);
        expect(await stakingRewardDistributor.recapitalizedAmount()).to.eq(0);

        // withdraw pool tokens from staking reward distributor
        const recapitalizeAmount = ethUnits(2500);
        await stakingRewardDistributor.connect(users[2]).withdrawToken(recapitalizeAmount);

        // check balances after withdraw pool tokens
        expect(await ZUN.balanceOf(users[2].address)).to.eq(recapitalizeAmount);
        expect(await stakingRewardDistributor.recapitalizedAmount()).to.eq(recapitalizeAmount);

        // try to withdraw whole deposit back
        const withdrawAmount = ethUnits(depositAmount1);
        await stakingRewardDistributor
            .connect(users[0])
            .approve(stakingRewardDistributor.address, withdrawAmount);
        await stakingRewardDistributor
            .connect(users[0])
            .withdraw(withdrawAmount, false, users[0].address);

        // check balances after withdraw
        const totalAmount = ethUnits(depositAmount1 + depositAmount2);
        const adjustedAmount = withdrawAmount
            .mul(totalAmount.sub(recapitalizeAmount).mul(ethUnits(1)).div(totalAmount))
            .div(ethUnits(1));
        expect(await stakingRewardDistributor.balanceOf(users[0].address)).to.eq(0);
        expect(await ZUN.balanceOf(users[0].address)).to.eq(adjustedAmount);
        expect(await ZUN.balanceOf(users[2].address)).to.eq(recapitalizeAmount);
        expect(await ZUN.balanceOf(earlyExitReceiver.address)).to.eq(0);
        expect(await ZUN.balanceOf(stakingRewardDistributor.address)).to.eq(
            totalAmount.sub(adjustedAmount).sub(recapitalizeAmount)
        );
    });

    it('should distribute ZUN tokens', async () => {
        const {
            stakingRewardDistributor,
            ZUN,

            REWARD,
            REWARD2,
            admin,
            users,
            earlyExitReceiver,
        } = await loadFixture(deployFixture);

        expect(await ZUN.balanceOf(stakingRewardDistributor.address)).to.eq(ethUnits('0'));
        expect(await ZUN.balanceOf(admin.address)).to.eq(ethUnits('100000000'));
        expect(await ZUN.balanceOf(users[0].address)).to.eq(ethUnits('0'));
        expect(await stakingRewardDistributor.balanceOf(users[0].address)).to.eq(ethUnits('0'));

        const tid1 = 0;
        await stakingRewardDistributor.addRewardToken(REWARD.address);

        const tid2 = 1;
        await stakingRewardDistributor.addRewardToken(REWARD2.address);

        await stakingRewardDistributor.grantRole(
            await stakingRewardDistributor.DISTRIBUTOR_ROLE(),
            admin.address
        );

        await ZUN.transfer(users[0].address, ethUnits('1000'));
        await ZUN.connect(users[0]).approve(stakingRewardDistributor.address, ethUnits('1000'));
        await stakingRewardDistributor
            .connect(users[0])
            .deposit(ethUnits('1000'), users[0].address);
        expect(await stakingRewardDistributor.balanceOf(users[0].address)).to.eq(ethUnits('1000'));

        await REWARD.approve(stakingRewardDistributor.address, ethUnits('100000000'));
        await stakingRewardDistributor.distribute(REWARD.address, ethUnits('100000000'));

        await REWARD2.approve(stakingRewardDistributor.address, ethUnits('10000'));
        await stakingRewardDistributor.distribute(REWARD2.address, ethUnits('10000'));

        expect(await REWARD.balanceOf(stakingRewardDistributor.address)).to.eq(
            ethUnits('100000000')
        );
        expect(await REWARD2.balanceOf(stakingRewardDistributor.address)).to.eq(ethUnits('10000'));
        expect(await REWARD.balanceOf(users[0].address)).to.eq(ethUnits('0'));
        expect(await REWARD.balanceOf(users[1].address)).to.eq(ethUnits('0'));

        expect(await ZUN.balanceOf(stakingRewardDistributor.address)).to.eq(ethUnits('1000'));
        expect(await ZUN.balanceOf(admin.address)).to.eq(ethUnits('99999000'));
        expect(await ZUN.balanceOf(users[0].address)).to.eq(ethUnits('0'));

        // wait 1 week - 50_400 blocks
        await mine(50_400);

        await ZUN.transfer(users[1].address, ethUnits('1000'));
        await ZUN.connect(users[1]).approve(stakingRewardDistributor.address, ethUnits('1000'));
        await stakingRewardDistributor
            .connect(users[1])
            .deposit(ethUnits('1000'), users[1].address);
        expect(await stakingRewardDistributor.balanceOf(users[1].address)).to.eq(ethUnits('1000'));

        // wait 1 week - 50_400 blocks
        await mine(50_400);

        await stakingRewardDistributor.connect(users[1]).claim(users[1].address);
        await stakingRewardDistributor.connect(users[0]).claim(users[0].address);

        expect(await ZUN.balanceOf(stakingRewardDistributor.address)).to.eq(ethUnits('2000'));
        expect(await REWARD.balanceOf(users[0].address)).to.eq('75002480158730157000000000');
        expect(await REWARD2.balanceOf(users[0].address)).to.eq('7500148809523000000000');
        expect(await REWARD.balanceOf(users[1].address)).to.eq('24997519841269841000000000');
        expect(await REWARD2.balanceOf(users[1].address)).to.eq('2499851190476000000000');

        await stakingRewardDistributor
            .connect(users[0])
            .approve(stakingRewardDistributor.address, ethUnits('500'));
        await stakingRewardDistributor
            .connect(users[0])
            .withdraw(ethUnits('500'), false, users[0].address);

        expect(await ZUN.balanceOf(stakingRewardDistributor.address)).to.eq(ethUnits('1500'));
        expect(await ZUN.balanceOf(users[0].address)).to.eq(ethUnits('425'));
        expect(await ZUN.balanceOf(earlyExitReceiver.address)).to.eq(ethUnits('75'));

        await mine(50_400);

        await stakingRewardDistributor.connect(users[0]).claim(users[0].address);
        expect(await ZUN.balanceOf(stakingRewardDistributor.address)).to.eq(
            '1500000000000000000000'
        );
        expect(await REWARD.balanceOf(users[0].address)).to.eq('75002480158730157000000000');
        expect(await REWARD2.balanceOf(users[0].address)).to.eq('7500148809523000000000');
        expect(await REWARD.balanceOf(users[1].address)).to.eq('24997519841269841000000000');
        expect(await REWARD2.balanceOf(users[1].address)).to.eq('2499851190476000000000');
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

    it('After time without distribution -> user can get more reward than need to', async () => {
        const {
            stakingRewardDistributor,
            admin,
            REWARD,
            ZUN,
            users: [alice, bob],
        } = await loadFixture(deployFixture);

        // Admin action: Adding a new pool and a reward token to the staking reward distributor.
        await addRewardToken(stakingRewardDistributor, REWARD.address);

        // Alice deposits a specific amount of tokens into the protocol.
        const depositAmount = ethUnits(100);
        await ZUN.transfer(alice.address, depositAmount);
        await depositToPool(stakingRewardDistributor, ZUN, alice, depositAmount);

        await mine(BLOCKS_IN_2_WEEKS);

        // Distributor: distributes reward tokens for the first time.
        const distributionAmount = ethUnits(100);
        console.log('Distributor: distributes reward tokens:', distributionAmount.toString());
        console.log('========');
        await distributeRewardTokens(stakingRewardDistributor, REWARD, distributionAmount, admin);

        // Alice claims her rewards, expected to be the total balance of the contract.
        await stakingRewardDistributor.connect(alice).claim(alice.address);

        // Bob enters the system by depositing an amount equal to Alice's initial deposit.
        await ZUN.transfer(bob.address, depositAmount);
        await depositToPool(stakingRewardDistributor, ZUN, bob, depositAmount);

        // Another round of reward distribution by distributor.
        await distributeRewardTokens(stakingRewardDistributor, REWARD, distributionAmount, admin);

        // Bob claims his reward immediately after the distribution.
        await stakingRewardDistributor.connect(bob).claim(bob.address);
        const bobBalanceFirstClaim = await REWARD.balanceOf(bob.address);
        console.log("Bob's reward claimed (first reward):", bobBalanceFirstClaim.toString());

        // Bob waits an additional period and claims his rewards again.
        await mine(BLOCKS_IN_2_WEEKS);
        await stakingRewardDistributor.connect(bob).claim(bob.address);
        const bobBalanceSecondClaim = await REWARD.balanceOf(bob.address);
        console.log(
            "Bob's reward claimed (second reward):",
            bobBalanceSecondClaim.sub(bobBalanceFirstClaim).toString()
        );
        console.log('Total balance of Bob:', bobBalanceSecondClaim.toString());

        console.log('========');

        const aliceBalanceFirstClaim = await REWARD.balanceOf(alice.address);
        console.log("Alice's balance before her second claim:", aliceBalanceFirstClaim.toString());

        // Alice claims her rewards for the second time.
        await stakingRewardDistributor.connect(alice).claim(alice.address);
        const aliceBalanceSecondClaim = await REWARD.balanceOf(alice.address);
        console.log(
            "Alice's reward claimed (second reward):",
            aliceBalanceSecondClaim.sub(aliceBalanceFirstClaim).toString()
        );
        console.log('Total balance of Alice:', aliceBalanceSecondClaim.toString());

        console.log('========');

        // Although Alice participated in two distributions and Bob in one, their balance is not significantly different.
        // Bob was able to take the tokens that belonged to Alice.
        console.log('Total distribution: ', distributionAmount.mul(2).toString());
        console.log(
            'Balances diff: ',
            aliceBalanceSecondClaim.sub(bobBalanceSecondClaim).toString()
        );
    });

    it('User rewards should not be zeroed on transfer 0 amount of VL token', async function () {
        const {
            stakingRewardDistributor,
            admin,
            users: [alice, bob],
            ZUN,

            REWARD,
        } = await loadFixture(deployFixture);

        const depositAmount = ethUnits(100);
        await ZUN.transfer(bob.address, depositAmount);
        await ZUN.connect(bob).approve(stakingRewardDistributor.address, depositAmount);
        await stakingRewardDistributor.connect(bob).deposit(depositAmount, bob.address);
        const distributeAmount = ethUnits(100);
        await stakingRewardDistributor.addRewardToken(REWARD.address);
        const distributorRole = await stakingRewardDistributor.DISTRIBUTOR_ROLE();
        await stakingRewardDistributor.grantRole(distributorRole, admin.address);
        await REWARD.approve(stakingRewardDistributor.address, distributeAmount);
        await stakingRewardDistributor.distribute(REWARD.address, distributeAmount);
        await mine(BLOCKS_IN_2_WEEKS);

        const pendingRewardBefore = await stakingRewardDistributor.getPendingReward(0, bob.address);
        await stakingRewardDistributor.connect(alice).transferFrom(bob.address, bob.address, 0);
        expect((await stakingRewardDistributor.getPendingReward(0, bob.address)).toString()).to.eq(
            pendingRewardBefore.toString()
        );

        await stakingRewardDistributor.connect(bob).claim(bob.address);
        expect(await REWARD.balanceOf(bob.address)).to.eq('100000000000000000000');
    });

    // it('Incorrect calculations of rewards (reward amount per block greater than expected)', async () => {
    //     // Initial setup: Load fixtures and define participants
    //     const {
    //         stakingRewardDistributor,
    //         admin,
    //         REWARD,
    //         ZUN,
    //
    //         users: [alice, bob],
    //     } = await loadFixture(deployFixture);
    //     const allocationPointsForPool = 100;
    //     const depositAmount = ethUnits(100);
    //     const distributionAmount = ethUnits(100);
    //     const period = await stakingRewardDistributor.BLOCKS_IN_2_WEEKS();
    //     // Admin adds a new pool and reward token to the staking reward distributor
    //
    //     await stakingRewardDistributor.addPool(allocationPointsForPool, ZUN.address, vlZUN.address);
    //     await stakingRewardDistributor.addRewardToken(REWARD.address);
    //     // Transferring tokens to Alice and Bob for deposit
    //     await ZUN.transfer(alice.address, depositAmount);
    //     await ZUN.transfer(bob.address, depositAmount);
    //     // Alice and Bob approve and deposit their tokens
    //     await ZUN.connect(alice).approve(stakingRewardDistributor.address, depositAmount);
    //     await stakingRewardDistributor.connect(alice).deposit(0, depositAmount, alice.address);
    //     await ZUN.connect(bob).approve(stakingRewardDistributor.address, depositAmount);
    //     await stakingRewardDistributor.connect(bob).deposit(0, depositAmount, bob.address);
    //     const distributionTimes = 5;
    //     console.log(
    //         'Total tokens to be distributed: ',
    //         distributionAmount.mul(distributionTimes).toString()
    //     );
    //     console.log('Starting distribution loop');
    //     const distributorRole = await stakingRewardDistributor.DISTRIBUTOR_ROLE();
    //     await stakingRewardDistributor.grantRole(distributorRole, admin.address);
    //     // Distribution loop
    //     for (let i = 0; i < distributionTimes; i++) {
    //         await REWARD.approve(stakingRewardDistributor.address, distributionAmount);
    //         await stakingRewardDistributor.distribute(0, distributionAmount);
    //         await mine(period);
    //         // Calculating pending rewards and checking for balance discrepancies
    //         const alicePendingReward = await stakingRewardDistributor.getPendingReward(
    //             0,
    //             0,
    //             alice.address
    //         );
    //         const bobPendingReward = await stakingRewardDistributor.getPendingReward(
    //             0,
    //
    //             0,
    //             bob.address
    //         );
    //         const debtToUsers = alicePendingReward.add(bobPendingReward);
    //         const contractBalance = await REWARD.balanceOf(stakingRewardDistributor.address);
    //         if (contractBalance.sub(debtToUsers).lt(0)) {
    //             console.log('Insufficient balance at distribution index: ', i);
    //             console.log('Pending rewards for Alice: ', alicePendingReward.toString());
    //             console.log('Pending rewards for Bob: ', bobPendingReward.toString());
    //             console.log('Current contract balance: ', contractBalance.toString());
    //             console.log(
    //                 'Delta (contract balance - total debt): ',
    //                 contractBalance.sub(debtToUsers).toString()
    //             );
    //         }
    //     }
    //     const { rewardPerBlock } = await stakingRewardDistributor.rewardTokenInfo(0);
    //     // Calculating pending rewards for Alice and Bob
    //     const alicePendingRewards = await stakingRewardDistributor.getPendingReward(
    //         0,
    //         0,
    //         alice.address
    //     );
    //     const aliceBalanceBefore = await REWARD.balanceOf(alice.address);
    //     const bobPendingRewards = await stakingRewardDistributor.getPendingReward(
    //         0,
    //         0,
    //         bob.address
    //     );
    //     const bobBalanceBefore = await REWARD.balanceOf(bob.address);
    //     console.log(
    //         'Expected distribution amount: ',
    //         (await REWARD.balanceOf(stakingRewardDistributor.address)).toString()
    //     );
    //     // Alice claims her rewards
    //     await stakingRewardDistributor.connect(alice).claim(0);
    //     const aliceBalanceAfter = await REWARD.balanceOf(alice.address);
    //     const aliceBalanceDelta = aliceBalanceAfter.sub(aliceBalanceBefore);
    //
    //     console.log('Amount claimed by Alice: ', aliceBalanceDelta.toString());
    //     console.log(
    //         'Underpayment amount for Alice: ',
    //         aliceBalanceDelta.sub(alicePendingRewards).toString()
    //     );
    //     // Bob claims his rewards
    //     await stakingRewardDistributor.connect(bob).claim(0);
    //     const bobBalanceAfter = await REWARD.balanceOf(bob.address);
    //     const bobBalanceDelta = bobBalanceAfter.sub(bobBalanceBefore);
    //     const tokensUnderpaidForBob = bobBalanceDelta.sub(bobPendingRewards).abs();
    //     console.log('Amount claimed by Bob: ', bobBalanceDelta.toString());
    //     console.log('Underpayment amount for Bob: ', tokensUnderpaidForBob.toString());
    //     // Calculation of underpayment based on iterations and blocks
    //     const howMuchBlocksWereUnderpaidForBob = 4 + 4; // Additional blocks calculated for Alice affecting Bob's rewards
    //     const bobUnderpaidBlocksTimesBlockPrice = rewardPerBlock.mul(
    //         howMuchBlocksWereUnderpaidForBob
    //     );
    //     // Assertion to check if Bob's underpayment matches the expected value
    //     expect(tokensUnderpaidForBob).approximately(
    //         bobUnderpaidBlocksTimesBlockPrice,
    //         toBn(10).pow(10)
    //     );
    // });

    it('New distribution will generate incorrect amount of rewards when the previous rewardPerBlock was 0', async function () {
        // Load fixtures and setup initial variables
        const {
            stakingRewardDistributor,
            admin,
            users: [alice, bob],

            ZUN,

            REWARD,
        } = await loadFixture(deployFixture);

        // Define and distribute deposit amounts to Alice and Bob
        const depositAmount = ethUnits(100);
        await ZUN.transfer(alice.address, depositAmount);
        await ZUN.transfer(bob.address, depositAmount);
        // Alice deposits to the pool
        await ZUN.connect(alice).approve(stakingRewardDistributor.address, depositAmount);
        await stakingRewardDistributor.connect(alice).deposit(depositAmount, alice.address);
        // Bob deposits to the pool
        await ZUN.connect(bob).approve(stakingRewardDistributor.address, depositAmount);
        await stakingRewardDistributor.connect(bob).deposit(depositAmount, bob.address);
        // Initial reward token distribution
        const distributeAmount = ethUnits(100);
        await stakingRewardDistributor.addRewardToken(REWARD.address);
        const distributorRole = await stakingRewardDistributor.DISTRIBUTOR_ROLE();
        await stakingRewardDistributor.grantRole(distributorRole, admin.address);
        await REWARD.connect(admin).approve(stakingRewardDistributor.address, distributeAmount);
        await stakingRewardDistributor.connect(admin).distribute(0, distributeAmount);
        // Pass two weeks and let users claim their rewards
        await mine(BLOCKS_IN_2_WEEKS);
        await stakingRewardDistributor.connect(alice).claim(alice.address);
        await stakingRewardDistributor.connect(bob).claim(bob.address);
        // New distribution started with 0 amount
        await stakingRewardDistributor.connect(admin).distribute(REWARD.address, 0);
        await mine(BLOCKS_IN_1_WEEKS);
        // After some blocks, the pool hasn't been updated as the rewardsPerBlock is 0
        console.log(
            "Alice's claimable amount during 0 token distribution: ",
            (await stakingRewardDistributor.getPendingReward(0, alice.address)).toString()
        );
        // New distribution with a non-zero amount
        await REWARD.connect(admin).approve(stakingRewardDistributor.address, distributeAmount);
        await stakingRewardDistributor.connect(admin).distribute(0, distributeAmount);
        console.log(
            "Alice's claimable amount immediately after new distribution: ",
            (await stakingRewardDistributor.getPendingReward(0, alice.address)).toString()
        );
        console.log('Full period of 2 weeks has passed');
        // Pass two more weeks
        await mine(BLOCKS_IN_2_WEEKS);
        console.log(
            "Alice's claimable amount after 2 weeks of new distribution: ",
            (await stakingRewardDistributor.getPendingReward(0, alice.address)).toString()
        );
        // Calculate pending rewards for Alice and Bob
        const bobPendingRewards = await stakingRewardDistributor.getPendingReward(0, bob.address);
        const alicePendingRewards = await stakingRewardDistributor.getPendingReward(
            0,
            alice.address
        );
        console.log(
            'Total amount REWARD token that the contract can distribute: ',
            (await REWARD.balanceOf(stakingRewardDistributor.address)).toString()
        );
        console.log(
            "Contract's total debt (Alice's + Bob's rewards): ",
            alicePendingRewards.add(bobPendingRewards).toString()
        );

        // Whoever claims first will receive a large part of the sum, while the other user will receive only the remainder.
    });
});