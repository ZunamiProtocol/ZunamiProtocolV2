import { ethers } from 'hardhat';
import { loadFixture, mine } from '@nomicfoundation/hardhat-network-helpers';
import { BigNumber, utils } from 'ethers';
import { parseUnits } from 'ethers/lib/utils';
import { expect } from 'chai';
import { FakeContract, smock } from '@defi-wonderland/smock';

import {
    ERC20,
    ERC20Votes,
    ZunDistributor,
    ApproveGauge,
    TransferGauge,
    StakingRewardDistributorGauge,
    StakingRewardDistributor,
} from '../../typechain-types';

describe('ZunDistributor tests', () => {
    async function deployFixture() {
        // Contracts are deployed using the first signer/account by default
        const [voter, dao, approveGaugeRec, transferGaugeRec, addedGaugeRec] =
            await ethers.getSigners();

        // deploy test ERC20 token
        const ERC20Factory = await ethers.getContractFactory('ERC20Token');
        const ZUN = (await ERC20Factory.deploy(18)) as ERC20;

        // deploy test ERC20Votes token
        const ERC20VotesFactory = await ethers.getContractFactory('ERC20VotesToken');
        const vlZUN = (await ERC20VotesFactory.deploy()) as ERC20Votes;

        await vlZUN.delegate(voter.address);
        expect(await vlZUN.getVotes(voter.address)).to.eq(parseUnits('100000', 'ether'));

        // deploy test gauges
        const ApproveGaugeFactory = await ethers.getContractFactory('ApproveGauge');
        const approveGauge = (await ApproveGaugeFactory.deploy(
            dao.address,
            ZUN.address,
            approveGaugeRec.address
        )) as ApproveGauge;

        const TransferGaugeFactory = await ethers.getContractFactory('TransferGauge');
        const transferGauge = (await TransferGaugeFactory.deploy(
            ZUN.address,
            transferGaugeRec.address
        )) as TransferGauge;

        const stakingRewardDistributor = (await smock.fake(
            'IStakingRewardDistributor'
        )) as FakeContract<IStakingRewardDistributor>;

        const StakingRewardDistributorGaugeFactory = await ethers.getContractFactory(
            'StakingRewardDistributorGauge'
        );
        const stakingRewardDistributorGauge = (await StakingRewardDistributorGaugeFactory.deploy(
            ZUN.address,
            stakingRewardDistributor.address,
            0
        )) as StakingRewardDistributorGauge;

        const addedGauge = (await TransferGaugeFactory.deploy(
            ZUN.address,
            addedGaugeRec.address
        )) as TransferGauge;

        // deploy distributor contract
        const ZunDistributorFactory = await ethers.getContractFactory('ZunDistributor');
        const distributor = (await ZunDistributorFactory.deploy(
            ZUN.address,
            vlZUN.address,
            dao.address,
            0,
            [approveGauge.address, transferGauge.address, stakingRewardDistributorGauge.address],
            [parseUnits('1000', 'ether'), parseUnits('1000', 'ether'), parseUnits('1000', 'ether')]
        )) as ZunDistributor;

        await ZUN.transfer(distributor.address, parseUnits('32000000', 'ether'));
        expect(await ZUN.balanceOf(distributor.address)).to.eq(parseUnits('32000000', 'ether'));

        return {
            voter,
            approveGauge,
            transferGauge,
            stakingRewardDistributorGauge,
            addedGauge,
            approveGaugeRec,
            transferGaugeRec,
            addedGaugeRec,
            ZUN,
            vlZUN,
            distributor,
            dao,
            stakingRewardDistributor,
        };
    }

    it('should init correctly', async () => {
        const { voter, approveGauge, transferGauge, ZUN, vlZUN, distributor, dao } =
            await loadFixture(deployFixture);

        // check token
        expect(await vlZUN.balanceOf(voter.address)).to.eq(parseUnits('100000', 'ether'));

        // check distributor
        expect(await distributor.token()).to.eq(ZUN.address);
        expect(await distributor.voteToken()).to.eq(vlZUN.address);
        expect(await distributor.owner()).to.eq(dao.address);
        let gaugeItem = await distributor.gauges(0);
        expect(gaugeItem.addr).to.eq(approveGauge.address);
        expect(gaugeItem.finalizedVotes).to.eq(parseUnits('1000', 'ether'));
        gaugeItem = await distributor.gauges(1);
        expect(gaugeItem.addr).to.eq(transferGauge.address);
        expect(gaugeItem.finalizedVotes).to.eq(parseUnits('1000', 'ether'));
        expect(await distributor.FIRST_YEAR_DISTRIBUTION_VALUE()).to.eq(
            parseUnits('11200000', 'ether')
        );
    });

    it('quorum reached', async () => {
        const {
            voter,
            approveGauge,
            transferGauge,
            approveGaugeRec,
            transferGaugeRec,
            ZUN,
            vlZUN,
            distributor,
            dao,
        } = await loadFixture(deployFixture);

        // vote
        await distributor.castVote(
            [0, 1],
            [parseUnits('2000', 'ether'), parseUnits('1000', 'ether')]
        );

        let gaugeItem = await distributor.gauges(0);
        expect(gaugeItem.currentVotes).to.eq(parseUnits('2000', 'ether'));
        gaugeItem = await distributor.gauges(1);
        expect(gaugeItem.currentVotes).to.eq(parseUnits('1000', 'ether'));

        // wait 2 week - 100_800 blocks
        await mine(100_800);

        // distribute
        expect(await ZUN.balanceOf(approveGauge.address)).to.eq(0);
        expect(await ZUN.balanceOf(transferGauge.address)).to.eq(0);
        expect(await ZUN.balanceOf(approveGaugeRec.address)).to.eq(0);
        expect(await ZUN.balanceOf(transferGaugeRec.address)).to.eq(0);

        await distributor.distribute();

        gaugeItem = await distributor.gauges(0);
        expect(gaugeItem.finalizedVotes).to.eq(parseUnits('2000', 'ether'));
        gaugeItem = await distributor.gauges(1);
        expect(gaugeItem.finalizedVotes).to.eq(parseUnits('1000', 'ether'));

        expect(await ZUN.balanceOf(approveGauge.address)).to.eq(
            parseUnits('287179487179487179487179', 'wei')
        );
        expect(await ZUN.balanceOf(transferGauge.address)).to.eq(0);
        expect(await ZUN.balanceOf(approveGaugeRec.address)).to.eq(0);
        expect(await ZUN.allowance(approveGauge.address, approveGaugeRec.address)).to.eq(
            parseUnits('287179487179487179487179', 'wei')
        );
        expect(await ZUN.balanceOf(transferGaugeRec.address)).to.eq(
            parseUnits('143589743589743589743589', 'wei')
        );
    });

    it('quorum not reached', async () => {
        const {
            voter,
            approveGauge,
            transferGauge,
            approveGaugeRec,
            transferGaugeRec,
            ZUN,
            vlZUN,
            distributor,
            dao,
        } = await loadFixture(deployFixture);

        // set voting threshold
        expect(await distributor.votingThreshold()).to.eq(0);
        await distributor.connect(dao).setVotingThreshold(parseUnits('1000', 'ether'));
        expect(await distributor.votingThreshold()).to.eq(parseUnits('1000', 'ether'));

        // vote
        await distributor.castVote(
            [0, 1],
            [parseUnits('200', 'ether'), parseUnits('100', 'ether')]
        );

        let gaugeItem = await distributor.gauges(0);
        expect(gaugeItem.currentVotes).to.eq(parseUnits('200', 'ether'));
        gaugeItem = await distributor.gauges(1);
        expect(gaugeItem.currentVotes).to.eq(parseUnits('100', 'ether'));

        // wait 2 week - 100_800 blocks
        await mine(100_800);

        // distribute
        expect(await ZUN.balanceOf(approveGauge.address)).to.eq(0);
        expect(await ZUN.balanceOf(transferGauge.address)).to.eq(0);
        expect(await ZUN.balanceOf(approveGaugeRec.address)).to.eq(0);
        expect(await ZUN.balanceOf(transferGaugeRec.address)).to.eq(0);

        await distributor.distribute();

        gaugeItem = await distributor.gauges(0);
        expect(gaugeItem.finalizedVotes).to.eq(parseUnits('1000', 'ether'));
        gaugeItem = await distributor.gauges(1);
        expect(gaugeItem.finalizedVotes).to.eq(parseUnits('1000', 'ether'));

        expect(await ZUN.balanceOf(approveGauge.address)).to.eq(
            parseUnits('143589743589743589743589', 'wei')
        );
        expect(await ZUN.balanceOf(transferGauge.address)).to.eq(0);
        expect(await ZUN.balanceOf(approveGaugeRec.address)).to.eq(0);
        expect(await ZUN.allowance(approveGauge.address, approveGaugeRec.address)).to.eq(
            parseUnits('143589743589743589743589', 'wei')
        );
        expect(await ZUN.balanceOf(transferGaugeRec.address)).to.eq(
            parseUnits('143589743589743589743589', 'wei')
        );
    });

    it('insufficient voting power', async () => {
        const { voter, distributor } = await loadFixture(deployFixture);

        // vote
        await distributor.castVote(
            [0, 1],
            [parseUnits('200', 'ether'), parseUnits('100', 'ether')]
        );

        let lastFinalizeBlock = await distributor.lastFinalizeBlock();
        expect(await distributor.usedVotes(lastFinalizeBlock, voter.address)).to.eq(
            parseUnits('300', 'ether')
        );

        let gaugeItem = await distributor.gauges(0);
        expect(gaugeItem.currentVotes).to.eq(parseUnits('200', 'ether'));
        gaugeItem = await distributor.gauges(1);
        expect(gaugeItem.currentVotes).to.eq(parseUnits('100', 'ether'));

        // vote with insufficient voting power
        await expect(
            distributor.castVote(
                [0, 1],
                [parseUnits('200000', 'ether'), parseUnits('100', 'ether')]
            )
        ).to.be.revertedWithCustomError(distributor, 'InsufficientVotePower');

        expect(await distributor.usedVotes(lastFinalizeBlock, voter.address)).to.eq(
            parseUnits('300', 'ether')
        );

        gaugeItem = await distributor.gauges(0);
        expect(gaugeItem.currentVotes).to.eq(parseUnits('200', 'ether'));
        gaugeItem = await distributor.gauges(1);
        expect(gaugeItem.currentVotes).to.eq(parseUnits('100', 'ether'));
    });

    it('period distr is already happened', async () => {
        const {
            voter,
            approveGauge,
            transferGauge,
            approveGaugeRec,
            transferGaugeRec,
            ZUN,
            vlZUN,
            distributor,
            dao,
        } = await loadFixture(deployFixture);

        // vote
        await distributor.castVote(
            [0, 1],
            [parseUnits('2000', 'ether'), parseUnits('1000', 'ether')]
        );

        // wait 2 week - 100_800 blocks
        await mine(100_800);

        // distribute
        await distributor.distribute();

        expect(await ZUN.balanceOf(approveGauge.address)).to.eq(
            parseUnits('287179487179487179487179', 'wei')
        );
        expect(await ZUN.allowance(approveGauge.address, approveGaugeRec.address)).to.eq(
            parseUnits('287179487179487179487179', 'wei')
        );
        expect(await ZUN.balanceOf(transferGaugeRec.address)).to.eq(
            parseUnits('143589743589743589743589', 'wei')
        );

        await expect(distributor.distribute()).to.be.revertedWithCustomError(
            distributor,
            'DistributionAlreadyHappened'
        );
    });

    it('finalize voting on vote', async () => {
        const {
            voter,
            approveGauge,
            transferGauge,
            approveGaugeRec,
            transferGaugeRec,
            ZUN,
            vlZUN,
            distributor,
            dao,
        } = await loadFixture(deployFixture);

        // vote
        await distributor.castVote(
            [0, 1],
            [parseUnits('2000', 'ether'), parseUnits('1000', 'ether')]
        );

        let gaugeItem = await distributor.gauges(0);
        expect(gaugeItem.currentVotes).to.eq(parseUnits('2000', 'ether'));
        gaugeItem = await distributor.gauges(1);
        expect(gaugeItem.currentVotes).to.eq(parseUnits('1000', 'ether'));

        // wait 2 week - 100_800 blocks
        await mine(100_800);

        // finalize voting on vote
        gaugeItem = await distributor.gauges(0);
        expect(gaugeItem.finalizedVotes).to.eq(parseUnits('1000', 'ether'));
        gaugeItem = await distributor.gauges(1);
        expect(gaugeItem.finalizedVotes).to.eq(parseUnits('1000', 'ether'));

        await distributor.castVote(
            [0, 1],
            [parseUnits('3000', 'ether'), parseUnits('4000', 'ether')]
        );

        gaugeItem = await distributor.gauges(0);
        expect(gaugeItem.finalizedVotes).to.eq(parseUnits('2000', 'ether'));
        gaugeItem = await distributor.gauges(1);
        expect(gaugeItem.finalizedVotes).to.eq(parseUnits('1000', 'ether'));

        gaugeItem = await distributor.gauges(0);
        expect(gaugeItem.currentVotes).to.eq(parseUnits('3000', 'ether'));
        gaugeItem = await distributor.gauges(1);
        expect(gaugeItem.currentVotes).to.eq(parseUnits('4000', 'ether'));
    });

    it('finalize voting on distribution', async () => {
        const {
            voter,
            approveGauge,
            transferGauge,
            approveGaugeRec,
            transferGaugeRec,
            ZUN,
            vlZUN,
            distributor,
            dao,
        } = await loadFixture(deployFixture);

        // vote
        await distributor.castVote(
            [0, 1],
            [parseUnits('2000', 'ether'), parseUnits('1000', 'ether')]
        );

        let gaugeItem = await distributor.gauges(0);
        expect(gaugeItem.currentVotes).to.eq(parseUnits('2000', 'ether'));
        gaugeItem = await distributor.gauges(1);
        expect(gaugeItem.currentVotes).to.eq(parseUnits('1000', 'ether'));

        // wait 2 week - 100_800 blocks
        await mine(100_800);

        // finalize voting on distribution

        gaugeItem = await distributor.gauges(0);
        expect(gaugeItem.finalizedVotes).to.eq(parseUnits('1000', 'ether'));
        gaugeItem = await distributor.gauges(1);
        expect(gaugeItem.finalizedVotes).to.eq(parseUnits('1000', 'ether'));

        await distributor.distribute();

        gaugeItem = await distributor.gauges(0);
        expect(gaugeItem.finalizedVotes).to.eq(parseUnits('2000', 'ether'));
        gaugeItem = await distributor.gauges(1);
        expect(gaugeItem.finalizedVotes).to.eq(parseUnits('1000', 'ether'));

        gaugeItem = await distributor.gauges(0);
        expect(gaugeItem.currentVotes).to.eq(0);
        gaugeItem = await distributor.gauges(1);
        expect(gaugeItem.currentVotes).to.eq(0);
    });

    it('should vote with signature', async () => {
        const { voter, approveGauge, transferGauge, vlZUN, distributor, dao } = await loadFixture(
            deployFixture
        );

        const latestBlock = await ethers.provider.getBlock('latest');
        const deadline = latestBlock.timestamp + 100;
        const gaugeIds = [0, 1];
        const amounts = [parseUnits('2000', 'ether'), parseUnits('1000', 'ether')];

        // prepare signature
        const domainData = {
            name: 'ZunamiDistributor',
            version: '1',
            chainId: 31337,
            verifyingContract: distributor.address,
        };

        const Ballot = [
            { name: 'gaugeIdsHash', type: 'bytes32' },
            { name: 'amountsHash', type: 'bytes32' },
            { name: 'voter', type: 'address' },
            { name: 'nonce', type: 'uint256' },
            { name: 'deadline', type: 'uint256' },
        ];

        const types = {
            Ballot,
        };

        const message = {
            gaugeIdsHash: utils.keccak256(utils.defaultAbiCoder.encode(['uint256[]'], [gaugeIds])),
            amountsHash: utils.keccak256(utils.defaultAbiCoder.encode(['uint256[]'], [amounts])),
            voter: voter.address,
            nonce: 0,
            deadline,
        };
        const signature = await voter._signTypedData(domainData, types, message);

        // vote
        await distributor
            .connect(dao)
            .castVoteBySig(gaugeIds, amounts, voter.address, deadline, signature);

        let gaugeItem = await distributor.gauges(0);
        expect(gaugeItem.currentVotes).to.eq(parseUnits('2000', 'ether'));
        gaugeItem = await distributor.gauges(1);
        expect(gaugeItem.currentVotes).to.eq(parseUnits('1000', 'ether'));
    });

    it('invalid signature', async () => {
        const { voter, approveGauge, transferGauge, vlZUN, distributor, dao } = await loadFixture(
            deployFixture
        );

        const latestBlock = await ethers.provider.getBlock('latest');
        const deadline = latestBlock.timestamp + 100;
        const gaugeIds = [0, 1];
        const amounts = [parseUnits('2000', 'ether'), parseUnits('1000', 'ether')];

        // prepare signature
        const domainData = {
            name: 'ZunamiDistributor',
            version: '1',
            chainId: 31337,
            verifyingContract: distributor.address,
        };

        const Ballot = [
            { name: 'gaugeIdsHash', type: 'bytes32' },
            { name: 'amountsHash', type: 'bytes32' },
            { name: 'voter', type: 'address' },
            { name: 'nonce', type: 'uint256' },
            { name: 'deadline', type: 'uint256' },
        ];

        const types = {
            Ballot,
        };

        const message = {
            gaugeIdsHash: utils.keccak256(utils.defaultAbiCoder.encode(['uint256[]'], [gaugeIds])),
            amountsHash: utils.keccak256(utils.defaultAbiCoder.encode(['uint256[]'], [amounts])),
            voter: voter.address,
            nonce: 0,
            deadline,
        };
        const signature = await voter._signTypedData(domainData, types, message);

        // vote
        await expect(
            distributor.castVoteBySig(gaugeIds, amounts, voter.address, deadline + 1, signature)
        ).to.be.revertedWithCustomError(distributor, 'InvalidSignature');
    });

    it('expired signature', async () => {
        const { voter, approveGauge, transferGauge, vlZUN, distributor, dao } = await loadFixture(
            deployFixture
        );

        const latestBlock = await ethers.provider.getBlock('latest');
        const deadline = latestBlock.timestamp;
        const gaugeIds = [0, 1];
        const amounts = [parseUnits('2000', 'ether'), parseUnits('1000', 'ether')];

        // prepare signature
        const domainData = {
            name: 'ZunamiDistributor',
            version: '1',
            chainId: 31337,
            verifyingContract: distributor.address,
        };

        const Ballot = [
            { name: 'gaugeIdsHash', type: 'bytes32' },
            { name: 'amountsHash', type: 'bytes32' },
            { name: 'voter', type: 'address' },
            { name: 'nonce', type: 'uint256' },
            { name: 'deadline', type: 'uint256' },
        ];

        const types = {
            Ballot,
        };

        const message = {
            gaugeIdsHash: utils.keccak256(utils.defaultAbiCoder.encode(['uint256[]'], [gaugeIds])),
            amountsHash: utils.keccak256(utils.defaultAbiCoder.encode(['uint256[]'], [amounts])),
            voter: voter.address,
            nonce: 0,
            deadline,
        };
        const signature = await voter._signTypedData(domainData, types, message);

        // vote
        await expect(
            distributor.castVoteBySig(gaugeIds, amounts, voter.address, deadline, signature)
        ).to.be.revertedWithCustomError(distributor, 'ExpiredSignature');
    });

    it('should distribute all', async () => {
        const {
            voter,
            approveGauge,
            transferGauge,
            approveGaugeRec,
            transferGaugeRec,
            ZUN,
            vlZUN,
            distributor,
            dao,
        } = await loadFixture(deployFixture);

        let gaugeBal = parseUnits('0', 'wei');
        let yearCount, yearValue;
        const firstYearValue = await distributor.FIRST_YEAR_DISTRIBUTION_VALUE();
        const periodBlocks = await distributor.VOTING_PERIOD();
        const yearBlocks = await distributor.BLOCKS_IN_YEAR();

        let distrAmount = firstYearValue.mul(periodBlocks).div(yearBlocks).div(3);

        // distribute in cycle
        for (let i = 1; i < 130; i++) {
            // max 29 years - 754
            // console.log(i, distrAmount);
            // wait 2 week - 100_800 blocks
            await mine(100_800);

            // distribute
            await distributor.distribute();

            // check distributionValue
            gaugeBal = gaugeBal.add(distrAmount);
            expect(await ZUN.balanceOf(approveGauge.address)).to.eq(gaugeBal);
            expect(await ZUN.balanceOf(transferGaugeRec.address)).to.eq(gaugeBal);

            // check yearDistributionValue
            if (i % 26 == 0) {
                yearCount = BigNumber.from(i).div(26);
                yearValue = firstYearValue
                    .mul(BigNumber.from(650).pow(yearCount))
                    .div(BigNumber.from(1000).pow(yearCount));
                distrAmount = yearValue.mul(periodBlocks).div(yearBlocks).div(3);
                // console.log(i, distrAmount);
            }
        }
    });

    it('stop distribution', async () => {
        const { voter, approveGauge, transferGauge, ZUN, distributor, dao } = await loadFixture(
            deployFixture
        );

        expect(await distributor.paused()).to.eq(false);

        await expect(distributor.stopDistribution()).to.be.revertedWithCustomError(
            distributor,
            'OwnableUnauthorizedAccount'
        );

        expect(await distributor.paused()).to.eq(false);
        expect(await ZUN.balanceOf(dao.address)).to.eq(0);

        await distributor.connect(dao).stopDistribution();

        expect(await distributor.paused()).to.eq(true);
        expect(await ZUN.balanceOf(dao.address)).to.eq(parseUnits('32000000', 'ether'));
    });

    it('add gauge', async () => {
        const { voter, approveGauge, transferGauge, addedGauge, distributor, dao } =
            await loadFixture(deployFixture);

        expect(await distributor.gaugesNumber()).to.eq(3);

        await distributor.connect(dao).addGauge(addedGauge.address);

        expect(await distributor.gaugesNumber()).to.eq(4);

        let gaugeItem = await distributor.gauges(0);
        expect(gaugeItem.addr).to.eq(approveGauge.address);
        expect(gaugeItem.finalizedVotes).to.eq(parseUnits('1000', 'ether'));
        gaugeItem = await distributor.gauges(1);
        expect(gaugeItem.addr).to.eq(transferGauge.address);
        expect(gaugeItem.finalizedVotes).to.eq(parseUnits('1000', 'ether'));
        gaugeItem = await distributor.gauges(3);
        expect(gaugeItem.addr).to.eq(addedGauge.address);
        expect(gaugeItem.finalizedVotes).to.eq(0);
    });

    it('delete gauge', async () => {
        const { voter, approveGauge, transferGauge, addedGauge, distributor, dao } =
            await loadFixture(deployFixture);

        expect(await distributor.gaugesNumber()).to.eq(3);

        await distributor.connect(dao).addGauge(addedGauge.address);

        expect(await distributor.gaugesNumber()).to.eq(4);

        await distributor.connect(dao).deleteGauge(0);

        expect(await distributor.gaugesNumber()).to.eq(3);

        let gaugeItem = await distributor.gauges(0);
        expect(gaugeItem.addr).to.eq(transferGauge.address);
        expect(gaugeItem.finalizedVotes).to.eq(parseUnits('1000', 'ether'));
        gaugeItem = await distributor.gauges(2);
        expect(gaugeItem.addr).to.eq(addedGauge.address);
        expect(gaugeItem.finalizedVotes).to.eq(0);
    });

    it('withdraw stuck token distributor', async () => {
        const { voter, approveGauge, transferGauge, ZUN, vlZUN, distributor, dao } =
            await loadFixture(deployFixture);

        await expect(distributor.withdrawStuckToken(ZUN.address)).to.be.revertedWithCustomError(
            distributor,
            'OwnableUnauthorizedAccount'
        );

        expect(await ZUN.balanceOf(dao.address)).to.eq(0);

        await distributor.connect(dao).withdrawStuckToken(ZUN.address);

        expect(await ZUN.balanceOf(dao.address)).to.eq(parseUnits('32000000', 'ether'));
    });

    it('withdraw stuck token approve gauge', async () => {
        const { voter, approveGauge, transferGauge, ZUN, vlZUN, distributor, dao } =
            await loadFixture(deployFixture);

        await expect(approveGauge.withdrawStuckToken(ZUN.address)).to.be.revertedWithCustomError(
            approveGauge,
            'OwnableUnauthorizedAccount'
        );

        await ZUN.transfer(approveGauge.address, parseUnits('32000000', 'ether'));
        expect(await ZUN.balanceOf(approveGauge.address)).to.eq(parseUnits('32000000', 'ether'));

        expect(await ZUN.balanceOf(dao.address)).to.eq(0);
        await approveGauge.connect(dao).withdrawStuckToken(ZUN.address);

        expect(await ZUN.balanceOf(dao.address)).to.eq(parseUnits('32000000', 'ether'));
    });

    it('vote/distribute before start block', async () => {
        const { voter, approveGauge, transferGauge, ZUN, vlZUN, distributor, dao } =
            await loadFixture(deployFixture);

        const latestBlock = await ethers.provider.getBlock('latest');

        const blockInFuture = latestBlock.number + 100;

        // deploy distributor contract
        const ZunDistributorFactory = await ethers.getContractFactory('ZunDistributor');
        const testDistributor = (await ZunDistributorFactory.deploy(
            ZUN.address,
            vlZUN.address,
            dao.address,
            blockInFuture,
            [approveGauge.address, transferGauge.address],
            [parseUnits('1000', 'ether'), parseUnits('1000', 'ether')]
        )) as ZunDistributor;

        await expect(
            testDistributor.castVote(
                [0, 1],
                [parseUnits('3000', 'ether'), parseUnits('4000', 'ether')]
            )
        ).to.be.revertedWithCustomError(testDistributor, 'StartBlockInFuture');

        await expect(testDistributor.distribute()).to.be.revertedWithCustomError(
            testDistributor,
            'StartBlockInFuture'
        );
    });

    it.skip('gas opti', async () => {
        const {
            voter,
            approveGauge,
            transferGauge,
            approveGaugeRec,
            transferGaugeRec,
            ZUN,
            vlZUN,
            distributor,
            dao,
        } = await loadFixture(deployFixture);

        // vote
        let tx = await distributor.castVote(
            [0, 1],
            [parseUnits('2000', 'ether'), parseUnits('1000', 'ether')]
        );

        let receipt = await tx.wait();
        console.log(receipt.cumulativeGasUsed);

        let gaugeItem = await distributor.gauges(0);
        expect(gaugeItem.currentVotes).to.eq(parseUnits('2000', 'ether'));
        gaugeItem = await distributor.gauges(1);
        expect(gaugeItem.currentVotes).to.eq(parseUnits('1000', 'ether'));

        // wait 2 week - 100_800 blocks
        await mine(100_800);

        tx = await distributor.castVote(
            [0, 1],
            [parseUnits('2000', 'ether'), parseUnits('1000', 'ether')]
        );

        receipt = await tx.wait();
        console.log(receipt.cumulativeGasUsed);

        tx = await distributor.castVote(
            [0, 1],
            [parseUnits('2000', 'ether'), parseUnits('1000', 'ether')]
        );

        receipt = await tx.wait();
        console.log(receipt.cumulativeGasUsed);

        tx = await distributor.castVote(
            [0, 1],
            [parseUnits('2000', 'ether'), parseUnits('1000', 'ether')]
        );

        receipt = await tx.wait();
        console.log(receipt.cumulativeGasUsed);
    });

    // FIXME: ZunDistributor bug
    it.skip('Same borderBlock with block.number will revert in _castVote', async function () {
        const { vlZUN, distributor } = await loadFixture(deployFixture);

        const startBlock = await distributor.START_BLOCK();
        const lastFinalizedBlock = await distributor.lastFinalizeBlock();
        expect(startBlock).eq(lastFinalizedBlock);

        const endBlock = startBlock.add(await distributor.VOTING_PERIOD()).sub(1);
        // get current block number
        const currentBlock = await ethers.provider.getBlockNumber();
        await mine(currentBlock - endBlock);

        await expect(distributor.castVote([0, 1], [1, 1])).revertedWithCustomError(
            vlZUN,
            'ERC5805FutureLookup'
        );
    });
});
