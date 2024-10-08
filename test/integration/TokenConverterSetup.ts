import { ethers, network } from 'hardhat';
import { expect } from 'chai';
import chai from 'chai';
import { Contract } from '@ethersproject/contracts';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import {
    setupTokenConverterStables,
    setupTokenConverterETHs,
    setupTokenConverterRewards,
    setupTokenConverterCrvUsdToZunEth,
    setupTokenConverterFxnToZunUsd,
    setupTokenConverterWEthPxEthAndReverse,
    setupTokenConverterStablesFrax,
} from '../utils/SetupTokenConverter.js';

import * as addresses from '../address.json';
import { Address } from 'hardhat-deploy/dist/types';

chai.should(); // if you like should syntax

export const tokenify = (value: any) => ethers.utils.parseUnits(value, 18);
export const stablify = (value: any) => ethers.utils.parseUnits(value, 6);

async function sendTokens(
    impersonate: Address,
    to: Address,
    tokenAddr: Address,
    amount: any,
    admin: SignerWithAddress
) {
    await network.provider.request({
        method: 'hardhat_impersonateAccount',
        params: [impersonate],
    });
    const whale = await ethers.getSigner(impersonate);

    await admin.sendTransaction({
        to: whale.address,
        value: ethers.utils.parseEther('1.0'),
    });

    const TokenFactory = await ethers.getContractFactory('ERC20Token', admin);
    const token = TokenFactory.attach(tokenAddr);
    await token.connect(whale).transfer(to, amount);
}

