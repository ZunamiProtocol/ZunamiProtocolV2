import { ethers, upgrades } from 'hardhat';
import { loadFixture, mine, mineUpTo } from '@nomicfoundation/hardhat-network-helpers';
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

    it('should revert deposit when amount is zero', async () => {
        const { stakingRewardDistributor, ZUN, REWARD, REWARD2, admin, users, earlyExitReceiver } =
            await loadFixture(deployFixture);

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
        await stakingRewardDistributor
            .connect(users[0])
            .approve(stakingRewardDistributor.address, withdrawAmount);
        await stakingRewardDistributor.connect(users[0]).withdraw(0, false, users[0].address);

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

        // mine blocks to unlock the deposit without early exit fee
        await mineUpTo((await stakingRewardDistributor.userLocks(users[0].address, 0)).untilBlock);

        const withdrawAmount = ethUnits(depositAmount1);
        await stakingRewardDistributor
            .connect(users[0])
            .approve(stakingRewardDistributor.address, withdrawAmount);
        await stakingRewardDistributor.connect(users[0]).withdraw(0, false, users[0].address);

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

        // mine blocks to unlock the deposit without early exit fee
        await mineUpTo((await stakingRewardDistributor.userLocks(users[0].address, 0)).untilBlock);

        const withdrawAmount = ethUnits(depositAmount1);
        await stakingRewardDistributor
            .connect(users[0])
            .approve(stakingRewardDistributor.address, withdrawAmount);
        const expectedReward = await stakingRewardDistributor.getPendingReward(tid, users[0].address);
        await stakingRewardDistributor.connect(users[0]).withdraw(0, true, users[0].address);

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

        // mine blocks to unlock the deposit without early exit fee and withdraw
        await mineUpTo((await stakingRewardDistributor.userLocks(users[0].address, 0)).untilBlock);
        const withdrawAmount = ethUnits(depositAmount1);
        await stakingRewardDistributor
            .connect(users[0])
            .approve(stakingRewardDistributor.address, withdrawAmount);
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
        await stakingRewardDistributor.connect(users[2]).withdrawToken(ethUnits(withdrawAmount));

        // check balances after withdraw
        expect(await ZUN.balanceOf(users[2].address)).to.eq(ethUnits(withdrawAmount));
        expect(await stakingRewardDistributor.recapitalizedAmount()).to.eq(
            ethUnits(withdrawAmount)
        );
    });

    it('check that deposit works correctly after withdraw pool tokens from staking reward distributor', async () => {
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
        // withdraw pool tokens from staking reward distributor
        const withdrawAmount = 2500;
        await stakingRewardDistributor.connect(users[2]).withdrawToken(ethUnits(withdrawAmount));

        // deposit some tokens by user[2]
        const newDepositAmount = 1000;
        await ZUN.transfer(users[2].address, newDepositAmount);
        await depositToPool(stakingRewardDistributor, ZUN, users[2], newDepositAmount);

        expect(await stakingRewardDistributor.balanceOf(users[2].address)).to.eq(newDepositAmount);
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
