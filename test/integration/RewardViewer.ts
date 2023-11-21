import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';
import {
    IERC20,
    RewardViewer,
    StEthEthConvexCurveStrat,
    UsdcCrvUsdStakeDaoCurve,
    UsdtCrvUsdStakeDaoCurve,
} from '../../typechain-types';
import * as addresses from '../address.json';
import { expect } from 'chai';
import { ethers } from 'hardhat';
import { createStablecoins } from '../utils/CreateStablecoins';
import { mintStables } from '../utils/MintStables';
import { createAndInitConicOracles } from '../utils/CreateAndInitConicOracles';
import { createConvertersAndRewardManagerContracts } from '../utils/CreateConvertersAndRewardManagerContracts';
import { parseUnits } from 'ethers/lib/utils';
import { increaseChainTime } from '../utils/IncreaseChainTime';
import { createPoolAndControllerZunUSD } from '../utils/CreatePoolAndControllerZunUSD';
import { getMinAmountZunUSD } from '../utils/GetMinAmountZunUSD';
import { createEthCoins } from '../utils/CreateEthCoins';
import { mintEthCoins } from '../utils/MintEthCoins';
import { createPoolAndControllerZunETH } from '../utils/CreatePoolAndControllerZunETH';
import { getMinAmountZunETH } from '../utils/GetMinAmountZunETH';