describe('Token Converter', () => {
    let admin: SignerWithAddress;
    let alice: SignerWithAddress;
    let bob: SignerWithAddress;

    let tokenConverter: Contract;

    beforeEach(async () => {
        [admin, alice, bob] = await ethers.getSigners();

        const TokenConverterFactory = await ethers.getContractFactory('TokenConverter', admin);

        tokenConverter = await TokenConverterFactory.deploy(
            '0xF0d4c12A5768D806021F80a262B4d39d26C58b8D'
        );
        await setupTokenConverterStables(tokenConverter);
        await setupTokenConverterETHs(tokenConverter);
        await setupTokenConverterRewards(tokenConverter);
        await setupTokenConverterCrvUsdToZunEth(tokenConverter);
        await setupTokenConverterFxnToZunUsd(tokenConverter);
        await setupTokenConverterWEthPxEthAndReverse(tokenConverter);
        await setupTokenConverterStablesFrax(tokenConverter);
    });

    describe('USDT', () => {
        it('should swap USDT to USDC', async () => {
            const tokenInAddr = addresses.stablecoins.usdt;
            const tokenOutAddr = addresses.stablecoins.usdc;
            const impersonate = '0xF977814e90dA44bFA03b6295A0616a897441aceC';
            const amount = stablify('100');
            const minAmountOut = stablify('99');

            const tokenIn = await ethers.getContractAt('ERC20Token', tokenInAddr);
            const tokenOut = await ethers.getContractAt('ERC20Token', tokenOutAddr);
            await sendTokens(impersonate, alice.address, tokenIn.address, amount, admin);

            const balanceBefore = await tokenOut.balanceOf(alice.address);
            await tokenIn.connect(alice).transfer(tokenConverter.address, amount);
            await tokenConverter
                .connect(alice)
                .handle(tokenInAddr, tokenOutAddr, amount, minAmountOut);

            expect(await tokenOut.balanceOf(alice.address)).to.be.gt(balanceBefore);
        });

        it('should swap USDT to DAI', async () => {
            const tokenInAddr = addresses.stablecoins.usdt;
            const tokenOutAddr = addresses.stablecoins.dai;
            const impersonate = '0xF977814e90dA44bFA03b6295A0616a897441aceC';
            const amount = stablify('100');
            const minAmountOut = stablify('99');

            const tokenIn = await ethers.getContractAt('ERC20Token', tokenInAddr);
            const tokenOut = await ethers.getContractAt('ERC20Token', tokenOutAddr);
            await sendTokens(impersonate, alice.address, tokenIn.address, amount, admin);

            const balanceBefore = await tokenOut.balanceOf(alice.address);
            await tokenIn.connect(alice).transfer(tokenConverter.address, amount);
            await tokenConverter.connect(alice).handle(tokenInAddr, tokenOutAddr, amount, minAmountOut);

            expect(await tokenOut.balanceOf(alice.address)).to.be.gt(balanceBefore);
        });

        it('should swap USDT to crvUSD', async () => {
            const tokenInAddr = addresses.stablecoins.usdt;
            const tokenOutAddr = addresses.stablecoins.crvUSD;
            const impersonate = '0xF977814e90dA44bFA03b6295A0616a897441aceC';
            const amount = stablify('100');
            const minAmountOut = stablify('99');

            const tokenIn = await ethers.getContractAt('ERC20Token', tokenInAddr);
            const tokenOut = await ethers.getContractAt('ERC20Token', tokenOutAddr);
            await sendTokens(impersonate, alice.address, tokenIn.address, amount, admin);

            const balanceBefore = await tokenOut.balanceOf(alice.address);
            await tokenIn.connect(alice).transfer(tokenConverter.address, amount);
            await tokenConverter.connect(alice).handle(tokenInAddr, tokenOutAddr, amount, minAmountOut);

            expect(await tokenOut.balanceOf(alice.address)).to.be.gt(balanceBefore);
        });

        it('should swap USDT to zunUSD', async () => {
            const tokenInAddr = addresses.stablecoins.usdt;
            const tokenOutAddr = addresses.stablecoins.zunUSD;
            const impersonate = '0xF977814e90dA44bFA03b6295A0616a897441aceC';
            const amount = stablify('100');
            const minAmountOut = stablify('99');

            const tokenIn = await ethers.getContractAt('ERC20Token', tokenInAddr);
            const tokenOut = await ethers.getContractAt('ERC20Token', tokenOutAddr);
            await sendTokens(impersonate, alice.address, tokenIn.address, amount, admin);

            const balanceBefore = await tokenOut.balanceOf(alice.address);
            await tokenIn.connect(alice).transfer(tokenConverter.address, amount);
            await tokenConverter.connect(alice).handle(tokenInAddr, tokenOutAddr, amount, minAmountOut);

            expect(await tokenOut.balanceOf(alice.address)).to.be.gt(balanceBefore);
        });
    });

    describe('USDC', () => {
        it('should swap USDC to USDT', async () => {
            const tokenInAddr = addresses.stablecoins.usdc;
            const tokenOutAddr = addresses.stablecoins.usdt;
            const impersonate = '0x28C6c06298d514Db089934071355E5743bf21d60';
            const amount = stablify('100');
            const minAmountOut = stablify('99');

            const tokenIn = await ethers.getContractAt('ERC20Token', tokenInAddr);
            const tokenOut = await ethers.getContractAt('ERC20Token', tokenOutAddr);
            await sendTokens(impersonate, alice.address, tokenIn.address, amount, admin);

            const balanceBefore = await tokenOut.balanceOf(alice.address);
            await tokenIn.connect(alice).transfer(tokenConverter.address, amount);
            await tokenConverter
                .connect(alice)
                .handle(tokenInAddr, tokenOutAddr, amount, minAmountOut);

            expect(await tokenOut.balanceOf(alice.address)).to.be.gt(balanceBefore);
        });

        it('should swap USDC to DAI', async () => {
            const tokenInAddr = addresses.stablecoins.usdc;
            const tokenOutAddr = addresses.stablecoins.dai;
            const impersonate = '0x28C6c06298d514Db089934071355E5743bf21d60';
            const amount = stablify('100');
            const minAmountOut = tokenify('99');

            const tokenIn = await ethers.getContractAt('ERC20Token', tokenInAddr);
            const tokenOut = await ethers.getContractAt('ERC20Token', tokenOutAddr);
            await sendTokens(impersonate, alice.address, tokenIn.address, amount, admin);

            const balanceBefore = await tokenOut.balanceOf(alice.address);
            await tokenIn.connect(alice).transfer(tokenConverter.address, amount);
            await tokenConverter
                .connect(alice)
                .handle(tokenInAddr, tokenOutAddr, amount, minAmountOut);

            expect(await tokenOut.balanceOf(alice.address)).to.be.gt(balanceBefore);
        });

        it('should swap USDC to crvUSD', async () => {
            const tokenInAddr = addresses.stablecoins.usdc;
            const tokenOutAddr = addresses.stablecoins.crvUSD;
            const impersonate = '0x28C6c06298d514Db089934071355E5743bf21d60';
            const amount = stablify('100');
            const minAmountOut = tokenify('99');

            const tokenIn = await ethers.getContractAt('ERC20Token', tokenInAddr);
            const tokenOut = await ethers.getContractAt('ERC20Token', tokenOutAddr);
            await sendTokens(impersonate, alice.address, tokenIn.address, amount, admin);

            const balanceBefore = await tokenOut.balanceOf(alice.address);
            await tokenIn.connect(alice).transfer(tokenConverter.address, amount);
            await tokenConverter
                .connect(alice)
                .handle(tokenInAddr, tokenOutAddr, amount, minAmountOut);

            expect(await tokenOut.balanceOf(alice.address)).to.be.gt(balanceBefore);
        });

        it('should swap USDC to zunUSD', async () => {
            const tokenInAddr = addresses.stablecoins.usdc;
            const tokenOutAddr = addresses.stablecoins.zunUSD;
            const impersonate = '0x28C6c06298d514Db089934071355E5743bf21d60';
            const amount = stablify('100');
            const minAmountOut = tokenify('99');

            const tokenIn = await ethers.getContractAt('ERC20Token', tokenInAddr);
            const tokenOut = await ethers.getContractAt('ERC20Token', tokenOutAddr);
            await sendTokens(impersonate, alice.address, tokenIn.address, amount, admin);

            const balanceBefore = await tokenOut.balanceOf(alice.address);
            await tokenIn.connect(alice).transfer(tokenConverter.address, amount);
            await tokenConverter
                .connect(alice)
                .handle(tokenInAddr, tokenOutAddr, amount, minAmountOut);

            expect(await tokenOut.balanceOf(alice.address)).to.be.gt(balanceBefore);
        });
    });

    describe('DAI', () => {
        it('should swap DAI to USDT', async () => {
            const tokenInAddr = addresses.stablecoins.dai;
            const tokenOutAddr = addresses.stablecoins.usdt;
            const impersonate = '0xD1668fB5F690C59Ab4B0CAbAd0f8C1617895052B';
            const amount = tokenify('100');
            const minAmountOut = stablify('99');

            const tokenIn = await ethers.getContractAt('ERC20Token', tokenInAddr);
            const tokenOut = await ethers.getContractAt('ERC20Token', tokenOutAddr);
            await sendTokens(impersonate, alice.address, tokenIn.address, amount, admin);

            const balanceBefore = await tokenOut.balanceOf(alice.address);
            await tokenIn.connect(alice).transfer(tokenConverter.address, amount);
            await tokenConverter
                .connect(alice)
                .handle(tokenInAddr, tokenOutAddr, amount, minAmountOut);

            expect(await tokenOut.balanceOf(alice.address)).to.be.gt(balanceBefore);
        });

        it('should swap DAI to USDC', async () => {
            const tokenInAddr = addresses.stablecoins.dai;
            const tokenOutAddr = addresses.stablecoins.usdc;
            const impersonate = '0xD1668fB5F690C59Ab4B0CAbAd0f8C1617895052B';
            const amount = tokenify('100');
            const minAmountOut = stablify('99');

            const tokenIn = await ethers.getContractAt('ERC20Token', tokenInAddr);
            const tokenOut = await ethers.getContractAt('ERC20Token', tokenOutAddr);
            await sendTokens(impersonate, alice.address, tokenIn.address, amount, admin);

            const balanceBefore = await tokenOut.balanceOf(alice.address);
            await tokenIn.connect(alice).transfer(tokenConverter.address, amount);
            await tokenConverter
                .connect(alice)
                .handle(tokenInAddr, tokenOutAddr, amount, minAmountOut);

            expect(await tokenOut.balanceOf(alice.address)).to.be.gt(balanceBefore);
        });

        it('should swap DAI to crvUSD', async () => {
            const tokenInAddr = addresses.stablecoins.dai;
            const tokenOutAddr = addresses.stablecoins.crvUSD;
            const impersonate = '0xD1668fB5F690C59Ab4B0CAbAd0f8C1617895052B';
            const amount = tokenify('100');
            const minAmountOut = tokenify('99');

            const tokenIn = await ethers.getContractAt('ERC20Token', tokenInAddr);
            const tokenOut = await ethers.getContractAt('ERC20Token', tokenOutAddr);
            await sendTokens(impersonate, alice.address, tokenIn.address, amount, admin);

            const balanceBefore = await tokenOut.balanceOf(alice.address);
            await tokenIn.connect(alice).transfer(tokenConverter.address, amount);
            await tokenConverter
                .connect(alice)
                .handle(tokenInAddr, tokenOutAddr, amount, minAmountOut);

            expect(await tokenOut.balanceOf(alice.address)).to.be.gt(balanceBefore);
        });

        it('should swap DAI to zunUSD', async () => {
            const tokenInAddr = addresses.stablecoins.dai;
            const tokenOutAddr = addresses.stablecoins.zunUSD;
            const impersonate = '0xD1668fB5F690C59Ab4B0CAbAd0f8C1617895052B';
            const amount = tokenify('100');
            const minAmountOut = tokenify('99');

            const tokenIn = await ethers.getContractAt('ERC20Token', tokenInAddr);
            const tokenOut = await ethers.getContractAt('ERC20Token', tokenOutAddr);
            await sendTokens(impersonate, alice.address, tokenIn.address, amount, admin);

            const balanceBefore = await tokenOut.balanceOf(alice.address);
            await tokenIn.connect(alice).transfer(tokenConverter.address, amount);
            await tokenConverter
                .connect(alice)
                .handle(tokenInAddr, tokenOutAddr, amount, minAmountOut);

            expect(await tokenOut.balanceOf(alice.address)).to.be.gt(balanceBefore);
        });
    });

    describe('crvUSD', () => {
        it('should swap crvUSD to USDT', async () => {
            const tokenInAddr = addresses.stablecoins.crvUSD;
            const tokenOutAddr = addresses.stablecoins.usdt;
            const impersonate = '0x0a7b9483030994016567b3B1B4bbB865578901Cb';
            const amount = tokenify('100');
            const minAmountOut = stablify('99');

            const tokenIn = await ethers.getContractAt('ERC20Token', tokenInAddr);
            const tokenOut = await ethers.getContractAt('ERC20Token', tokenOutAddr);
            await sendTokens(impersonate, alice.address, tokenIn.address, amount, admin);

            const balanceBefore = await tokenOut.balanceOf(alice.address);
            await tokenIn.connect(alice).transfer(tokenConverter.address, amount);
            await tokenConverter
                .connect(alice)
                .handle(tokenInAddr, tokenOutAddr, amount, minAmountOut);

            expect(await tokenOut.balanceOf(alice.address)).to.be.gt(balanceBefore);
        });

        it('should swap crvUSD to USDC', async () => {
            const tokenInAddr = addresses.stablecoins.crvUSD;
            const tokenOutAddr = addresses.stablecoins.usdc;
            const impersonate = '0x0a7b9483030994016567b3B1B4bbB865578901Cb';
            const amount = tokenify('100');
            const minAmountOut = stablify('99');

            const tokenIn = await ethers.getContractAt('ERC20Token', tokenInAddr);
            const tokenOut = await ethers.getContractAt('ERC20Token', tokenOutAddr);
            await sendTokens(impersonate, alice.address, tokenIn.address, amount, admin);

            const balanceBefore = await tokenOut.balanceOf(alice.address);
            await tokenIn.connect(alice).transfer(tokenConverter.address, amount);
            await tokenConverter
                .connect(alice)
                .handle(tokenInAddr, tokenOutAddr, amount, minAmountOut);

            expect(await tokenOut.balanceOf(alice.address)).to.be.gt(balanceBefore);
        });

        it('should swap crvUSD to DAI', async () => {
            const tokenInAddr = addresses.stablecoins.crvUSD;
            const tokenOutAddr = addresses.stablecoins.dai;
            const impersonate = '0x0a7b9483030994016567b3B1B4bbB865578901Cb';
            const amount = tokenify('100');
            const minAmountOut = tokenify('99');

            const tokenIn = await ethers.getContractAt('ERC20Token', tokenInAddr);
            const tokenOut = await ethers.getContractAt('ERC20Token', tokenOutAddr);
            await sendTokens(impersonate, alice.address, tokenIn.address, amount, admin);

            const balanceBefore = await tokenOut.balanceOf(alice.address);
            await tokenIn.connect(alice).transfer(tokenConverter.address, amount);
            await tokenConverter
                .connect(alice)
                .handle(tokenInAddr, tokenOutAddr, amount, minAmountOut);

            expect(await tokenOut.balanceOf(alice.address)).to.be.gt(balanceBefore);
        });

        it('should swap crvUSD to zunUSD', async () => {
            const tokenInAddr = addresses.stablecoins.crvUSD;
            const tokenOutAddr = addresses.stablecoins.zunUSD;
            const impersonate = '0x0a7b9483030994016567b3B1B4bbB865578901Cb';
            const amount = tokenify('100');
            const minAmountOut = tokenify('99');

            const tokenIn = await ethers.getContractAt('ERC20Token', tokenInAddr);
            const tokenOut = await ethers.getContractAt('ERC20Token', tokenOutAddr);
            await sendTokens(impersonate, alice.address, tokenIn.address, amount, admin);

            const balanceBefore = await tokenOut.balanceOf(alice.address);
            await tokenIn.connect(alice).transfer(tokenConverter.address, amount);
            await tokenConverter
                .connect(alice)
                .handle(tokenInAddr, tokenOutAddr, amount, minAmountOut);

            expect(await tokenOut.balanceOf(alice.address)).to.be.gt(balanceBefore);
        });

        it('should swap crvUSD to zunETH', async () => {
          const tokenInAddr = addresses.stablecoins.crvUSD;
          const tokenOutAddr = addresses.crypto.zunETH;
          const impersonate = '0xDDE9aE3266277609E21ECDAE9A0fba85a62bd92c';
          const amount = tokenify('100');
          const minAmountOut = tokenify('0.03');

          const tokenIn = await ethers.getContractAt('ERC20Token', tokenInAddr);
          const tokenOut = await ethers.getContractAt('ERC20Token', tokenOutAddr);

          await sendTokens(impersonate, alice.address, tokenIn.address, amount, admin);

          const balanceBefore = await tokenOut.balanceOf(alice.address);
          await tokenIn.connect(alice).transfer(tokenConverter.address, amount);
          await tokenConverter
            .connect(alice)
            .handle(tokenInAddr, tokenOutAddr, amount, minAmountOut);

          expect(await tokenOut.balanceOf(alice.address)).to.be.gt(balanceBefore);
        });
    });

    describe('FrxETH', () => {
        it('should swap FrxETH to WETH', async () => {
            const tokenInAddr = addresses.crypto.frxETH;
            const tokenOutAddr = addresses.crypto.wEth;
            const impersonate = '0x48c6074fFcB8fb67D75CCD06571B42542ED82555';
            const amount = tokenify('1');
            const minAmountOut = tokenify('0.98');

            const tokenIn = await ethers.getContractAt('ERC20Token', tokenInAddr);
            const tokenOut = await ethers.getContractAt('ERC20Token', tokenOutAddr);
            await sendTokens(impersonate, alice.address, tokenIn.address, tokenify('1'), admin);

            const balanceBefore = await tokenOut.balanceOf(alice.address);
            await tokenIn.connect(alice).transfer(tokenConverter.address, amount);
            await tokenConverter
                .connect(alice)
                .handle(tokenInAddr, tokenOutAddr, amount, minAmountOut);

            expect(await tokenOut.balanceOf(alice.address)).to.be.gt(balanceBefore);
        });

        it('should swap FrxETH to zunETH', async () => {
            const tokenInAddr = addresses.crypto.frxETH;
            const tokenOutAddr = addresses.crypto.zunETH;
            const impersonate = '0x48c6074fFcB8fb67D75CCD06571B42542ED82555';
            const amount = tokenify('1');
            // const minAmountOut = tokenify('0.98');
            const minAmountOut = 0;

            const tokenIn = await ethers.getContractAt('ERC20Token', tokenInAddr);
            const tokenOut = await ethers.getContractAt('ERC20Token', tokenOutAddr);
            await sendTokens(impersonate, alice.address, tokenIn.address, tokenify('1'), admin);

            const balanceBefore = await tokenOut.balanceOf(alice.address);
            await tokenIn.connect(alice).transfer(tokenConverter.address, amount);
            await tokenConverter
                .connect(alice)
                .handle(tokenInAddr, tokenOutAddr, amount, minAmountOut);

            expect(await tokenOut.balanceOf(alice.address)).to.be.gt(balanceBefore);
        });
    });

    describe('WETH', () => {
        it('should swap WETH to FrxETH', async () => {
            const tokenInAddr = addresses.crypto.wEth;
            const tokenOutAddr = addresses.crypto.frxETH;
            const impersonate = '0x57757E3D981446D585Af0D9Ae4d7DF6D64647806';
            const amount = tokenify('1');
            const minAmountOut = tokenify('0.98');

            const tokenIn = await ethers.getContractAt('ERC20Token', tokenInAddr);
            const tokenOut = await ethers.getContractAt('ERC20Token', tokenOutAddr);
            await sendTokens(impersonate, alice.address, tokenIn.address, tokenify('1'), admin);

            const balanceBefore = await tokenOut.balanceOf(alice.address);
            await tokenIn.connect(alice).transfer(tokenConverter.address, amount);
            await tokenConverter
                .connect(alice)
                .handle(tokenInAddr, tokenOutAddr, amount, minAmountOut);

            expect(await tokenOut.balanceOf(alice.address)).to.be.gt(balanceBefore);
        });

        it('should swap WETH to zunETH', async () => {
            const tokenInAddr = addresses.crypto.wEth;
            const tokenOutAddr = addresses.crypto.zunETH;
            const impersonate = '0x57757E3D981446D585Af0D9Ae4d7DF6D64647806';
            const amount = tokenify('1');
            const minAmountOut = tokenify('0.98');

            const tokenIn = await ethers.getContractAt('ERC20Token', tokenInAddr);
            const tokenOut = await ethers.getContractAt('ERC20Token', tokenOutAddr);
            await sendTokens(impersonate, alice.address, tokenIn.address, tokenify('1'), admin);

            const balanceBefore = await tokenOut.balanceOf(alice.address);
            await tokenIn.connect(alice).transfer(tokenConverter.address, amount);
            await tokenConverter
                .connect(alice)
                .handle(tokenInAddr, tokenOutAddr, amount, minAmountOut);

            expect(await tokenOut.balanceOf(alice.address)).to.be.gt(balanceBefore);
        });
    });

    describe('zunETH', () => {
        it('should swap zunETH to FrxETH', async () => {
            const tokenInAddr = addresses.crypto.zunETH;
            const tokenOutAddr = addresses.crypto.frxETH;
            const impersonate = '0x48c6074fFcB8fb67D75CCD06571B42542ED82555';

            await network.provider.request({
                method: 'hardhat_impersonateAccount',
                params: [impersonate],
            });
            const whale = await ethers.getSigner(impersonate);
            await admin.sendTransaction({
                to: whale.address,
                value: ethers.utils.parseEther('10.0'),
            });
            const pool = await ethers.getContractAt(
                'ICurvePoolN',
                '0x3a65cbaebbfecbea5d0cb523ab56fdbda7ff9aaa'
            );
            const token = await ethers.getContractAt('ERC20Token', tokenOutAddr);
            await token.connect(whale).approve(pool.address, ethers.constants.MaxUint256);
            await pool.connect(whale).exchange(1, 0, tokenify('2.2'), 0);

            const amount = tokenify('1');
            const minAmountOut = tokenify('0.98');

            const tokenIn = await ethers.getContractAt('ERC20Token', tokenInAddr);
            const tokenOut = await ethers.getContractAt('ERC20Token', tokenOutAddr);
            await sendTokens(impersonate, alice.address, tokenIn.address, tokenify('1'), admin);

            const balanceBefore = await tokenOut.balanceOf(alice.address);
            await tokenIn.connect(alice).transfer(tokenConverter.address, amount);
            await tokenConverter
                .connect(alice)
                .handle(tokenInAddr, tokenOutAddr, amount, minAmountOut);

            expect(await tokenOut.balanceOf(alice.address)).to.be.gt(balanceBefore);
        });

        it('should swap zunETH to WETH', async () => {
            const tokenInAddr = addresses.crypto.zunETH;
            const tokenOutAddr = addresses.crypto.wEth;
            const impersonate = '0x48c6074fFcB8fb67D75CCD06571B42542ED82555';

            const amount = tokenify('1');
            const minAmountOut = tokenify('0.98');

            const tokenIn = await ethers.getContractAt('ERC20Token', tokenInAddr);
            const tokenOut = await ethers.getContractAt('ERC20Token', tokenOutAddr);
            await sendTokens(impersonate, alice.address, tokenIn.address, amount, admin);

            const balanceBefore = await tokenOut.balanceOf(alice.address);
            await tokenIn.connect(alice).transfer(tokenConverter.address, amount);
            await tokenConverter
                .connect(alice)
                .handle(tokenInAddr, tokenOutAddr, amount, minAmountOut);

            expect(await tokenOut.balanceOf(alice.address)).to.be.gt(balanceBefore);
        });
    });

    describe('CRV', () => {
        it('should swap CRV to zunETH', async () => {
            const tokenInAddr = addresses.crypto.crv;
            const tokenOutAddr = addresses.crypto.zunETH;
            const impersonate = '0xF977814e90dA44bFA03b6295A0616a897441aceC';
            const amount = tokenify('100');
            const minAmountOut = tokenify('0.01');

            const tokenIn = await ethers.getContractAt('ERC20Token', tokenInAddr);
            const tokenOut = await ethers.getContractAt('ERC20Token', tokenOutAddr);
            await sendTokens(impersonate, alice.address, tokenIn.address, tokenify('100'), admin);

            const balanceBefore = await tokenOut.balanceOf(alice.address);
            await tokenIn.connect(alice).transfer(tokenConverter.address, amount);
            await tokenConverter.connect(alice).handle(tokenInAddr, tokenOutAddr, amount, minAmountOut);

            expect(await tokenOut.balanceOf(alice.address)).to.be.gt(balanceBefore);
        });

        it('should swap CRV to zunUSD', async () => {
            const tokenInAddr = addresses.crypto.crv;
            const tokenOutAddr = addresses.stablecoins.zunUSD;
            const impersonate = '0xF977814e90dA44bFA03b6295A0616a897441aceC';
            const amount = tokenify('100');
            const minAmountOut = tokenify('40');

            const tokenIn = await ethers.getContractAt('ERC20Token', tokenInAddr);
            const tokenOut = await ethers.getContractAt('ERC20Token', tokenOutAddr);
            await sendTokens(impersonate, alice.address, tokenIn.address, tokenify('100'), admin);

            const balanceBefore = await tokenOut.balanceOf(alice.address);
            await tokenIn.connect(alice).transfer(tokenConverter.address, amount);
            await tokenConverter
                .connect(alice)
                .handle(tokenInAddr, tokenOutAddr, amount, minAmountOut);

            expect(await tokenOut.balanceOf(alice.address)).to.be.gt(balanceBefore);
        });
    });

    describe('CVX', () => {
        it('should swap CVX to zunETH', async () => {
            const tokenInAddr = addresses.crypto.cvx;
            const tokenOutAddr = addresses.crypto.zunETH;
            const impersonate = '0xF977814e90dA44bFA03b6295A0616a897441aceC';
            const amount = tokenify('100');
            const minAmountOut = tokenify('0');

            const tokenIn = await ethers.getContractAt('ERC20Token', tokenInAddr);
            const tokenOut = await ethers.getContractAt('ERC20Token', tokenOutAddr);
            await sendTokens(impersonate, alice.address, tokenIn.address, tokenify('100'), admin);

            const balanceBefore = await tokenOut.balanceOf(alice.address);
            await tokenIn.connect(alice).transfer(tokenConverter.address, amount);
            await tokenConverter.connect(alice).handle(tokenInAddr, tokenOutAddr, amount, minAmountOut);

            expect(await tokenOut.balanceOf(alice.address)).to.be.gt(balanceBefore);
        });

        it('should swap CVX to zunUSD', async () => {
            const tokenInAddr = addresses.crypto.cvx;
            const tokenOutAddr = addresses.stablecoins.zunUSD;
            const impersonate = '0xF977814e90dA44bFA03b6295A0616a897441aceC';
            const amount = tokenify('100');
            const minAmountOut = tokenify('0');

            const tokenIn = await ethers.getContractAt('ERC20Token', tokenInAddr);
            const tokenOut = await ethers.getContractAt('ERC20Token', tokenOutAddr);
            await sendTokens(impersonate, alice.address, tokenIn.address, tokenify('100'), admin);

            const balanceBefore = await tokenOut.balanceOf(alice.address);
            await tokenIn.connect(alice).transfer(tokenConverter.address, amount);
            await tokenConverter.connect(alice).handle(tokenInAddr, tokenOutAddr, amount, minAmountOut);

            expect(await tokenOut.balanceOf(alice.address)).to.be.gt(balanceBefore);
        });
    });

    describe('SDT', () => {
        it('should swap SDT to zunETH', async () => {
            const tokenInAddr = addresses.crypto.sdt;
            const tokenOutAddr = addresses.crypto.zunETH;
            const impersonate = '0xAced00E50cb81377495ea40A1A44005fe6d2482d';
            const amount = tokenify('100');
            const minAmountOut = tokenify('0');

            const tokenIn = await ethers.getContractAt('ERC20Token', tokenInAddr);
            const tokenOut = await ethers.getContractAt('ERC20Token', tokenOutAddr);
            await sendTokens(impersonate, alice.address, tokenIn.address, tokenify('100'), admin);

            const balanceBefore = await tokenOut.balanceOf(alice.address);
            await tokenIn.connect(alice).transfer(tokenConverter.address, amount);
            await tokenConverter.connect(alice).handle(tokenInAddr, tokenOutAddr, amount, minAmountOut);

            expect(await tokenOut.balanceOf(alice.address)).to.be.gt(balanceBefore);
        });

        it('should swap SDT to zunUSD', async () => {
            const tokenInAddr = addresses.crypto.sdt;
            const tokenOutAddr = addresses.stablecoins.zunUSD;
            const impersonate = '0xAced00E50cb81377495ea40A1A44005fe6d2482d';
            const amount = tokenify('100');
            const minAmountOut = tokenify('0');

            const tokenIn = await ethers.getContractAt('ERC20Token', tokenInAddr);
            const tokenOut = await ethers.getContractAt('ERC20Token', tokenOutAddr);
            await sendTokens(impersonate, alice.address, tokenIn.address, tokenify('100'), admin);

            const balanceBefore = await tokenOut.balanceOf(alice.address);
            await tokenIn.connect(alice).transfer(tokenConverter.address, amount);
            await tokenConverter.connect(alice).handle(tokenInAddr, tokenOutAddr, amount, minAmountOut);

            expect(await tokenOut.balanceOf(alice.address)).to.be.gt(balanceBefore);
        });
    });

    describe('FXS', () => {
        it('should swap FXS to zunETH', async () => {
            const tokenInAddr = addresses.crypto.fxs;
            const tokenOutAddr = addresses.crypto.zunETH;
            const impersonate = '0xF977814e90dA44bFA03b6295A0616a897441aceC';
            const amount = tokenify('100');
            const minAmountOut = tokenify('0');

            const tokenIn = await ethers.getContractAt('ERC20Token', tokenInAddr);
            const tokenOut = await ethers.getContractAt('ERC20Token', tokenOutAddr);
            await sendTokens(impersonate, alice.address, tokenIn.address, tokenify('100'), admin);

            const balanceBefore = await tokenOut.balanceOf(alice.address);
            await tokenIn.connect(alice).transfer(tokenConverter.address, amount);

            await tokenConverter.connect(alice).handle(tokenInAddr, tokenOutAddr, amount, minAmountOut);

            expect(await tokenOut.balanceOf(alice.address)).to.be.gt(balanceBefore);
        });

        it('should swap FXS to zunUSD', async () => {
            const tokenInAddr = addresses.crypto.fxs;
            const tokenOutAddr = addresses.stablecoins.zunUSD;
            const impersonate = '0xF977814e90dA44bFA03b6295A0616a897441aceC';
            const amount = tokenify('100');
            const minAmountOut = tokenify('0');

            const tokenIn = await ethers.getContractAt('ERC20Token', tokenInAddr);
            const tokenOut = await ethers.getContractAt('ERC20Token', tokenOutAddr);
            await sendTokens(impersonate, alice.address, tokenIn.address, tokenify('100'), admin);

            const balanceBefore = await tokenOut.balanceOf(alice.address);
            await tokenIn.connect(alice).transfer(tokenConverter.address, amount);

            await tokenConverter.connect(alice).handle(tokenInAddr, tokenOutAddr, amount, minAmountOut);

            expect(await tokenOut.balanceOf(alice.address)).to.be.gt(balanceBefore);
        });
    });

  describe('FXN', () => {
    it('should swap FXN to zunUSD', async () => {
      const tokenInAddr = addresses.crypto.fxn;
      const tokenOutAddr = addresses.stablecoins.zunUSD;
      const impersonate = '0xb84dfdd51d18b1613432bfae91dfcc48899d4151';
      const amount = tokenify('100');
      const minAmountOut = tokenify('0');

      const tokenIn = await ethers.getContractAt('ERC20Token', tokenInAddr);
      const tokenOut = await ethers.getContractAt('ERC20Token', tokenOutAddr);
      await sendTokens(impersonate, alice.address, tokenIn.address, tokenify('100'), admin);

      const balanceBefore = await tokenOut.balanceOf(alice.address);
      await tokenIn.connect(alice).transfer(tokenConverter.address, amount);
      await tokenConverter.connect(alice).handle(tokenInAddr, tokenOutAddr, amount, minAmountOut);

      expect(await tokenOut.balanceOf(alice.address)).to.be.gt(balanceBefore);

      // const CurveRegistryCacheFactory = await ethers.getContractFactory('CurveRegistryCache');
      // const curveRegistryCache = (await CurveRegistryCacheFactory.deploy()) as CurveRegistryCache;
      //
      // const ChainlinkOracleFactory = await ethers.getContractFactory('ChainlinkOracle');
      // const chainlinkOracle = (await ChainlinkOracleFactory.deploy()) as ChainlinkOracle;
      //
      // const GenericOracleFactory = await ethers.getContractFactory('CurveGenericOracle');
      // const genericOracle = (await GenericOracleFactory.deploy()) as CurveGenericOracle;
      //
      // const CurveLPOracleFactory = await ethers.getContractFactory('CurveLPOracle');
      // const curveLPOracle = (await CurveLPOracleFactory.deploy(
      //   genericOracle.address,
      //   curveRegistryCache.address
      // )) as CurveLPOracle;
      //
      // await genericOracle.initialize(curveLPOracle.address, chainlinkOracle.address);
      //
      // const FxnOracleFactory = await ethers.getContractFactory('FxnOracle');
      // const fxnOracle = await FxnOracleFactory.deploy(genericOracle.address);
      //
      // await genericOracle.setCustomOracle(addresses.crypto.fxn, fxnOracle.address);
      //
      // console.log('FXN to USD', (await genericOracle.getUSDPrice(addresses.crypto.fxn)).toString());
      // console.log('FXN to USD Token Converter', (await tokenOut.balanceOf(alice.address)).toString());
    });
  });

  describe('PxETH', () => {
    it('should swap PxETH to WETH', async () => {
      const tokenInAddr = addresses.crypto.pxETH;
      const tokenOutAddr = addresses.crypto.wEth;
      const impersonate = '0xeE3d8fE52b93f31d666bbbd7E2776432f2738735';
      const amount = tokenify('1');
      const minAmountOut = tokenify('0.98');

      const tokenIn = await ethers.getContractAt('ERC20Token', tokenInAddr);
      const tokenOut = await ethers.getContractAt('ERC20Token', tokenOutAddr);
      await sendTokens(impersonate, alice.address, tokenIn.address, tokenify('1'), admin);

      const balanceBefore = await tokenOut.balanceOf(alice.address);
      await tokenIn.connect(alice).transfer(tokenConverter.address, amount);
      await tokenConverter
        .connect(alice)
        .handle(tokenInAddr, tokenOutAddr, amount, minAmountOut);

      expect(await tokenOut.balanceOf(alice.address)).to.be.gt(balanceBefore);
    });

    it('should swap WEth to PxETH', async () => {
      const tokenInAddr = addresses.crypto.wEth;
      const tokenOutAddr = addresses.crypto.pxETH;
      const impersonate = '0x57757E3D981446D585Af0D9Ae4d7DF6D64647806';
      const amount = tokenify('1');
      const minAmountOut = tokenify('0.98');

      const tokenIn = await ethers.getContractAt('ERC20Token', tokenInAddr);
      const tokenOut = await ethers.getContractAt('ERC20Token', tokenOutAddr);
      await sendTokens(impersonate, alice.address, tokenIn.address, tokenify('1'), admin);

      const balanceBefore = await tokenOut.balanceOf(alice.address);
      await tokenIn.connect(alice).transfer(tokenConverter.address, amount);
      await tokenConverter
        .connect(alice)
        .handle(tokenInAddr, tokenOutAddr, amount, minAmountOut);

      expect(await tokenOut.balanceOf(alice.address)).to.be.gt(balanceBefore);
    });
  });

  describe('frax', () => {
    it('should swap USDT to FRAX', async () => {
      const tokenInAddr = addresses.stablecoins.usdt;
      const tokenOutAddr = addresses.stablecoins.frax;
      const impersonate = '0xF977814e90dA44bFA03b6295A0616a897441aceC';
      const amount = stablify('100');
      const minAmountOut = stablify('99');

      const tokenIn = await ethers.getContractAt('ERC20Token', tokenInAddr);
      const tokenOut = await ethers.getContractAt('ERC20Token', tokenOutAddr);
      await sendTokens(impersonate, alice.address, tokenIn.address, amount, admin);

      const balanceBefore = await tokenOut.balanceOf(alice.address);
      await tokenIn.connect(alice).transfer(tokenConverter.address, amount);
      await tokenConverter.connect(alice).handle(tokenInAddr, tokenOutAddr, amount, minAmountOut);

      expect(await tokenOut.balanceOf(alice.address)).to.be.gt(balanceBefore);
    });
    it('should swap USDC to FRAX', async () => {
      const tokenInAddr = addresses.stablecoins.usdc;
      const tokenOutAddr = addresses.stablecoins.frax;
      const impersonate = '0x28C6c06298d514Db089934071355E5743bf21d60';
      const amount = stablify('100');
      const minAmountOut = stablify('99');

      const tokenIn = await ethers.getContractAt('ERC20Token', tokenInAddr);
      const tokenOut = await ethers.getContractAt('ERC20Token', tokenOutAddr);
      await sendTokens(impersonate, alice.address, tokenIn.address, amount, admin);

      const balanceBefore = await tokenOut.balanceOf(alice.address);
      await tokenIn.connect(alice).transfer(tokenConverter.address, amount);
      await tokenConverter
        .connect(alice)
        .handle(tokenInAddr, tokenOutAddr, amount, minAmountOut);

      expect(await tokenOut.balanceOf(alice.address)).to.be.gt(balanceBefore);
    });
    it('should swap DAI to FRAX', async () => {
      const tokenInAddr = addresses.stablecoins.dai;
      const tokenOutAddr = addresses.stablecoins.frax;
      const impersonate = '0xD1668fB5F690C59Ab4B0CAbAd0f8C1617895052B';
      const amount = tokenify('100');
      const minAmountOut = stablify('99');

      const tokenIn = await ethers.getContractAt('ERC20Token', tokenInAddr);
      const tokenOut = await ethers.getContractAt('ERC20Token', tokenOutAddr);
      await sendTokens(impersonate, alice.address, tokenIn.address, amount, admin);

      const balanceBefore = await tokenOut.balanceOf(alice.address);
      await tokenIn.connect(alice).transfer(tokenConverter.address, amount);
      await tokenConverter
        .connect(alice)
        .handle(tokenInAddr, tokenOutAddr, amount, minAmountOut);

      expect(await tokenOut.balanceOf(alice.address)).to.be.gt(balanceBefore);
    });
    it('should swap FRAX to USDT', async () => {
      const tokenInAddr = addresses.stablecoins.frax;
      const tokenOutAddr = addresses.stablecoins.usdt;
      const impersonate = '0x5E583B6a1686f7Bc09A6bBa66E852A7C80d36F00';
      const amount = tokenify('100');
      const minAmountOut = stablify('99');

      const tokenIn = await ethers.getContractAt('ERC20Token', tokenInAddr);
      const tokenOut = await ethers.getContractAt('ERC20Token', tokenOutAddr);
      await sendTokens(impersonate, alice.address, tokenIn.address, amount, admin);

      const balanceBefore = await tokenOut.balanceOf(alice.address);
      await tokenIn.connect(alice).transfer(tokenConverter.address, amount);
      await tokenConverter.connect(alice).handle(tokenInAddr, tokenOutAddr, amount, minAmountOut);

      expect(await tokenOut.balanceOf(alice.address)).to.be.gt(balanceBefore);
    });
    it('should swap FRAX to USDC', async () => {
      const tokenInAddr = addresses.stablecoins.frax;
      const tokenOutAddr = addresses.stablecoins.usdc;
      const impersonate = '0x5E583B6a1686f7Bc09A6bBa66E852A7C80d36F00';
      const amount = tokenify('100');
      const minAmountOut = stablify('99');

      const tokenIn = await ethers.getContractAt('ERC20Token', tokenInAddr);
      const tokenOut = await ethers.getContractAt('ERC20Token', tokenOutAddr);

      await sendTokens(impersonate, alice.address, tokenIn.address, amount, admin);

      const balanceBefore = await tokenOut.balanceOf(alice.address);
      await tokenIn.connect(alice).transfer(tokenConverter.address, amount);
      await tokenConverter.connect(alice).handle(tokenInAddr, tokenOutAddr, amount, minAmountOut);

      expect(await tokenOut.balanceOf(alice.address)).to.be.gt(balanceBefore);
    });
    it('should swap FRAX to DAI', async () => {
      const tokenInAddr = addresses.stablecoins.frax;
      const tokenOutAddr = addresses.stablecoins.dai;
      const impersonate = '0x5E583B6a1686f7Bc09A6bBa66E852A7C80d36F00';
      const amount = tokenify('100');
      const minAmountOut = stablify('99');

      const tokenIn = await ethers.getContractAt('ERC20Token', tokenInAddr);
      const tokenOut = await ethers.getContractAt('ERC20Token', tokenOutAddr);
      await sendTokens(impersonate, alice.address, tokenIn.address, amount, admin);

      const balanceBefore = await tokenOut.balanceOf(alice.address);
      await tokenIn.connect(alice).transfer(tokenConverter.address, amount);
      await tokenConverter.connect(alice).handle(tokenInAddr, tokenOutAddr, amount, minAmountOut);

      expect(await tokenOut.balanceOf(alice.address)).to.be.gt(balanceBefore);
    });
  });

});
