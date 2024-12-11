import {ethers, network, upgrades} from 'hardhat';
import {impersonateAccount, loadFixture, reset, setBalance, time,} from '@nomicfoundation/hardhat-network-helpers';
import {BigNumber, Signer} from 'ethers';
import {parseUnits} from 'ethers/lib/utils';
import {expect} from 'chai';

import {
  setupTokenConverterBTCs
} from '../utils/SetupTokenConverter';
import {createStrategies} from '../utils/CreateStrategies';

import {
  GenericOracle,
  ITokenConverter,
  StakingRewardDistributor,
  ZunamiPool,
  ZunamiPoolCompoundController,
} from '../../typechain-types';

import * as addresses from '../address.json';
import {deployRewardManager} from '../utils/DeployRewardManager';

import {FORK_BLOCK_NUMBER, PROVIDER_URL} from "../../hardhat.config";
import {mintTokenTo} from "../utils/MintTokenTo";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { createBtcCoins } from "../utils/CreateBtcCoins";
import { mintBtcCoins } from "../utils/MintBtcCoins";
import { getMinAmountZunBTC } from "../utils/GetMinAmountZunBTC";
import { attachPoolAndControllerZunBTC } from "../utils/AttachPoolAndControllerZunBTC";

const ADDRESS_ZERO = '0x0000000000000000000000000000000000000000';
const MINIMUM_LIQUIDITY = 1e3;

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

    if (rewardManager) {
        await zunamiPoolController.setRewardManager(rewardManager);
    }

    await zunamiPoolController.setFeeTokenId(0);

    await zunamiPoolController.setRewardTokens([
        addresses.crypto.crv,
        addresses.crypto.cvx,
        addresses.crypto.fxs,
        addresses.crypto.sdt,
    ]);
    await zunamiPool.grantRole(await zunamiPool.CONTROLLER_ROLE(), zunamiPoolController.address);
    return { zunamiPool, zunamiPoolController };
}

async function setCustomOracle(
    genericOracle: GenericOracle,
    admin: string,
    token: string,
    oracle: string
) {
    await impersonateAccount(admin);
    const impersonatedSigner = await ethers.getSigner(admin);

    // set balance to cover any tx costs
    await setBalance(admin, ethers.utils.parseEther('2').toHexString());

    await genericOracle.connect(impersonatedSigner).setCustomOracle(token, oracle);
}

async function setPoolWithdrawSid(admin: SignerWithAddress, zunamiPoolController: ZunamiPoolThroughController, withdrawSid: number) {

  const zunamiAdmin = "0xb056B9A45f09b006eC7a69770A65339586231a34";

  //fund vault with eth
  await admin.sendTransaction({
    to: zunamiAdmin,
    value: ethers.utils.parseEther('1'),
  });

  await network.provider.request({
    method: 'hardhat_impersonateAccount',
    params: [zunamiAdmin],
  });
  const zunamiAdminSigner: Signer = ethers.provider.getSigner(zunamiAdmin);

  await zunamiPoolController.connect(zunamiAdminSigner).setDefaultWithdrawSid(withdrawSid);

  await network.provider.request({
    method: 'hardhat_stopImpersonatingAccount',
    params: [zunamiAdmin],
  });
}

