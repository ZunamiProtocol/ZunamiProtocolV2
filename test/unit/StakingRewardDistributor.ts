import { ethers, upgrades } from 'hardhat';
import { loadFixture, mine } from '@nomicfoundation/hardhat-network-helpers';
import { parseUnits } from 'ethers/lib/utils';
import { expect } from 'chai';

import { ERC20, StakingRewardDistributor } from '../../typechain-types';
import { BigNumberish } from 'ethers';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';

const ethUnits = (amount: number | string) => parseUnits(amount.toString(), 'ether');

const toBn = (value: number | string) => ethers.BigNumber.from(value);

const BLOCKS_IN_1_DAYS = (24 * 60 * 60) / 12;
const BLOCKS_IN_1_WEEKS = BLOCKS_IN_1_DAYS * 7;
const BLOCKS_IN_2_WEEKS = BLOCKS_IN_1_WEEKS * 2;
const BLOCKS_IN_3_WEEKS = BLOCKS_IN_1_WEEKS * 3;

const zeroAddress = ethers.constants.AddressZero;

describe('StakingRewardDistributor tests', () => {
    async function deployFixture() {
        // Contracts are deployed using the first signer/account by default
        const [admin, user1, user2, user3, earlyExitReceiver] = await ethers.getSigners();

        // deploy test ERC20 token
        const ERC20TokenFactory = await ethers.getContractFactory('ERC20Token');
        const POOLTOKEN = (await ERC20TokenFactory.deploy(18)) as ERC20;
        const REWARD = (await ERC20TokenFactory.deploy(18)) as ERC20;
        const REWARD2 = (await ERC20TokenFactory.deploy(18)) as ERC20;

        // deploy distributor contract
        const StakingRewardDistributorFactory = await ethers.getContractFactory(
            'StakingRewardDistributor'
        );

        await expect(
            upgrades.deployProxy(StakingRewardDistributorFactory, [
                zeroAddress,
                'LP',
                'LP',
                admin.address,
            ])
        ).to.be.revertedWithCustomError(StakingRewardDistributorFactory, 'ZeroAddress');

        await expect(
            upgrades.deployProxy(StakingRewardDistributorFactory, [
                POOLTOKEN.address,
                'LP',
                'LP',
                zeroAddress,
            ])
        ).to.be.revertedWithCustomError(StakingRewardDistributorFactory, 'ZeroAddress');

        const instance = await upgrades.deployProxy(
            StakingRewardDistributorFactory,
            [POOLTOKEN.address, 'LP', 'LP', admin.address],
            {
                kind: 'uups',
            }
        );
        await instance.deployed();

        const stakingRewardDistributor = instance as StakingRewardDistributor;

        return {
            stakingRewardDistributor,
            POOLTOKEN,
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
        const { stakingRewardDistributor, POOLTOKEN, REWARD, REWARD2, admin, users } = fixture;

        // start balances
        expect(await POOLTOKEN.balanceOf(stakingRewardDistributor.address)).to.eq(ethUnits('0'));
        expect(await POOLTOKEN.balanceOf(admin.address)).to.eq(ethUnits('100000000'));
        expect(await POOLTOKEN.balanceOf(users[0].address)).to.eq(ethUnits('0'));
        expect(await POOLTOKEN.balanceOf(users[1].address)).to.eq(ethUnits('0'));
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

        // users deposit POOLTOKEN tokens
        if (depositAmount1) {
            const amount1 = ethUnits(depositAmount1);
            await POOLTOKEN.transfer(users[0].address, amount1);
            await POOLTOKEN.connect(users[0]).approve(stakingRewardDistributor.address, amount1);
            await stakingRewardDistributor.connect(users[0]).deposit(amount1, users[0].address);
            expect(await stakingRewardDistributor.balanceOf(users[0].address)).to.eq(amount1);
        }
        if (depositAmount2) {
            const amount2 = ethUnits(depositAmount2);
            await POOLTOKEN.transfer(users[1].address, amount2);
            await POOLTOKEN.connect(users[1]).approve(stakingRewardDistributor.address, amount2);
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

    it('add and deposit to pool for rewards', async () => {
        const fixture = await loadFixture(deployFixture);

        const depositAmount1 = 1000;
        const depositAmount2 = 2000;
        const { tid1, tid2 } = await depositByTwoUsersState(
            depositAmount1,
            depositAmount2,
            fixture
        );
        const { stakingRewardDistributor, POOLTOKEN, REWARD, users } = fixture;

        // first distribution of REWARD
        const firstDistributionAmount1 = ethUnits('1000000');
        await REWARD.approve(stakingRewardDistributor.address, firstDistributionAmount1);
        await stakingRewardDistributor.distribute(REWARD.address, firstDistributionAmount1);

        await mine(BLOCKS_IN_1_DAYS);

        const rewardTokenInfo1 = await stakingRewardDistributor.rewardTokenInfo(tid1);
        const accruedRewards1 = rewardTokenInfo1.distribution.mul(depositAmount1);
        expect(await stakingRewardDistributor.getPendingReward(tid1, users[0].address)).to.eq(
            accruedRewards1
        );
        const accruedRewards2 = rewardTokenInfo1.distribution.mul(depositAmount2);
        expect(await stakingRewardDistributor.getPendingReward(tid1, users[1].address)).to.eq(
            accruedRewards2
        );
        expect(await stakingRewardDistributor.getPendingReward(tid2, users[0].address)).to.eq(0);
        expect(await stakingRewardDistributor.getPendingReward(tid2, users[1].address)).to.eq(0);

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

        expect(await stakingRewardDistributor.balanceOf(users[0].address)).to.be.eq(
            ethUnits(depositAmount1 * 2)
        );
        expect(await stakingRewardDistributor.getPendingReward(tid1, users[0].address)).to.be.eq(
            accruedRewards1
        );
        expect(await stakingRewardDistributor.getPendingReward(tid1, users[1].address)).to.be.eq(
            accruedRewards2
        );
    });

    it('reward tokens distribution', async () => {
        const fixture = await loadFixture(deployFixture);

        const depositAmount1 = 1000;
        const depositAmount2 = 3000;
        const { tid1 } = await depositByTwoUsersState(depositAmount1, depositAmount2, fixture);
        const { stakingRewardDistributor, REWARD } = fixture;

        // distribution
        const distributionAmount = 1000000;
        await REWARD.approve(stakingRewardDistributor.address, ethUnits(distributionAmount));
        await stakingRewardDistributor.distribute(REWARD.address, ethUnits(distributionAmount));

        // check rewards info
        const rewardTokenInfo = await stakingRewardDistributor.rewardTokenInfo(tid1);

        const distribution = ethUnits(distributionAmount / (depositAmount1 + depositAmount2));
        expect(rewardTokenInfo.distribution).to.be.eq(distribution);
    });

    it('second distribution at the same block as first', async () => {
        const fixture = await loadFixture(deployFixture);

        const depositAmount1 = 1000;
        const depositAmount2 = 3000;
        const { tid1 } = await depositByTwoUsersState(depositAmount1, depositAmount2, fixture);
        const { stakingRewardDistributor, REWARD } = fixture;

        await ethers.provider.send('evm_setAutomine', [false]);

        // distribution
        const distributionAmount = 500000;
        await REWARD.approve(stakingRewardDistributor.address, ethUnits(distributionAmount));
        await stakingRewardDistributor.distribute(REWARD.address, ethUnits(distributionAmount));

        await REWARD.approve(stakingRewardDistributor.address, ethUnits(distributionAmount));
        await stakingRewardDistributor.distribute(REWARD.address, ethUnits(distributionAmount));

        await mine();
        await ethers.provider.send('evm_setAutomine', [true]);

        const rewardTokenInfo = await stakingRewardDistributor.rewardTokenInfo(tid1);
        const distribution = ethUnits((distributionAmount * 2) / (depositAmount1 + depositAmount2));
        expect(rewardTokenInfo.distribution).to.be.eq(distribution);
    });

    it('second distribution after 1 week', async () => {
        const fixture = await loadFixture(deployFixture);

        const depositAmount1 = 1000;
        const depositAmount2 = 3000;
        const { tid1 } = await depositByTwoUsersState(depositAmount1, depositAmount2, fixture);
        const { stakingRewardDistributor, REWARD } = fixture;

        // first distribution
        const firstDistributionAmount = ethUnits('10000000');
        await REWARD.approve(stakingRewardDistributor.address, firstDistributionAmount);
        await stakingRewardDistributor.distribute(REWARD.address, firstDistributionAmount);

        await mine(BLOCKS_IN_1_WEEKS);

        // second distribution after a week
        const secondDistributionAmount = ethUnits('30000000');
        await REWARD.approve(stakingRewardDistributor.address, secondDistributionAmount);
        await stakingRewardDistributor.distribute(REWARD.address, secondDistributionAmount);

        // check rewards info
        const distribution = firstDistributionAmount
            .add(secondDistributionAmount)
            .div(depositAmount1 + depositAmount2);
        const rewardTokenInfo = await stakingRewardDistributor.rewardTokenInfo(tid1);
        expect(rewardTokenInfo.distribution).to.be.eq(distribution);
    });

    it('second distribution after 2 weeks - edge case', async () => {
        const fixture = await loadFixture(deployFixture);

        const depositAmount1 = 1000;
        const depositAmount2 = 3000;
        const { tid1 } = await depositByTwoUsersState(depositAmount1, depositAmount2, fixture);
        const { stakingRewardDistributor, REWARD } = fixture;

        // first distribution
        const firstDistributionAmount = ethUnits('10000000');
        await REWARD.approve(stakingRewardDistributor.address, firstDistributionAmount);
        await stakingRewardDistributor.distribute(REWARD.address, firstDistributionAmount);

        await mine(BLOCKS_IN_2_WEEKS);

        // second distribution after a week
        const secondDistributionAmount = ethUnits('30000000');
        await REWARD.approve(stakingRewardDistributor.address, secondDistributionAmount);
        await stakingRewardDistributor.distribute(REWARD.address, secondDistributionAmount);

        // check rewards info
        const distribution = firstDistributionAmount
            .add(secondDistributionAmount)
            .div(depositAmount1 + depositAmount2);
        const rewardTokenInfo = await stakingRewardDistributor.rewardTokenInfo(tid1);
        expect(rewardTokenInfo.distribution).to.be.eq(distribution);
    });

    it('second distribution after 3 weeks', async () => {
        const fixture = await loadFixture(deployFixture);

        const depositAmount1 = 1000;
        const depositAmount2 = 3000;
        const { tid1 } = await depositByTwoUsersState(depositAmount1, depositAmount2, fixture);
        const { stakingRewardDistributor, REWARD } = fixture;

        // first distribution
        const firstDistributionAmount = ethUnits('10000000');
        await REWARD.approve(stakingRewardDistributor.address, firstDistributionAmount);
        await stakingRewardDistributor.distribute(REWARD.address, firstDistributionAmount);

        await mine(BLOCKS_IN_3_WEEKS);

        // second distribution after 3 weeks
        const secondDistributionAmount = ethUnits('10000000');
        await REWARD.approve(stakingRewardDistributor.address, secondDistributionAmount);
        await stakingRewardDistributor.distribute(REWARD.address, secondDistributionAmount);

        // check rewards info
        const distribution = firstDistributionAmount
            .add(secondDistributionAmount)
            .div(depositAmount1 + depositAmount2);
        const rewardTokenInfo = await stakingRewardDistributor.rewardTokenInfo(tid1);
        expect(rewardTokenInfo.distribution).to.be.eq(distribution);
    });

    it('second distribution after 3 weeks for two rewards', async () => {
        const fixture = await loadFixture(deployFixture);

        const depositAmount1 = 1000;
        const depositAmount2 = 3000;
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

        // do a delay in a day between distribution of REWARD and REWARD2
        await mine(BLOCKS_IN_1_DAYS);

        // first distribution of REWARD
        const firstDistributionAmount2 = ethUnits('2000000');
        await REWARD2.approve(stakingRewardDistributor.address, firstDistributionAmount2);
        await stakingRewardDistributor.distribute(REWARD2.address, firstDistributionAmount2);

        await mine(BLOCKS_IN_3_WEEKS);

        // second distribution after 3 weeks of REWARD
        const secondDistributionAmount1 = ethUnits('1000000');
        await REWARD.approve(stakingRewardDistributor.address, secondDistributionAmount1);
        await stakingRewardDistributor.distribute(REWARD.address, secondDistributionAmount1);

        // second distribution after 3 weeks of REWARD2
        const secondDistributionAmount2 = ethUnits('2000000');
        await REWARD2.approve(stakingRewardDistributor.address, secondDistributionAmount2);
        await stakingRewardDistributor.distribute(REWARD2.address, secondDistributionAmount2);

        // check rewards info of REWARD

        let distribution = firstDistributionAmount1
            .add(secondDistributionAmount1)
            .div(depositAmount1 + depositAmount2);
        const rewardTokenInfo1 = await stakingRewardDistributor.rewardTokenInfo(tid1);
        expect(rewardTokenInfo1.distribution).to.be.eq(distribution);

        // check rewards info of REWARD2
        distribution = firstDistributionAmount2
            .add(secondDistributionAmount2)
            .div(depositAmount1 + depositAmount2);
        const rewardTokenInfo2 = await stakingRewardDistributor.rewardTokenInfo(tid2);
        expect(rewardTokenInfo2.distribution).to.be.eq(distribution);
    });

    it('claim 1 day after distribution for one reward token', async () => {
        const fixture = await loadFixture(deployFixture);

        const depositAmount1 = 1000;
        const depositAmount2 = 3000;
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
        const rewardTokenInfo1 = await stakingRewardDistributor.rewardTokenInfo(tid1);
        const accruedRewards = rewardTokenInfo1.distribution.mul(depositAmount1);
        expect(await REWARD.balanceOf(users[0].address)).to.eq(accruedRewards);
    });

    it('claim 1 day after distribution for one reward token for another receiver', async () => {
        const fixture = await loadFixture(deployFixture);

        const depositAmount1 = 1000;
        const depositAmount2 = 3000;
        const { tid1 } = await depositByTwoUsersState(depositAmount1, depositAmount2, fixture);
        const { stakingRewardDistributor, REWARD, users } = fixture;

        // distribution
        const distributionAmount = ethUnits('100000000');
        await REWARD.approve(stakingRewardDistributor.address, distributionAmount);
        await stakingRewardDistributor.distribute(REWARD.address, distributionAmount);

        await stakingRewardDistributor.connect(users[0]).setRewardsReceiver(users[1].address);

        await mine(BLOCKS_IN_1_DAYS);

        // check balances before claim
        expect(await REWARD.balanceOf(users[0].address)).to.eq(0);
        // claim
        await stakingRewardDistributor.connect(users[0]).claim(zeroAddress);

        // check balances after claim
        const rewardTokenInfo1 = await stakingRewardDistributor.rewardTokenInfo(tid1);
        const accruedRewards = rewardTokenInfo1.distribution.mul(depositAmount1);
        expect(await REWARD.balanceOf(users[1].address)).to.eq(accruedRewards);
    });

    it('get pending rewards 2 weeks after distribution for one reward token', async () => {
        const fixture = await loadFixture(deployFixture);

        const depositAmount1 = 1000;
        const depositAmount2 = 3000;
        const { tid1 } = await depositByTwoUsersState(depositAmount1, depositAmount2, fixture);
        const { stakingRewardDistributor, REWARD, users } = fixture;

        // distribution
        const distributionAmount = ethUnits('100000000');
        await REWARD.approve(stakingRewardDistributor.address, distributionAmount);
        await stakingRewardDistributor.distribute(REWARD.address, distributionAmount);

        await mine(BLOCKS_IN_2_WEEKS);
        const total = await stakingRewardDistributor.getPendingReward(tid1, users[0].address);

        const distribution = distributionAmount.div(depositAmount1 + depositAmount2);
        const rewardTokenInfo = await stakingRewardDistributor.rewardTokenInfo(tid1);
        expect(rewardTokenInfo.distribution).to.be.eq(distribution);
        expect(total).to.be.eq(distribution.mul(depositAmount1));
    });

    it('withdraw token immediately after deposit', async () => {
        const fixture = await loadFixture(deployFixture);

        const depositAmount1 = 1000;
        const depositAmount2 = 3000;
        await depositByTwoUsersState(depositAmount1, depositAmount2, fixture);
        const { stakingRewardDistributor, POOLTOKEN, users } = fixture;

        // check balances before withdraw
        expect(await stakingRewardDistributor.balanceOf(users[0].address)).to.eq(
            ethUnits(depositAmount1)
        );
        expect(await POOLTOKEN.balanceOf(users[0].address)).to.eq(ethUnits(0));
        expect(await POOLTOKEN.balanceOf(stakingRewardDistributor.address)).to.eq(
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

        // check balances after withdraw
        expect(await stakingRewardDistributor.balanceOf(users[0].address)).to.eq(0);
        expect(await POOLTOKEN.balanceOf(users[0].address)).to.eq(withdrawAmount);
        expect(await POOLTOKEN.balanceOf(stakingRewardDistributor.address)).to.eq(
            ethUnits(depositAmount2)
        );

        // check pool amount
        expect(await stakingRewardDistributor.balanceOf(users[0].address)).to.eq(0);
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
        const { stakingRewardDistributor, POOLTOKEN, users } = fixture;

        // check balances before withdraw
        expect(await stakingRewardDistributor.balanceOf(users[0].address)).to.eq(
            ethUnits(depositAmount1)
        );
        expect(await POOLTOKEN.balanceOf(users[0].address)).to.eq(ethUnits(0));
        expect(await POOLTOKEN.balanceOf(stakingRewardDistributor.address)).to.eq(
            ethUnits(depositAmount1 + depositAmount2)
        );
        const totalAmountsBefore = await stakingRewardDistributor.totalAmount();

        const transferAmount = ethUnits(depositAmount1);
        await stakingRewardDistributor.connect(users[0]).transfer(users[2].address, transferAmount);

        expect(await stakingRewardDistributor.totalAmount()).to.eq(totalAmountsBefore);
        expect(await stakingRewardDistributor.balanceOf(users[0].address)).to.eq(0);
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

    it('should distribute reward tokens', async () => {
        const fixture = await loadFixture(deployFixture);

        const depositAmount1 = 1000;
        const depositAmount2 = 2000;
        const { tid1, tid2 } = await depositByTwoUsersState(
            depositAmount1,
            depositAmount2,
            fixture
        );
        const { stakingRewardDistributor, POOLTOKEN, REWARD, REWARD2, users, earlyExitReceiver } =
            fixture;

        await POOLTOKEN.transfer(users[0].address, ethUnits(depositAmount1));
        await POOLTOKEN.connect(users[0]).approve(
            stakingRewardDistributor.address,
            ethUnits(depositAmount1)
        );
        await stakingRewardDistributor
            .connect(users[0])
            .deposit(ethUnits(depositAmount1), users[0].address);
        expect(await stakingRewardDistributor.balanceOf(users[0].address)).to.eq(
            ethUnits(depositAmount1 * 2)
        );

        const distributionAmount = ethUnits('10000000');
        const distributionAmount2 = ethUnits('10000');

        await REWARD.approve(stakingRewardDistributor.address, distributionAmount);
        await stakingRewardDistributor.distribute(REWARD.address, distributionAmount);

        await REWARD2.approve(stakingRewardDistributor.address, distributionAmount2);
        await stakingRewardDistributor.distribute(REWARD2.address, distributionAmount2);

        expect(await REWARD.balanceOf(stakingRewardDistributor.address)).to.eq(distributionAmount);
        expect(await REWARD2.balanceOf(stakingRewardDistributor.address)).to.eq(
            distributionAmount2
        );

        expect(await REWARD.balanceOf(users[0].address)).to.eq(0);
        expect(await REWARD.balanceOf(users[1].address)).to.eq(0);
        expect(await REWARD2.balanceOf(users[0].address)).to.eq(0);
        expect(await REWARD2.balanceOf(users[1].address)).to.eq(0);

        expect(await POOLTOKEN.balanceOf(stakingRewardDistributor.address)).to.eq(
            ethUnits(depositAmount1 * 2 + depositAmount2)
        );

        // wait 1 week - 50_400 blocks
        await mine(50_400);

        await POOLTOKEN.transfer(users[1].address, ethUnits(depositAmount2));
        await POOLTOKEN.connect(users[1]).approve(
            stakingRewardDistributor.address,
            ethUnits(depositAmount2)
        );
        await stakingRewardDistributor
            .connect(users[1])
            .deposit(ethUnits(depositAmount2), users[1].address);
        expect(await stakingRewardDistributor.balanceOf(users[1].address)).to.eq(
            ethUnits(depositAmount2 * 2)
        );

        // wait 1 week - 50_400 blocks
        await mine(50_400);

        await stakingRewardDistributor.connect(users[0]).claim(users[0].address);
        await stakingRewardDistributor.connect(users[1]).claim(users[1].address);

        expect(await POOLTOKEN.balanceOf(stakingRewardDistributor.address)).to.eq(
            ethUnits(depositAmount1 * 2 + depositAmount2 * 2)
        );

        expect(await REWARD.balanceOf(users[0].address)).to.eq(distributionAmount.div(2));
        expect(await REWARD.balanceOf(users[1].address)).to.eq(distributionAmount.div(2));
        expect(await REWARD2.balanceOf(users[0].address)).to.eq(distributionAmount2.div(2));
        expect(await REWARD2.balanceOf(users[1].address)).to.eq(distributionAmount2.div(2));

        await stakingRewardDistributor
            .connect(users[0])
            .approve(stakingRewardDistributor.address, ethUnits(depositAmount1));
        await stakingRewardDistributor
            .connect(users[0])
            .withdraw(ethUnits(depositAmount1), false, users[0].address);

        expect(await POOLTOKEN.balanceOf(stakingRewardDistributor.address)).to.eq(
            ethUnits(depositAmount1 + depositAmount2 * 2)
        );
        expect(await POOLTOKEN.balanceOf(users[0].address)).to.eq(ethUnits(depositAmount1));

        await mine(50_400);

        expect(await POOLTOKEN.balanceOf(stakingRewardDistributor.address)).to.eq(
            ethUnits(depositAmount1 + depositAmount2 * 2)
        );

        expect(await REWARD.balanceOf(users[0].address)).to.eq(distributionAmount.div(2));
        expect(await REWARD.balanceOf(users[1].address)).to.eq(distributionAmount.div(2));
        expect(await REWARD2.balanceOf(users[0].address)).to.eq(distributionAmount2.div(2));
        expect(await REWARD2.balanceOf(users[1].address)).to.eq(distributionAmount2.div(2));
        await REWARD.approve(stakingRewardDistributor.address, distributionAmount);
        await stakingRewardDistributor.distribute(REWARD.address, distributionAmount);

        await REWARD2.approve(stakingRewardDistributor.address, distributionAmount2);
        await stakingRewardDistributor.distribute(REWARD2.address, distributionAmount2);

        const rewardBalanceBefore1 = await REWARD.balanceOf(users[0].address);
        const rewardBalanceBefore2 = await REWARD.balanceOf(users[1].address);
        const rewardBalanceBefore3 = await REWARD2.balanceOf(users[0].address);
        const rewardBalanceBefore4 = await REWARD2.balanceOf(users[1].address);

        await stakingRewardDistributor.connect(users[0]).claim(users[0].address);
        await stakingRewardDistributor.connect(users[1]).claim(users[1].address);

        const rewardBalanceAfter1 = await REWARD.balanceOf(users[0].address);
        const rewardBalanceAfter2 = await REWARD.balanceOf(users[1].address);
        const rewardBalanceAfter3 = await REWARD2.balanceOf(users[0].address);
        const rewardBalanceAfter4 = await REWARD2.balanceOf(users[1].address);

        expect(rewardBalanceAfter1.sub(rewardBalanceBefore1)).to.be.eq(distributionAmount.div(5));
        expect(rewardBalanceAfter2.sub(rewardBalanceBefore2)).to.be.eq(
            distributionAmount.div(5).mul(4)
        );
        expect(rewardBalanceAfter3.sub(rewardBalanceBefore3)).to.be.eq(distributionAmount2.div(5));
        expect(rewardBalanceAfter4.sub(rewardBalanceBefore4)).to.be.eq(
            distributionAmount2.div(5).mul(4)
        );
    });

    it('should distribute rewards if reward is POOLTOKEN', async () => {
        const fixture = await loadFixture(deployFixture);

        const depositAmount1 = 1000;
        const depositAmount2 = 3000;
        await depositByTwoUsersState(depositAmount1, depositAmount2, fixture);
        const { stakingRewardDistributor, POOLTOKEN, users, admin } = fixture;

        await stakingRewardDistributor.grantRole(
            await stakingRewardDistributor.DISTRIBUTOR_ROLE(),
            admin.address
        );
        await stakingRewardDistributor.addRewardToken(POOLTOKEN.address);

        const balanceBefore = await POOLTOKEN.balanceOf(stakingRewardDistributor.address);
        const distributionAmount = 100000;
        await POOLTOKEN.approve(stakingRewardDistributor.address, ethUnits(distributionAmount));
        await stakingRewardDistributor.distribute(POOLTOKEN.address, ethUnits(distributionAmount));
        const balanceAfter = await POOLTOKEN.balanceOf(stakingRewardDistributor.address);
        expect(balanceAfter.sub(balanceBefore)).to.eq(ethUnits(distributionAmount));

        await stakingRewardDistributor.connect(users[0]).claim(users[0].address);
        await stakingRewardDistributor.connect(users[1]).claim(users[1].address);

        expect(await POOLTOKEN.balanceOf(users[0].address)).to.be.eq(
            ethUnits(distributionAmount).div(4)
        );
        expect(await POOLTOKEN.balanceOf(users[1].address)).to.be.eq(
            ethUnits(distributionAmount).div(4).mul(3)
        );
    });

    async function addRewardToken(
        stakingRewardDistributor: StakingRewardDistributor,
        rewardToken: string
    ) {
        const rewardTokenCountBefore = await stakingRewardDistributor.rewardTokenCount();
        await stakingRewardDistributor.addRewardToken(rewardToken);
        const rewardTokenCountAfter = await stakingRewardDistributor.rewardTokenCount();
        expect(rewardTokenCountBefore.add(1)).eq(rewardTokenCountAfter);
    }

    async function depositToPool(
        stakingRewardDistributor: StakingRewardDistributor,
        token: ERC20,
        signer: SignerWithAddress,
        amount: BigNumberish
    ) {
        await token.connect(signer).approve(stakingRewardDistributor.address, amount);
        await stakingRewardDistributor.connect(signer).deposit(amount, signer.address);
    }

    async function distributeRewardTokens(
        stakingRewardDistributor: StakingRewardDistributor,
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
            POOLTOKEN,
            users: [alice, bob],
        } = await loadFixture(deployFixture);

        await addRewardToken(stakingRewardDistributor, REWARD.address);
        const depositAmount = ethUnits(100);
        await POOLTOKEN.transfer(alice.address, depositAmount);
        await depositToPool(stakingRewardDistributor, POOLTOKEN, alice, depositAmount);

        await mine(BLOCKS_IN_2_WEEKS);

        const distributionAmount = ethUnits(1000);
        await distributeRewardTokens(stakingRewardDistributor, REWARD, distributionAmount, admin);
        await stakingRewardDistributor.connect(alice).claim(alice.address);

        await POOLTOKEN.transfer(bob.address, depositAmount);
        await depositToPool(stakingRewardDistributor, POOLTOKEN, bob, depositAmount);

        await distributeRewardTokens(stakingRewardDistributor, REWARD, distributionAmount, admin);

        await stakingRewardDistributor.connect(bob).claim(bob.address);
        const bobBalanceFirstClaim = await REWARD.balanceOf(bob.address);

        await mine(BLOCKS_IN_2_WEEKS);
        await stakingRewardDistributor.connect(bob).claim(bob.address);
        const bobBalanceSecondClaim = await REWARD.balanceOf(bob.address);
        const aliceBalanceFirstClaim = await REWARD.balanceOf(alice.address);

        await stakingRewardDistributor.connect(alice).claim(alice.address);
        const aliceBalanceSecondClaim = await REWARD.balanceOf(alice.address);

        expect(aliceBalanceSecondClaim.sub(bobBalanceSecondClaim)).to.be.eq(distributionAmount);
        expect(aliceBalanceSecondClaim).to.be.eq(distributionAmount.add(distributionAmount.div(2)));
        expect(bobBalanceSecondClaim).to.be.eq(distributionAmount.div(2));
    });

    it('User rewards should not be zeroed on transfer 0 amount of VL token', async function () {
        const {
            stakingRewardDistributor,
            admin,
            users: [alice, bob],
            POOLTOKEN,
            REWARD,
        } = await loadFixture(deployFixture);

        const depositAmount = ethUnits(100);
        await POOLTOKEN.transfer(bob.address, depositAmount);
        await POOLTOKEN.connect(bob).approve(stakingRewardDistributor.address, depositAmount);
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
        expect(await REWARD.balanceOf(bob.address)).to.eq(ethUnits(100));
    });

    it("shoudn't deposit zero amount", async function () {
        const {
            stakingRewardDistributor,
            admin,
            users: [alice, bob],
            POOLTOKEN,
            REWARD,
        } = await loadFixture(deployFixture);

        const depositAmount = ethUnits(0);
        await POOLTOKEN.transfer(bob.address, depositAmount);
        await POOLTOKEN.connect(bob).approve(stakingRewardDistributor.address, depositAmount);
        await expect(
            stakingRewardDistributor.connect(bob).deposit(depositAmount, bob.address)
        ).to.be.revertedWithCustomError(stakingRewardDistributor, 'ZeroAmount');
    });

    it('shoud deposit to msg.sender if receiver zero address', async function () {
        const {
            stakingRewardDistributor,
            admin,
            users: [alice, bob],
            POOLTOKEN,
            REWARD,
        } = await loadFixture(deployFixture);

        const depositAmount = ethUnits(100);
        await POOLTOKEN.transfer(bob.address, depositAmount);
        await POOLTOKEN.connect(bob).approve(stakingRewardDistributor.address, depositAmount);
        await stakingRewardDistributor.connect(bob).deposit(depositAmount, zeroAddress);
        expect(await stakingRewardDistributor.balanceOf(bob.address)).to.eq(depositAmount);
    });

    it('shoud withdraw if receiver zero address', async function () {
        const {
            stakingRewardDistributor,
            admin,
            users: [alice, bob],
            POOLTOKEN,
            REWARD,
        } = await loadFixture(deployFixture);

        const depositAmount = ethUnits(100);
        await POOLTOKEN.transfer(bob.address, depositAmount);
        await POOLTOKEN.connect(bob).approve(stakingRewardDistributor.address, depositAmount);
        await stakingRewardDistributor.connect(bob).deposit(depositAmount, bob.address);
        expect(await stakingRewardDistributor.balanceOf(bob.address)).to.eq(depositAmount);
        await stakingRewardDistributor
            .connect(bob)
            .approve(stakingRewardDistributor.address, depositAmount);
        await stakingRewardDistributor.connect(bob).withdraw(depositAmount, false, zeroAddress);
        expect(await POOLTOKEN.balanceOf(bob.address)).to.eq(depositAmount);
    });

    it("shoudn't withdraw if amount bigger than user's balance", async function () {
        const {
            stakingRewardDistributor,
            admin,
            users: [alice, bob],
            POOLTOKEN,
            REWARD,
        } = await loadFixture(deployFixture);

        const depositAmount = ethUnits(100);
        await POOLTOKEN.transfer(bob.address, depositAmount);
        await POOLTOKEN.connect(bob).approve(stakingRewardDistributor.address, depositAmount);
        await stakingRewardDistributor.connect(bob).deposit(depositAmount, bob.address);
        expect(await stakingRewardDistributor.balanceOf(bob.address)).to.eq(depositAmount);
        await stakingRewardDistributor
            .connect(bob)
            .approve(stakingRewardDistributor.address, depositAmount);
        await expect(
            stakingRewardDistributor.connect(bob).withdraw(depositAmount.mul(2), false, zeroAddress)
        ).to.be.revertedWithCustomError(stakingRewardDistributor, 'WrongAmount');
    });

    it("shoud withdraw if amount bigger than user's balance", async function () {
        const {
            stakingRewardDistributor,
            admin,
            users: [alice, bob],
            POOLTOKEN,
            REWARD,
        } = await loadFixture(deployFixture);

        const depositAmount = ethUnits(100);
        await POOLTOKEN.transfer(bob.address, depositAmount);
        await POOLTOKEN.connect(bob).approve(stakingRewardDistributor.address, depositAmount);
        await stakingRewardDistributor.connect(bob).deposit(depositAmount, bob.address);
        expect(await stakingRewardDistributor.balanceOf(bob.address)).to.eq(depositAmount);
        await stakingRewardDistributor
            .connect(bob)
            .approve(stakingRewardDistributor.address, depositAmount);
        await stakingRewardDistributor.connect(bob).withdraw(0, false, zeroAddress);
    });

    it("shoudn't add reward token if zero address", async function () {
        const { stakingRewardDistributor } = await loadFixture(deployFixture);

        await expect(
            stakingRewardDistributor.addRewardToken(zeroAddress)
        ).to.be.revertedWithCustomError(stakingRewardDistributor, 'ZeroAddress');
    });

    it("shoudn't add reward token if zero address", async function () {
        const { stakingRewardDistributor, REWARD } = await loadFixture(deployFixture);

        await stakingRewardDistributor.addRewardToken(REWARD.address);
        await expect(
            stakingRewardDistributor.addRewardToken(REWARD.address)
        ).to.be.revertedWithCustomError(stakingRewardDistributor, 'TokenAlreadyAdded');
    });

    it("shoudn't distribute if total amount zero", async function () {
        const fixture = await loadFixture(deployFixture);

        const { stakingRewardDistributor, admin, REWARD, users } = fixture;

        await stakingRewardDistributor.grantRole(
            await stakingRewardDistributor.DISTRIBUTOR_ROLE(),
            admin.address
        );

        const firstDistributionAmount1 = ethUnits('1000000');
        await REWARD.approve(stakingRewardDistributor.address, firstDistributionAmount1);
        await expect(
            stakingRewardDistributor.distribute(REWARD.address, firstDistributionAmount1)
        ).to.be.revertedWithCustomError(stakingRewardDistributor, 'ZeroSupply');
    });

    it("shoudn't distribute if amount zero", async function () {
        const fixture = await loadFixture(deployFixture);
        const depositAmount1 = 1000;
        const depositAmount2 = 2000;
        const { tid1, tid2 } = await depositByTwoUsersState(
            depositAmount1,
            depositAmount2,
            fixture
        );
        const { stakingRewardDistributor, admin, REWARD, users } = fixture;

        await stakingRewardDistributor.grantRole(
            await stakingRewardDistributor.DISTRIBUTOR_ROLE(),
            admin.address
        );

        const firstDistributionAmount1 = ethUnits('1000000');
        await REWARD.approve(stakingRewardDistributor.address, firstDistributionAmount1);
        await expect(
            stakingRewardDistributor.distribute(REWARD.address, 0)
        ).to.be.revertedWithCustomError(stakingRewardDistributor, 'ZeroAmount');
    });

    it("shoudn't distribute if zero token address", async function () {
        const fixture = await loadFixture(deployFixture);
        const depositAmount1 = 1000;
        const depositAmount2 = 2000;
        const { tid1, tid2 } = await depositByTwoUsersState(
            depositAmount1,
            depositAmount2,
            fixture
        );
        const { stakingRewardDistributor, admin, REWARD, users } = fixture;

        await stakingRewardDistributor.grantRole(
            await stakingRewardDistributor.DISTRIBUTOR_ROLE(),
            admin.address
        );

        const firstDistributionAmount1 = ethUnits('1000000');
        await REWARD.approve(stakingRewardDistributor.address, firstDistributionAmount1);
        await expect(
            stakingRewardDistributor.distribute(zeroAddress, firstDistributionAmount1)
        ).to.be.revertedWithCustomError(stakingRewardDistributor, 'ZeroAddress');
    });

    it("shoudn't distribute if wrong token address", async function () {
        const fixture = await loadFixture(deployFixture);
        const depositAmount1 = 1000;
        const depositAmount2 = 2000;
        const { tid1, tid2 } = await depositByTwoUsersState(
            depositAmount1,
            depositAmount2,
            fixture
        );
        const { stakingRewardDistributor, admin, REWARD, POOLTOKEN } = fixture;

        await stakingRewardDistributor.grantRole(
            await stakingRewardDistributor.DISTRIBUTOR_ROLE(),
            admin.address
        );

        const firstDistributionAmount1 = ethUnits('1000000');
        await REWARD.approve(stakingRewardDistributor.address, firstDistributionAmount1);
        await expect(
            stakingRewardDistributor.distribute(POOLTOKEN.address, firstDistributionAmount1)
        ).to.be.revertedWithCustomError(stakingRewardDistributor, 'AbsentRewardToken');
    });

    it("shoud withdraw stuck token", async function () {
        const fixture = await loadFixture(deployFixture);
        const { stakingRewardDistributor, admin, REWARD, POOLTOKEN } = fixture;

        const ERC20TokenFactory = await ethers.getContractFactory('ERC20Token');
        const stuckToken = (await ERC20TokenFactory.deploy(18)) as ERC20;

        const amount = 1000;
        await stuckToken.transfer(stakingRewardDistributor.address, ethUnits(amount));
        
        let balanceBefore = await stuckToken.balanceOf(admin.address);
        await stakingRewardDistributor.withdrawStuckToken(stuckToken.address, ethUnits(amount / 2));
        let balanceAfter = await stuckToken.balanceOf(admin.address);
        expect(balanceAfter.sub(balanceBefore)).to.be.eq(ethUnits(amount / 2));

        balanceBefore = await stuckToken.balanceOf(admin.address);
        await stakingRewardDistributor.withdrawStuckToken(stuckToken.address, ethers.constants.MaxUint256);
        balanceAfter = await stuckToken.balanceOf(admin.address);
        expect(balanceAfter.sub(balanceBefore)).to.be.eq(ethUnits(amount / 2));
    });

    it("shoudn't withdraw stuck token if zero amount", async function () {
        const fixture = await loadFixture(deployFixture);
        const { stakingRewardDistributor, admin, REWARD, POOLTOKEN } = fixture;

        const ERC20TokenFactory = await ethers.getContractFactory('ERC20Token');
        const stuckToken = (await ERC20TokenFactory.deploy(18)) as ERC20;

        const amount = 1000;
        await stuckToken.transfer(stakingRewardDistributor.address, ethUnits(amount));

        let balanceBefore = await stuckToken.balanceOf(admin.address);
        await stakingRewardDistributor.withdrawStuckToken(stuckToken.address, 0);
        let balanceAfter = await stuckToken.balanceOf(admin.address);
        expect(balanceAfter.sub(balanceBefore)).to.be.eq(0);

    });
});