describe('Reward Viewer', async () => {
    // We define a fixture to reuse the same setup in every test.
    // We use loadFixture to run this setup once, snapshot that state,
    // and reset Hardhat Network to that snapshot in every test.
    async function deployFixture() {
        // Contracts are deployed using the first signer/account by default
        const [owner, otherAccount, otherAccount1] = await ethers.getSigners();

        const RewardViewerFactory = await ethers.getContractFactory('RewardViewer');
        const rewardViewer = (await RewardViewerFactory.deploy(
            addresses.fraxStaking.vaultEarnedViewer
        )) as RewardViewer;

        return {
            owner,
            otherAccount,
            otherAccount1,
            rewardViewer,
        };
    }

    describe('Deployment', async () => {
        it('Should correctly deploy the contracts', async () => {
            // given
            const { owner, rewardViewer } = await loadFixture(deployFixture);

            // then
            expect(await rewardViewer.owner()).to.equal(owner.address);
            expect(await rewardViewer.fraxStakingVaultEarnedViewer()).to.equal(
                addresses.fraxStaking.vaultEarnedViewer
            );
        });
    });

    describe('Set vault earned viewer address', async () => {
        it('Should set earned viewer address by the owner', async () => {
            // given
            const { rewardViewer } = await loadFixture(deployFixture);

            // when
            const transaction = rewardViewer.setFraxStakingVaultEarnedViewer(
                addresses.fraxStaking.vaultEarnedViewer
            );

            // then
            await expect(transaction)
                .to.emit(rewardViewer, 'SetFraxStakingVaultEarnedViewer')
                .withArgs(addresses.fraxStaking.vaultEarnedViewer);
            expect(await rewardViewer.fraxStakingVaultEarnedViewer()).to.equal(
                addresses.fraxStaking.vaultEarnedViewer
            );
        });
        it('Should fail on set earned viewer address by not the owner', async () => {
            // given
            const { rewardViewer, otherAccount } = await loadFixture(deployFixture);

            // when
            const transaction = rewardViewer
                .connect(otherAccount)
                .setFraxStakingVaultEarnedViewer(addresses.fraxStaking.vaultEarnedViewer);

            // then
            await expect(transaction).to.revertedWithCustomError(
                rewardViewer,
                'OwnableUnauthorizedAccount'
            );
        });
    });

    describe('Get stake-dao strategy rewards', async () => {
        it('Should return rewards for crvUSD_USDC strategy', async () => {
            // given
            const { owner, rewardViewer, otherAccount, otherAccount1 } = await loadFixture(
                deployFixture
            );
            const crvUSD_USDC_pool_addr = '0x4dece678ceceb27446b35c672dc7d61f30bad69e';
            const { dai, usdt, usdc } = createStablecoins(owner);
            await mintStables(owner, usdc);
            const { genericOracle } = await createAndInitConicOracles([crvUSD_USDC_pool_addr]);
            const { zunamiPool, zunamiPoolController } = await createPoolAndControllerZunUSD();
            const { stableConverter } = await createConvertersAndRewardManagerContracts(
                'StableConverter',
                'SellingCurveRewardManager'
            );

            const usdcCrvUsdStakeDaoCurveStrategyFactory = await ethers.getContractFactory(
                'UsdcCrvUsdStakeDaoCurve'
            );
            const usdcCrvUsdStakeDaoCurveStrategy =
                (await usdcCrvUsdStakeDaoCurveStrategyFactory.deploy()) as UsdcCrvUsdStakeDaoCurve;
            await usdcCrvUsdStakeDaoCurveStrategy.deployed();
            await usdcCrvUsdStakeDaoCurveStrategy.setZunamiPool(zunamiPool.address);
            await usdcCrvUsdStakeDaoCurveStrategy.setStableConverter(stableConverter.address);
            await usdcCrvUsdStakeDaoCurveStrategy.setPriceOracle(genericOracle.address);

            const tokenApprovedAmount = '1000000';
            await dai
                .connect(otherAccount)
                .approve(zunamiPoolController.address, parseUnits(tokenApprovedAmount, 'ether'));
            await usdc
                .connect(otherAccount)
                .approve(zunamiPoolController.address, parseUnits(tokenApprovedAmount, 'mwei'));
            await usdt
                .connect(otherAccount)
                .approve(zunamiPoolController.address, parseUnits(tokenApprovedAmount, 'mwei'));
            const tokenAmount = '10000';
            await dai.transfer(
                otherAccount.getAddress(),
                ethers.utils.parseUnits(tokenAmount, 'ether')
            );
            await usdc.transfer(
                otherAccount.getAddress(),
                ethers.utils.parseUnits(tokenAmount, 'mwei')
            );
            await usdt.transfer(
                otherAccount.getAddress(),
                ethers.utils.parseUnits(tokenAmount, 'mwei')
            );

            await zunamiPool.addStrategy(usdcCrvUsdStakeDaoCurveStrategy.address);
            await zunamiPoolController.setDefaultDepositSid(0);
            await zunamiPoolController.setDefaultWithdrawSid(0);

            await expect(
                zunamiPoolController
                    .connect(otherAccount)
                    .deposit(getMinAmountZunUSD('1000'), owner.getAddress())
            ).to.emit(zunamiPool, 'Deposited');
            await increaseChainTime(3600 * 24 * 7);

            // when
            const result = await rewardViewer.getStakeDaoVaultEarned(
                usdcCrvUsdStakeDaoCurveStrategy.address,
                usdcCrvUsdStakeDaoCurveStrategy.vault()
            );

            // then
            const tokenAddresses = result[0];
            const rewards = result[1];
            expect(tokenAddresses.length).to.equal(2);
            expect(rewards.length).to.equal(tokenAddresses.length);
            expect(tokenAddresses[0]).to.equal(addresses.crypto.sdt);
            expect(tokenAddresses[1]).to.equal(addresses.crypto.crv);
            expect(rewards[0]).to.gt(0);
            expect(rewards[1]).to.gt(0);

            await zunamiPoolController.claimRewards();

            const rewardCollector = await zunamiPoolController.rewardCollector();
            const SDT = (await ethers.getContractAt('IERC20', addresses.crypto.sdt)) as IERC20;
            const CRV = (await ethers.getContractAt('IERC20', addresses.crypto.crv)) as IERC20;
            expect(await SDT.balanceOf(rewardCollector)).to.equal(rewards[0]);
            expect(await CRV.balanceOf(rewardCollector)).to.equal(rewards[1]);
        });

        it('Should return rewards for crvUSD_USDT strategy', async () => {
            // given
            const { owner, rewardViewer, otherAccount, otherAccount1 } = await loadFixture(
                deployFixture
            );
            const crvUSD_USDT_pool_addr = '0x390f3595bca2df7d23783dfd126427cceb997bf4';
            const { dai, usdt, usdc } = createStablecoins(owner);
            await mintStables(owner, usdc);
            const { genericOracle } = await createAndInitConicOracles([crvUSD_USDT_pool_addr]);
            const { zunamiPool, zunamiPoolController } = await createPoolAndControllerZunUSD();
            const { stableConverter } = await createConvertersAndRewardManagerContracts(
                'StableConverter',
                'SellingCurveRewardManager'
            );

            const usdtCrvUsdStakeDaoCurveStrategyFactory = await ethers.getContractFactory(
                'UsdtCrvUsdStakeDaoCurve'
            );
            const usdtCrvUsdStakeDaoCurveStrategy =
                (await usdtCrvUsdStakeDaoCurveStrategyFactory.deploy()) as UsdtCrvUsdStakeDaoCurve;
            await usdtCrvUsdStakeDaoCurveStrategy.deployed();
            await usdtCrvUsdStakeDaoCurveStrategy.setZunamiPool(zunamiPool.address);
            await usdtCrvUsdStakeDaoCurveStrategy.setStableConverter(stableConverter.address);
            await usdtCrvUsdStakeDaoCurveStrategy.setPriceOracle(genericOracle.address);

            const tokenApprovedAmount = '1000000';
            await dai
                .connect(otherAccount)
                .approve(zunamiPoolController.address, parseUnits(tokenApprovedAmount, 'ether'));
            await usdc
                .connect(otherAccount)
                .approve(zunamiPoolController.address, parseUnits(tokenApprovedAmount, 'mwei'));
            await usdt
                .connect(otherAccount)
                .approve(zunamiPoolController.address, parseUnits(tokenApprovedAmount, 'mwei'));
            const tokenAmount = '10000';
            await dai.transfer(
                otherAccount.getAddress(),
                ethers.utils.parseUnits(tokenAmount, 'ether')
            );
            await usdc.transfer(
                otherAccount.getAddress(),
                ethers.utils.parseUnits(tokenAmount, 'mwei')
            );
            await usdt.transfer(
                otherAccount.getAddress(),
                ethers.utils.parseUnits(tokenAmount, 'mwei')
            );

            await zunamiPool.addStrategy(usdtCrvUsdStakeDaoCurveStrategy.address);
            await zunamiPoolController.setDefaultDepositSid(0);
            await zunamiPoolController.setDefaultWithdrawSid(0);

            await expect(
                zunamiPoolController
                    .connect(otherAccount)
                    .deposit(getMinAmountZunUSD('1000'), owner.getAddress())
            ).to.emit(zunamiPool, 'Deposited');
            await increaseChainTime(3600 * 24 * 7);

            // when
            const result = await rewardViewer.getStakeDaoVaultEarned(
                usdtCrvUsdStakeDaoCurveStrategy.address,
                usdtCrvUsdStakeDaoCurveStrategy.vault()
            );

            // then
            const tokenAddresses = result[0];
            const rewards = result[1];
            expect(tokenAddresses.length).to.equal(2);
            expect(rewards.length).to.equal(tokenAddresses.length);
            expect(tokenAddresses[0]).to.equal(addresses.crypto.sdt);
            expect(tokenAddresses[1]).to.equal(addresses.crypto.crv);
            expect(rewards[0]).to.gt(0);
            expect(rewards[1]).to.gt(0);

            await zunamiPoolController.claimRewards();

            const rewardCollector = await zunamiPoolController.rewardCollector();
            const SDT = (await ethers.getContractAt('IERC20', addresses.crypto.sdt)) as IERC20;
            const CRV = (await ethers.getContractAt('IERC20', addresses.crypto.crv)) as IERC20;
            expect(await SDT.balanceOf(rewardCollector)).to.equal(rewards[0]);
            expect(await CRV.balanceOf(rewardCollector)).to.equal(rewards[1]);
        });
    });

    describe('Get convex-curve strategy rewards', async () => {
        // TODO: fix test after changes in test/integration/ZunETHFlow.ts for 'stEthEthConvexCurveStrat' strategy
        //   it('Should return rewards for ETH_stETH strategy', async () => {
        //       // given
        //       const { owner, rewardViewer, otherAccount } = await loadFixture(deployFixture);
        //       const ETH_stETH_pool_addr = '0x21E27a5E5513D6e65C4f830167390997aA84843a';
        //       const { wEth, frxEth } = createEthCoins(owner);
        //       await mintEthCoins(owner, wEth);
        //       const { genericOracle } = await createAndInitConicOracles([ETH_stETH_pool_addr]);
        //       const { zunamiPool, zunamiPoolController } = await createPoolAndControllerZunETH();
        //       const { frxEthNativeConverter } = await createConvertersAndRewardManagerContracts(
        //           'StableConverter',
        //           'SellingCurveRewardManager'
        //       );
        //
        //       const stEthEthConvexCurveStrategyFactory = await ethers.getContractFactory(
        //           'stEthEthConvexCurveStrat'
        //       );
        //       const stEthEthConvexCurveStrategy =
        //           (await stEthEthConvexCurveStrategyFactory.deploy()) as StEthEthConvexCurveStrat;
        //       await stEthEthConvexCurveStrategy.deployed();
        //       await stEthEthConvexCurveStrategy.setZunamiPool(zunamiPool.address);
        //       await stEthEthConvexCurveStrategy.setNativeConverter(frxEthNativeConverter.address);
        //       await stEthEthConvexCurveStrategy.setPriceOracle(genericOracle.address);
        //
        //       const tokenApprovedAmount = '10000';
        //       await wEth
        //           .connect(otherAccount)
        //           .approve(zunamiPoolController.address, parseUnits(tokenApprovedAmount, 'ether'));
        //       await frxEth
        //           .connect(otherAccount)
        //           .approve(zunamiPoolController.address, parseUnits(tokenApprovedAmount, 'ether'));
        //       const tokenAmount = '100';
        //       await wEth.transfer(
        //           otherAccount.getAddress(),
        //           ethers.utils.parseUnits(tokenAmount, 'ether')
        //       );
        //       await frxEth.transfer(
        //           otherAccount.getAddress(),
        //           ethers.utils.parseUnits(tokenAmount, 'ether')
        //       );
        //
        //       await zunamiPool.addStrategy(stEthEthConvexCurveStrategy.address);
        //       await zunamiPoolController.setDefaultDepositSid(0);
        //       await zunamiPoolController.setDefaultWithdrawSid(0);
        //       await expect(
        //           zunamiPoolController
        //               .connect(otherAccount)
        //               .deposit(getMinAmountZunETH('1000'), owner.getAddress())
        //       ).to.emit(zunamiPool, 'Deposited');
        //
        //       await increaseChainTime(3600 * 24 * 7);
        //
        //       // when
        //       const result = await rewardViewer.getConvexCurveStrategyRewards(
        //           stEthEthConvexCurveStrategy.address,
        //           stEthEthConvexCurveStrategy.cvxRewards()
        //       );
        //
        //       // then
        //       expect(result.crv).gt(0);
        //       expect(result.cvx).gt(0);
        //
        //       await zunamiPoolController.claimRewards();
        //       const rewardCollector = await zunamiPoolController.rewardCollector();
        //       const CVX = (await ethers.getContractAt('IERC20', addresses.crypto.cvx)) as IERC20;
        //       const CRV = (await ethers.getContractAt('IERC20', addresses.crypto.crv)) as IERC20;
        //       expect(await CVX.balanceOf(rewardCollector)).to.equal(result.cvx);
        //       expect(await CRV.balanceOf(rewardCollector)).to.equal(result.crv);
        //   });
    });
});