describe('ZunBTC APS flow tests', () => {
    const strategyApsNames = [
        'ZunBTCApsVaultStrat',
        'ZunBtcTBtcApsStakeDaoCurveStrat',
    ];

    async function deployFixture() {
        await reset(PROVIDER_URL, 21408607);

        // Contracts are deployed using the first signer/account by default
        const [admin, alice, bob, carol, feeCollector] = await ethers.getSigners();

        const { wBtc, tBtc } = createBtcCoins(admin);

        await mintBtcCoins(admin, wBtc, tBtc);

        const genericOracleAddress = '0x4142bB1ceeC0Dec4F7aaEB3D51D2Dc8E6Ee18410';
        const GenericOracleFactory = await ethers.getContractFactory('GenericOracle');
        const genericOracle = (await GenericOracleFactory.attach(
            genericOracleAddress
        )) as GenericOracle;

        const curveRouterAddr = '0xF0d4c12A5768D806021F80a262B4d39d26C58b8D';
        const TokenConverterFactory = await ethers.getContractFactory('TokenConverter');
        const tokenConverter = (await TokenConverterFactory.deploy(
            curveRouterAddr
        )) as ITokenConverter;

        await setupTokenConverterBTCs(tokenConverter);

        const rewardManager = await deployRewardManager(
            tokenConverter.address,
            genericOracleAddress
        );

        const zunBTCPoolAddress = '0x0FA308AE0ddE633b6eDE22ba719E7E0Bc45FC6dB';
        const zunBTCPoolControllerAddress = '0x8d6C5C61E815A53b1D24AC94DEEC62f31911EeB4';

        const { zunamiPool, zunamiPoolController } = await attachPoolAndControllerZunBTC(
            zunBTCPoolAddress,
            zunBTCPoolControllerAddress
        );

        console.log(zunamiPool.address);
        console.log(zunamiPoolController.address);

        const zunamiAdminAddress = '0xe9b2B067eE106A6E518fB0552F3296d22b82b32B';

        const ZunBTCOracleFactory = await ethers.getContractFactory('ZunBTCOracle');
        const zunBtcOracle = await ZunBTCOracleFactory.deploy(genericOracleAddress);
        await zunBtcOracle.deployed();

        await setCustomOracle(
          genericOracle,
          zunamiAdminAddress,
          zunBTCPoolAddress,
          zunBtcOracle.address
        );

        const StaticCurveLPOracleFactory = await ethers.getContractFactory('StaticCurveLPOracle');

        const ZunBtcTBtcPoolAddress = '0x6fBc5Ddc181240Cb1d9bcEc6Fdea429036818035';
        const staticCurveLPOracle = await StaticCurveLPOracleFactory.deploy(
          genericOracleAddress,
          [zunBTCPoolAddress, addresses.crypto.tBtc],
          [18, 18],
          ZunBtcTBtcPoolAddress
        );
        await staticCurveLPOracle.deployed();

        await setCustomOracle(
          genericOracle,
          zunamiAdminAddress,
          ZunBtcTBtcPoolAddress,
          staticCurveLPOracle.address
        );

        const { zunamiPool: zunamiPoolAps, zunamiPoolController: zunamiPoolControllerAps } =
            await createPoolAndCompoundController(zunamiPool.address, rewardManager.address);

        const strategiesAps = await createStrategies(
            strategyApsNames,
            genericOracle,
            zunamiPoolAps,
            tokenConverter,
            [zunamiPool.address, ADDRESS_ZERO, ADDRESS_ZERO, ADDRESS_ZERO, ADDRESS_ZERO],
            [1, 0, 0, 0, 0]
        );

        const tokenApprovedAmount = "100";

        for (const user of [admin, alice, bob]) {
          await wBtc
            .connect(user)
            .approve(zunamiPoolController.address, parseUnits(tokenApprovedAmount, 8));
          await tBtc
            .connect(user)
            .approve(zunamiPoolController.address, parseUnits(tokenApprovedAmount, "ether"));
        }

        const tokenAmount = "10";

        for (const user of [alice, bob]) {
          await wBtc.transfer(user.getAddress(), ethers.utils.parseUnits(tokenAmount, 8));
          await tBtc.transfer(user.getAddress(), ethers.utils.parseUnits(tokenAmount, "ether"));
        }

        return {
            admin,
            alice,
            bob,
            carol,
            feeCollector,
            zunamiPool,
            zunamiPoolController,
            tokenConverter,
            rewardManager,
            zunamiPoolAps,
            zunamiPoolControllerAps,
            strategiesAps,
            genericOracle,
            wBtc,
            tBtc,
        };
    }

    // Reset the network to the initial state
    after(async function () {
      await reset(PROVIDER_URL, FORK_BLOCK_NUMBER);
    });

    it('should deposit, withdraw and compound all rewards in all strategies', async () => {
        const {
            admin,
            zunamiPool,
            zunamiPoolController,
            zunamiPoolAps,
            zunamiPoolControllerAps,
            strategiesAps,
            tokenConverter,
        } = await loadFixture(deployFixture);

        await expect(
            zunamiPoolController
                .connect(admin)
                .deposit(getMinAmountZunBTC("1"), await admin.getAddress())
        ).to.emit(zunamiPool, 'Deposited');

        console.log("ZunBTC balance: ", (await zunamiPool.balanceOf(await admin.getAddress())).toString());

        for (let i = 0; i < strategiesAps.length; i++) {
            const strategy = strategiesAps[i];
            await zunamiPoolAps.addStrategy(strategy.address);

            await zunamiPoolControllerAps.setDefaultDepositSid(i);

            const zStableBalance = parseUnits('0.1', 'ether');

            await zunamiPool.approve(zunamiPoolControllerAps.address, zStableBalance);

            await expect(
                zunamiPoolControllerAps
                    .connect(admin)
                    .deposit([zStableBalance, 0, 0, 0, 0], admin.getAddress())
            ).to.emit(zunamiPoolAps, 'Deposited');
        }

        await zunamiPoolControllerAps.setDefaultDepositSid(0);

        expect(await zunamiPoolControllerAps.collectedManagementFee()).to.eq(0);

        await zunamiPoolControllerAps.autoCompoundAll();

        // await mintTokenTo(
        //     zunamiPoolControllerAps.address,
        //     admin,
        //     '0x4e3FBD56CD56c3e72c1403e103b45Db9da5B9D2B', // CRV
        //     '0x28C6c06298d514Db089934071355E5743bf21d60', // CRV Vault
        //     parseUnits('100', 'ether')
        // );
        //
        // await zunamiPool.transfer(zunamiPoolControllerAps.address, parseUnits('0.001', 'ether')); // zunUSD
        //
        // await zunamiPool.transfer(
        //   tokenConverter.address,
        //   ethers.utils.parseUnits('0.001', 'ether').sub(MINIMUM_LIQUIDITY)
        // );
        //
        // await zunamiPoolControllerAps.autoCompoundAll();
        // expect(await zunamiPoolControllerAps.collectedManagementFee()).to.not.eq(0);
        //
        // let collectedManagementFeeBefore = await zunamiPoolControllerAps.collectedManagementFee();
        // await zunamiPool.transfer(zunamiPoolControllerAps.address, parseUnits('0.001', 'ether'));
        // let balanceBefore = await zunamiPool.balanceOf(zunamiPoolControllerAps.address);
        // await zunamiPoolControllerAps.autoCompoundAll();
        // // expect(
        // //   balanceBefore.sub(await zunamiPool.balanceOf(zunamiPoolControllerAps.address))
        // // ).to.be.eq(parseUnits('8.5', 'ether'));
        // // expect(
        // //   (await zunamiPoolControllerAps.collectedManagementFee()).sub(
        // //     collectedManagementFeeBefore
        // //   )
        // // ).to.be.eq(parseUnits('1.5', 'ether'));
        //
        // collectedManagementFeeBefore = await zunamiPoolControllerAps.collectedManagementFee();
        // await zunamiPool.transfer(zunamiPoolControllerAps.address, parseUnits('0.002', 'ether'));
        // balanceBefore = await zunamiPool.balanceOf(zunamiPoolControllerAps.address);
        // await zunamiPoolControllerAps.autoCompoundAll();
        // // expect(
        // //   balanceBefore.sub(await zunamiPool.balanceOf(zunamiPoolControllerAps.address))
        // // ).to.be.eq(parseUnits('17', 'ether'));
        // // expect(
        // //   (await zunamiPoolControllerAps.collectedManagementFee()).sub(
        // //     collectedManagementFeeBefore
        // //   )
        // // ).to.be.eq(parseUnits('3', 'ether'));
        //
        // expect(await zunamiPool.balanceOf(zunamiPoolControllerAps.address)).to.eq(
        //   await zunamiPoolControllerAps.collectedManagementFee()
        // );
        //
        // await zunamiPoolControllerAps.claimManagementFee();
        //
        // expect(await zunamiPoolControllerAps.collectedManagementFee()).to.eq(0);
        //
        // const sharesAmount = BigNumber.from(
        //     await zunamiPoolControllerAps.balanceOf(admin.getAddress())
        // );
        // expect(sharesAmount).to.gt(0);
        //
        // await time.increase(604800);

      console.log("Shares amount: ", sharesAmount.toString());
        const withdrawAmount = ethers.utils.parseUnits('0.09', 'ether').sub(MINIMUM_LIQUIDITY);
        for (let i = 0; i < strategiesAps.length; i++) {
            let assetsBefore = BigNumber.from(await zunamiPool.balanceOf(admin.getAddress()));

            await zunamiPoolControllerAps.setDefaultWithdrawSid(i);

            const sharesAmountBefore = BigNumber.from(
                await zunamiPoolControllerAps.balanceOf(admin.getAddress())
            );

            await expect(
                zunamiPoolControllerAps.withdraw(
                    withdrawAmount,
                    [0, 0, 0, 0, 0],
                    admin.getAddress()
                )
            ).to.emit(zunamiPoolAps, 'Withdrawn');

            const sharesAmountAfter = BigNumber.from(
                await zunamiPoolControllerAps.balanceOf(admin.getAddress())
            );
            expect(sharesAmountBefore).to.gt(sharesAmountAfter);

            expect(
                BigNumber.from(await zunamiPool.balanceOf(admin.getAddress())).sub(assetsBefore)
            ).to.gt(0);
        }
    });

    it('should inflate and deflate', async () => {
        const {
            admin,
            alice,
            zunamiPool,
            zunamiPoolController,
            zunamiPoolAps,
            zunamiPoolControllerAps,
            strategiesAps,
        } = await loadFixture(deployFixture);

        const withdrawSid = 2;
        await setPoolWithdrawSid(admin, zunamiPoolController, withdrawSid);

        await expect(
            zunamiPoolController
                .connect(admin)
                .deposit(getMinAmountZunBTC('0.1'), admin.getAddress())
        ).to.emit(zunamiPool, 'Deposited');

        const sid = 0;
        const strategy = strategiesAps[1];
        await zunamiPoolAps.addStrategy(strategy.address);

        await zunamiPoolControllerAps.setDefaultDepositSid(sid);

        const zStableBalance = parseUnits('0.1', 'ether');

        await zunamiPool.approve(zunamiPoolControllerAps.address, zStableBalance);

        await expect(
            zunamiPoolControllerAps
                .connect(admin)
                .deposit([zStableBalance, 0, 0, 0, 0], admin.getAddress())
        ).to.emit(zunamiPoolAps, 'Deposited');

        await time.increase(604800);

        await expect(strategy.connect(alice).inflate(100, 100)).to.be.revertedWithCustomError(
            strategy,
            `AccessControlUnauthorizedAccount`
        );

        await time.increase(604800);

        await expect(strategy.connect(alice).deflate(100, 100)).to.be.revertedWithCustomError(
            strategy,
            `AccessControlUnauthorizedAccount`
        );

        await time.increase(604800);

        let holdingsBefore = await zunamiPoolAps.totalHoldings();
        await strategy.connect(admin).inflate(parseUnits('0.33333', 'ether'), 0);
        let holdingsAfterInflation = await zunamiPoolAps.totalHoldings();
        expect(holdingsAfterInflation).to.lt(holdingsBefore);

        await time.increase(604800);

        await strategy.connect(admin).deflate(parseUnits('0.6666666', 'ether'), 0);
        expect(await zunamiPoolAps.totalHoldings()).to.gt(holdingsAfterInflation);

        await time.increase(604800);

        holdingsBefore = await zunamiPoolAps.totalHoldings();
        await strategy.connect(admin).inflate(parseUnits('1', 'ether'), 0);
        holdingsAfterInflation = await zunamiPoolAps.totalHoldings();
        expect(holdingsAfterInflation).to.lt(holdingsBefore);

        await time.increase(604800);

        await strategy.connect(admin).deflate(parseUnits('1', 'ether'), 0);
        expect(await zunamiPoolAps.totalHoldings()).to.gt(holdingsAfterInflation);
    });

  // it('should deposit and withdraw using launching zap', async () => {
  //   const {
  //     admin,
  //     zunamiPool,
  //     zunamiPoolAps,
  //     zunamiPoolControllerAps,
  //     tokenConverter,
  //     wBtc,
  //     tBtc,
  //     strategiesAps,
  //     genericOracle,
  //   } = await loadFixture(deployFixture);
  //
  //   // Add strategies to omnipool and aps pool
  //   const sid = 0;
  //   await zunamiPoolAps.addStrategy(strategiesAps[sid].address);
  //
  //
  //   const StakingRewardDistributorFactory = await ethers.getContractFactory(
  //     'StakingRewardDistributor'
  //   );
  //
  //   const instance = await upgrades.deployProxy(
  //     StakingRewardDistributorFactory,
  //     [zunamiPoolControllerAps.address, 'LP', 'LP', admin.address],
  //     {
  //       kind: 'uups',
  //     }
  //   );
  //   await instance.deployed();
  //
  //   const stakingRewardDistributor = instance as StakingRewardDistributor;
  //
  //   const zunAddress = '0x6b5204b0be36771253cc38e88012e02b752f0f36';
  //   //deploy zap
  //   const ZunamiDepositZapFactory = await ethers.getContractFactory('ZunamiEthZap');
  //   const zunamiDepositZap = (await ZunamiDepositZapFactory.deploy(
  //     zunamiPool.address,
  //     zunamiPoolControllerAps.address,
  //     stakingRewardDistributor.address,
  //     tokenConverter.address,
  //     genericOracle.address,
  //     zunAddress
  //   )) as ZunamiDepositZap;
  //
  //   expect(await zunamiPoolControllerAps.balanceOf(admin.getAddress())).to.eq(0);
  //
  //   const tokenAmount = '0.1';
  //   await wBtc
  //     .connect(admin)
  //     .approve(zunamiDepositZap.address, parseUnits(tokenAmount, 'ether'));
  //   await tBtc
  //     .connect(admin)
  //     .approve(zunamiDepositZap.address, parseUnits(tokenAmount, 'ether'));
  //
  //   await zunamiDepositZap
  //     .connect(admin)
  //     .deposit(getMinAmountZunETH(tokenAmount), admin.getAddress(), {value:   parseUnits(tokenAmount, 'ether')});
  //
  //   expect(await stakingRewardDistributor.balanceOf(admin.getAddress())).to.closeTo(parseUnits("30", 'ether'), parseUnits("0.3", 'ether'));
  // });
  //
  // it('should mint zunBTC using stable zap', async () => {
  //   const {
  //     admin,
  //     bob,
  //     carol,
  //     zunamiPool,
  //     zunamiPoolController,
  //     wBtc,
  //     tBtc,
  //     genericOracle,
  //   } = await loadFixture(deployFixture);
  //
  //   await setPoolWithdrawSid(admin, zunamiPoolController, 0);
  //
  //   const dailyMintDuration = 24 * 60 * 60; // 1 day in seconds
  //   const dailyMintLimit = ethers.utils.parseUnits('275', "ether"); // 1100000 / 4000
  //   const dailyRedeemDuration = 24 * 60 * 60; // 1 day in seconds;
  //   const dailyRedeemLimit = ethers.utils.parseUnits('25', "ether"); // 100000 / 4000
  //
  //   //deploy zap
  //   const ZunamiStableZapFactory = await ethers.getContractFactory('ZunamiStableZap3');
  //   const zunamiStableZap = (await ZunamiStableZapFactory.deploy(
  //     zunamiPoolController.address,
  //     genericOracle.address,
  //     dailyMintDuration,
  //     dailyMintLimit,
  //     dailyRedeemDuration,
  //     dailyRedeemLimit,
  //     '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
  //     5000,
  //     bob.address
  //   )) as ZunamiStableZap2;
  //
  //   expect(await zunamiPool.balanceOf(admin.getAddress())).to.eq(0);
  //
  //   const approveAmount = '300';
  //   await wBtc
  //     .connect(admin)
  //     .approve(zunamiStableZap.address, parseUnits(approveAmount, 'ether'));
  //   await tBtc
  //     .connect(admin)
  //     .approve(zunamiStableZap.address, parseUnits(approveAmount, 'ether'));
  //
  //   await expect(zunamiStableZap
  //     .connect(admin)
  //     .mint(getMinAmountZunETH('150'), admin.getAddress(), 0)
  //   ).to.be.revertedWithCustomError(
  //     zunamiStableZap,
  //     `DailyMintLimitOverflow`
  //   );
  //
  //   const mintAmountStable = await zunamiStableZap.estimateMint(getMinAmountZunETH('100'));
  //
  //   await expect(zunamiStableZap
  //     .connect(admin)
  //     .mint(getMinAmountZunETH('100'), admin.getAddress(), parseUnits("201", 'ether'))
  //   ).to.be.revertedWithCustomError(
  //     zunamiStableZap,
  //     `BrokenMinimumAmount`
  //   );
  //
  //   await zunamiStableZap
  //     .connect(admin)
  //     .mint(getMinAmountZunBTC("10"), admin.getAddress(), mintAmountStable);
  //
  //   expect(await zunamiPool.balanceOf(admin.getAddress())).to.eq(parseUnits("200", 'ether'));
  //   expect(await wBtc.balanceOf(zunamiStableZap.address)).to.eq(0);
  //   expect(await tBtc.balanceOf(zunamiStableZap.address)).to.eq(0);
  //   expect(await wBtc.balanceOf(carol.getAddress())).to.eq(0);
  //   expect(await tBtc.balanceOf(carol.getAddress())).to.eq(0);
  //
  //   await zunamiPool
  //     .connect(admin)
  //     .approve(zunamiStableZap.address, parseUnits("50", 'ether'));
  //
  //   await expect(zunamiStableZap
  //     .connect(admin)
  //     .redeem(parseUnits("50", 'ether'),  admin.getAddress(), 0)
  //   ).to.be.revertedWithCustomError(
  //     zunamiStableZap,
  //     `DailyRedeemLimitOverflow`
  //   );
  //
  //   await expect(zunamiStableZap
  //     .connect(admin)
  //     .redeem(parseUnits("25", 'ether'),  carol.getAddress(), parseUnits("25.1", 'ether'))
  //   ).to.be.revertedWithCustomError(
  //     zunamiStableZap,
  //     `BrokenMinimumAmount`
  //   );
  //
  //   await zunamiStableZap
  //     .connect(admin)
  //     .redeem(parseUnits("25", 'ether'),  carol.getAddress(), parseUnits("24.85", 'ether')) // minus 0.005% fee
  //
  //   expect(await zunamiPool.balanceOf(admin.getAddress())).to.eq(parseUnits("175", 'ether'));
  //   expect(await wBtc.balanceOf(zunamiStableZap.address)).to.eq(0);
  //   expect(await tBtc.balanceOf(zunamiStableZap.address)).to.eq(0);
  //   expect(await zunamiPool.balanceOf(bob.getAddress())).to.eq(parseUnits("0.125", 'ether'));
  //   expect(await wBtc.balanceOf(carol.getAddress())).to.eq(parseUnits("12.4375", 'ether'));
  //   expect(await tBtc.balanceOf(carol.getAddress())).to.eq(parseUnits("12.4375", 'ether'));
  //
  //   await time.increase(dailyRedeemDuration);
  //
  //   await zunamiStableZap
  //     .connect(admin)
  //     .mint(getMinAmountZunBTC("10"), admin.getAddress(), 0);
  //
  //   expect(await zunamiPool.balanceOf(admin.getAddress())).to.eq(parseUnits("375", 'ether'));
  // });
});
