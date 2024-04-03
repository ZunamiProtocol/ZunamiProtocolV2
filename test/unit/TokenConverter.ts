import { ethers, network } from 'hardhat';
import BigNumber from 'bignumber.js';
import { expect } from 'chai';
import chai from 'chai';
import { Contract } from '@ethersproject/contracts';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { FakeContract, smock } from '@defi-wonderland/smock';

const ADDRESS_ZERO = '0x0000000000000000000000000000000000000000';

import * as addresses from '../address.json';
import { Address } from 'hardhat-deploy/dist/types';

chai.should(); // if you like should syntax
chai.use(smock.matchers);

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
    });

    describe('CRV', () => {
        it('should swap CRV to zunUSD', async () => {
            const tokenInAddr = addresses.crypto.crv;
            const tokenOutAddr = addresses.stablecoins.zunUSD;
            const impersonate = '0xF977814e90dA44bFA03b6295A0616a897441aceC';
            const amount = tokenify('100');
            const minAmountOut = tokenify('60');

            await tokenConverter.setRoute(
                tokenInAddr,
                tokenOutAddr,
                [
                    addresses.crypto.crv,
                    '0x4ebdf703948ddcea3b11f675b4d1fba9d2414a14',
                    '0xf939e0a03fb07f59a73314e73794be0e57ac1b4e',
                    '0x8c24b3213fd851db80245fccc42c40b94ac9a745',
                    addresses.stablecoins.zunUSD,
                    '0x0000000000000000000000000000000000000000',
                    '0x0000000000000000000000000000000000000000',
                    '0x0000000000000000000000000000000000000000',
                    '0x0000000000000000000000000000000000000000',
                    '0x0000000000000000000000000000000000000000',
                    '0x0000000000000000000000000000000000000000',
                ],
                [
                    [2, 0, 1, 3, 3],
                    [0, 1, 1, 1, 2],
                    [0, 0, 0, 0, 0],
                    [0, 0, 0, 0, 0],
                    [0, 0, 0, 0, 0],
                ]
            );

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

        it('should swap CRV to crvUSD', async () => {
            const tokenInAddr = addresses.crypto.crv;
            const tokenOutAddr = addresses.stablecoins.crvUSD;
            const impersonate = '0xF977814e90dA44bFA03b6295A0616a897441aceC';
            const amount = tokenify('100');
            const minAmountOut = tokenify('60');

            await tokenConverter.setRoute(
                tokenInAddr,
                tokenOutAddr,
                [
                    '0xd533a949740bb3306d119cc777fa900ba034cd52',
                    '0x4ebdf703948ddcea3b11f675b4d1fba9d2414a14',
                    '0xf939e0a03fb07f59a73314e73794be0e57ac1b4e',
                    '0x0000000000000000000000000000000000000000',
                    '0x0000000000000000000000000000000000000000',
                    '0x0000000000000000000000000000000000000000',
                    '0x0000000000000000000000000000000000000000',
                    '0x0000000000000000000000000000000000000000',
                    '0x0000000000000000000000000000000000000000',
                    '0x0000000000000000000000000000000000000000',
                    '0x0000000000000000000000000000000000000000',
                ],
                [
                    [2, 0, 1, 3, 3],
                    [0, 0, 0, 0, 0],
                    [0, 0, 0, 0, 0],
                    [0, 0, 0, 0, 0],
                    [0, 0, 0, 0, 0],
                ]
            );

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

    describe('USDT', () => {
        it('should swap USDT to USDC', async () => {
            const tokenInAddr = addresses.stablecoins.usdt;
            const tokenOutAddr = addresses.stablecoins.usdc;
            const impersonate = '0xF977814e90dA44bFA03b6295A0616a897441aceC';
            const amount = stablify('100');
            const minAmountOut = stablify('99');

            await tokenConverter.setRoute(
                tokenInAddr,
                tokenOutAddr,
                [
                    tokenInAddr,
                    '0xbebc44782c7db0a1a60cb6fe97d0b483032ff1c7',
                    tokenOutAddr,
                    '0x0000000000000000000000000000000000000000',
                    '0x0000000000000000000000000000000000000000',
                    '0x0000000000000000000000000000000000000000',
                    '0x0000000000000000000000000000000000000000',
                    '0x0000000000000000000000000000000000000000',
                    '0x0000000000000000000000000000000000000000',
                    '0x0000000000000000000000000000000000000000',
                    '0x0000000000000000000000000000000000000000',
                ],
                [
                    [2, 1, 1, 1, 3],
                    [0, 0, 0, 0, 0],
                    [0, 0, 0, 0, 0],
                    [0, 0, 0, 0, 0],
                    [0, 0, 0, 0, 0],
                ]
            );

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

            await tokenConverter.setRoute(
                tokenInAddr,
                tokenOutAddr,
                [
                    tokenInAddr,
                    '0xbebc44782c7db0a1a60cb6fe97d0b483032ff1c7',
                    tokenOutAddr,
                    '0x0000000000000000000000000000000000000000',
                    '0x0000000000000000000000000000000000000000',
                    '0x0000000000000000000000000000000000000000',
                    '0x0000000000000000000000000000000000000000',
                    '0x0000000000000000000000000000000000000000',
                    '0x0000000000000000000000000000000000000000',
                    '0x0000000000000000000000000000000000000000',
                    '0x0000000000000000000000000000000000000000',
                ],
                [
                    [2, 0, 1, 1, 3],
                    [0, 0, 0, 0, 0],
                    [0, 0, 0, 0, 0],
                    [0, 0, 0, 0, 0],
                    [0, 0, 0, 0, 0],
                ]
            );

            const tokenIn = await ethers.getContractAt('ERC20Token', tokenInAddr);
            const tokenOut = await ethers.getContractAt('ERC20Token', tokenOutAddr);
            await sendTokens(impersonate, alice.address, tokenIn.address, amount, admin);

            const balanceBefore = await tokenOut.balanceOf(alice.address);
            await tokenIn.connect(alice).transfer(tokenConverter.address, amount);
            await tokenConverter.connect(alice).handle(tokenInAddr, tokenOutAddr, amount, 0);

            expect(await tokenOut.balanceOf(alice.address)).to.be.gt(balanceBefore);
        });

        it('should swap USDT to crvUSD', async () => {
            const tokenInAddr = addresses.stablecoins.usdt;
            const tokenOutAddr = addresses.stablecoins.crvUSD;
            const impersonate = '0xF977814e90dA44bFA03b6295A0616a897441aceC';
            const amount = stablify('100');
            const minAmountOut = stablify('99');

            await tokenConverter.setRoute(
                tokenInAddr,
                tokenOutAddr,
                [
                    tokenInAddr,
                    '0x390f3595bCa2Df7d23783dFd126427CCeb997BF4',
                    tokenOutAddr,
                    '0x0000000000000000000000000000000000000000',
                    '0x0000000000000000000000000000000000000000',
                    '0x0000000000000000000000000000000000000000',
                    '0x0000000000000000000000000000000000000000',
                    '0x0000000000000000000000000000000000000000',
                    '0x0000000000000000000000000000000000000000',
                    '0x0000000000000000000000000000000000000000',
                    '0x0000000000000000000000000000000000000000',
                ],
                [
                    [0, 1, 1, 1, 2],
                    [0, 0, 0, 0, 0],
                    [0, 0, 0, 0, 0],
                    [0, 0, 0, 0, 0],
                    [0, 0, 0, 0, 0],
                ]
            );

            const tokenIn = await ethers.getContractAt('ERC20Token', tokenInAddr);
            const tokenOut = await ethers.getContractAt('ERC20Token', tokenOutAddr);
            await sendTokens(impersonate, alice.address, tokenIn.address, amount, admin);

            const balanceBefore = await tokenOut.balanceOf(alice.address);
            await tokenIn.connect(alice).transfer(tokenConverter.address, amount);
            await tokenConverter.connect(alice).handle(tokenInAddr, tokenOutAddr, amount, 0);

            expect(await tokenOut.balanceOf(alice.address)).to.be.gt(balanceBefore);
        });

        it('should swap USDT to zunUSD', async () => {
            const tokenInAddr = addresses.stablecoins.usdt;
            const tokenOutAddr = addresses.stablecoins.zunUSD;
            const impersonate = '0xF977814e90dA44bFA03b6295A0616a897441aceC';
            const amount = stablify('100');
            const minAmountOut = stablify('99');

            await tokenConverter.setRoute(
                tokenInAddr,
                tokenOutAddr,
                [
                    tokenInAddr,
                    '0x390f3595bCa2Df7d23783dFd126427CCeb997BF4',
                    addresses.stablecoins.crvUSD,
                    '0x8c24b3213fd851db80245fccc42c40b94ac9a745',
                    tokenOutAddr,
                    '0x0000000000000000000000000000000000000000',
                    '0x0000000000000000000000000000000000000000',
                    '0x0000000000000000000000000000000000000000',
                    '0x0000000000000000000000000000000000000000',
                    '0x0000000000000000000000000000000000000000',
                    '0x0000000000000000000000000000000000000000',
                ],
                [
                    [0, 1, 1, 1, 2],
                    [0, 1, 1, 1, 2],
                    [0, 0, 0, 0, 0],
                    [0, 0, 0, 0, 0],
                    [0, 0, 0, 0, 0],
                ]
            );

            const tokenIn = await ethers.getContractAt('ERC20Token', tokenInAddr);
            const tokenOut = await ethers.getContractAt('ERC20Token', tokenOutAddr);
            await sendTokens(impersonate, alice.address, tokenIn.address, amount, admin);

            const balanceBefore = await tokenOut.balanceOf(alice.address);
            await tokenIn.connect(alice).transfer(tokenConverter.address, amount);
            await tokenConverter.connect(alice).handle(tokenInAddr, tokenOutAddr, amount, 0);

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

            await tokenConverter.setRoute(
                tokenInAddr,
                tokenOutAddr,
                [
                    tokenInAddr,
                    '0xbebc44782c7db0a1a60cb6fe97d0b483032ff1c7',
                    tokenOutAddr,
                    '0x0000000000000000000000000000000000000000',
                    '0x0000000000000000000000000000000000000000',
                    '0x0000000000000000000000000000000000000000',
                    '0x0000000000000000000000000000000000000000',
                    '0x0000000000000000000000000000000000000000',
                    '0x0000000000000000000000000000000000000000',
                    '0x0000000000000000000000000000000000000000',
                    '0x0000000000000000000000000000000000000000',
                ],
                [
                    [1, 2, 1, 1, 3],
                    [0, 0, 0, 0, 0],
                    [0, 0, 0, 0, 0],
                    [0, 0, 0, 0, 0],
                    [0, 0, 0, 0, 0],
                ]
            );

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

            await tokenConverter.setRoute(
                tokenInAddr,
                tokenOutAddr,
                [
                    tokenInAddr,
                    '0xbebc44782c7db0a1a60cb6fe97d0b483032ff1c7',
                    tokenOutAddr,
                    '0x0000000000000000000000000000000000000000',
                    '0x0000000000000000000000000000000000000000',
                    '0x0000000000000000000000000000000000000000',
                    '0x0000000000000000000000000000000000000000',
                    '0x0000000000000000000000000000000000000000',
                    '0x0000000000000000000000000000000000000000',
                    '0x0000000000000000000000000000000000000000',
                    '0x0000000000000000000000000000000000000000',
                ],
                [
                    [1, 0, 1, 1, 3],
                    [0, 0, 0, 0, 0],
                    [0, 0, 0, 0, 0],
                    [0, 0, 0, 0, 0],
                    [0, 0, 0, 0, 0],
                ]
            );

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

            await tokenConverter.setRoute(
                tokenInAddr,
                tokenOutAddr,
                [
                    tokenInAddr,
                    '0x4dece678ceceb27446b35c672dc7d61f30bad69e',
                    tokenOutAddr,
                    '0x0000000000000000000000000000000000000000',
                    '0x0000000000000000000000000000000000000000',
                    '0x0000000000000000000000000000000000000000',
                    '0x0000000000000000000000000000000000000000',
                    '0x0000000000000000000000000000000000000000',
                    '0x0000000000000000000000000000000000000000',
                    '0x0000000000000000000000000000000000000000',
                    '0x0000000000000000000000000000000000000000',
                ],
                [
                    [0, 1, 1, 1, 2],
                    [0, 0, 0, 0, 0],
                    [0, 0, 0, 0, 0],
                    [0, 0, 0, 0, 0],
                    [0, 0, 0, 0, 0],
                ]
            );

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

            await tokenConverter.setRoute(
                tokenInAddr,
                tokenOutAddr,
                [
                    tokenInAddr,
                    '0x4dece678ceceb27446b35c672dc7d61f30bad69e',
                    addresses.stablecoins.crvUSD,
                    '0x8c24b3213fd851db80245fccc42c40b94ac9a745',
                    tokenOutAddr,
                    '0x0000000000000000000000000000000000000000',
                    '0x0000000000000000000000000000000000000000',
                    '0x0000000000000000000000000000000000000000',
                    '0x0000000000000000000000000000000000000000',
                    '0x0000000000000000000000000000000000000000',
                    '0x0000000000000000000000000000000000000000',
                ],
                [
                    [0, 1, 1, 1, 2],
                    [0, 1, 1, 1, 2],
                    [0, 0, 0, 0, 0],
                    [0, 0, 0, 0, 0],
                    [0, 0, 0, 0, 0],
                ]
            );

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
            const impersonate = '0xBF293D5138a2a1BA407B43672643434C43827179';
            const amount = tokenify('100');
            const minAmountOut = stablify('99');

            await tokenConverter.setRoute(
                tokenInAddr,
                tokenOutAddr,
                [
                    tokenInAddr,
                    '0xbebc44782c7db0a1a60cb6fe97d0b483032ff1c7',
                    tokenOutAddr,
                    '0x0000000000000000000000000000000000000000',
                    '0x0000000000000000000000000000000000000000',
                    '0x0000000000000000000000000000000000000000',
                    '0x0000000000000000000000000000000000000000',
                    '0x0000000000000000000000000000000000000000',
                    '0x0000000000000000000000000000000000000000',
                    '0x0000000000000000000000000000000000000000',
                    '0x0000000000000000000000000000000000000000',
                ],
                [
                    [0, 2, 1, 1, 3],
                    [0, 0, 0, 0, 0],
                    [0, 0, 0, 0, 0],
                    [0, 0, 0, 0, 0],
                    [0, 0, 0, 0, 0],
                ]
            );

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
            const impersonate = '0xBF293D5138a2a1BA407B43672643434C43827179';
            const amount = tokenify('100');
            const minAmountOut = stablify('99');

            await tokenConverter.setRoute(
                tokenInAddr,
                tokenOutAddr,
                [
                    tokenInAddr,
                    '0xbebc44782c7db0a1a60cb6fe97d0b483032ff1c7',
                    tokenOutAddr,
                    '0x0000000000000000000000000000000000000000',
                    '0x0000000000000000000000000000000000000000',
                    '0x0000000000000000000000000000000000000000',
                    '0x0000000000000000000000000000000000000000',
                    '0x0000000000000000000000000000000000000000',
                    '0x0000000000000000000000000000000000000000',
                    '0x0000000000000000000000000000000000000000',
                    '0x0000000000000000000000000000000000000000',
                ],
                [
                    [0, 1, 1, 1, 3],
                    [0, 0, 0, 0, 0],
                    [0, 0, 0, 0, 0],
                    [0, 0, 0, 0, 0],
                    [0, 0, 0, 0, 0],
                ]
            );

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
            const impersonate = '0xBF293D5138a2a1BA407B43672643434C43827179';
            const amount = tokenify('100');
            const minAmountOut = tokenify('99');

            await tokenConverter.setRoute(
                tokenInAddr,
                tokenOutAddr,
                [
                    tokenInAddr,
                    '0xbebc44782c7db0a1a60cb6fe97d0b483032ff1c7',
                    addresses.stablecoins.usdt,
                    '0x390f3595bCa2Df7d23783dFd126427CCeb997BF4',
                    tokenOutAddr,
                    '0x0000000000000000000000000000000000000000',
                    '0x0000000000000000000000000000000000000000',
                    '0x0000000000000000000000000000000000000000',
                    '0x0000000000000000000000000000000000000000',
                    '0x0000000000000000000000000000000000000000',
                    '0x0000000000000000000000000000000000000000',
                ],
                [
                    [0, 2, 1, 1, 3],
                    [0, 1, 1, 1, 2],
                    [0, 0, 0, 0, 0],
                    [0, 0, 0, 0, 0],
                    [0, 0, 0, 0, 0],
                ]
            );

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
            const impersonate = '0xBF293D5138a2a1BA407B43672643434C43827179';
            const amount = tokenify('100');
            const minAmountOut = tokenify('99');

            await tokenConverter.setRoute(
                tokenInAddr,
                tokenOutAddr,
                [
                    tokenInAddr,
                    '0xbebc44782c7db0a1a60cb6fe97d0b483032ff1c7',
                    addresses.stablecoins.usdt,
                    '0x390f3595bCa2Df7d23783dFd126427CCeb997BF4',
                    addresses.stablecoins.crvUSD,
                    '0x8c24b3213fd851db80245fccc42c40b94ac9a745',
                    tokenOutAddr,
                    '0x0000000000000000000000000000000000000000',
                    '0x0000000000000000000000000000000000000000',
                    '0x0000000000000000000000000000000000000000',
                    '0x0000000000000000000000000000000000000000',
                ],
                [
                    [0, 2, 1, 1, 3],
                    [0, 1, 1, 1, 2],
                    [0, 1, 1, 1, 2],
                    [0, 0, 0, 0, 0],
                    [0, 0, 0, 0, 0],
                ]
            );

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

            await tokenConverter.setRoute(
                tokenInAddr,
                tokenOutAddr,
                [
                    tokenInAddr,
                    '0x390f3595bCa2Df7d23783dFd126427CCeb997BF4',
                    tokenOutAddr,
                    '0x0000000000000000000000000000000000000000',
                    '0x0000000000000000000000000000000000000000',
                    '0x0000000000000000000000000000000000000000',
                    '0x0000000000000000000000000000000000000000',
                    '0x0000000000000000000000000000000000000000',
                    '0x0000000000000000000000000000000000000000',
                    '0x0000000000000000000000000000000000000000',
                    '0x0000000000000000000000000000000000000000',
                ],
                [
                    [1, 0, 1, 1, 2],
                    [0, 0, 0, 0, 0],
                    [0, 0, 0, 0, 0],
                    [0, 0, 0, 0, 0],
                    [0, 0, 0, 0, 0],
                ]
            );

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

            await tokenConverter.setRoute(
                tokenInAddr,
                tokenOutAddr,
                [
                    tokenInAddr,
                    '0x4dece678ceceb27446b35c672dc7d61f30bad69e',
                    tokenOutAddr,
                    '0x0000000000000000000000000000000000000000',
                    '0x0000000000000000000000000000000000000000',
                    '0x0000000000000000000000000000000000000000',
                    '0x0000000000000000000000000000000000000000',
                    '0x0000000000000000000000000000000000000000',
                    '0x0000000000000000000000000000000000000000',
                    '0x0000000000000000000000000000000000000000',
                    '0x0000000000000000000000000000000000000000',
                ],
                [
                    [1, 0, 1, 1, 2],
                    [0, 0, 0, 0, 0],
                    [0, 0, 0, 0, 0],
                    [0, 0, 0, 0, 0],
                    [0, 0, 0, 0, 0],
                ]
            );

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

            await tokenConverter.setRoute(
                tokenInAddr,
                tokenOutAddr,
                [
                    tokenInAddr,
                    '0x4dece678ceceb27446b35c672dc7d61f30bad69e',
                    addresses.stablecoins.usdc,
                    '0xbebc44782c7db0a1a60cb6fe97d0b483032ff1c7',
                    tokenOutAddr,
                    '0x0000000000000000000000000000000000000000',
                    '0x0000000000000000000000000000000000000000',
                    '0x0000000000000000000000000000000000000000',
                    '0x0000000000000000000000000000000000000000',
                    '0x0000000000000000000000000000000000000000',
                    '0x0000000000000000000000000000000000000000',
                ],
                [
                    [1, 0, 1, 1, 2],
                    [1, 0, 1, 1, 3],
                    [0, 0, 0, 0, 0],
                    [0, 0, 0, 0, 0],
                    [0, 0, 0, 0, 0],
                ]
            );

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

            await tokenConverter.setRoute(
                tokenInAddr,
                tokenOutAddr,
                [
                    tokenInAddr,
                    '0x8c24b3213fd851db80245fccc42c40b94ac9a745',
                    tokenOutAddr,
                    '0x0000000000000000000000000000000000000000',
                    '0x0000000000000000000000000000000000000000',
                    '0x0000000000000000000000000000000000000000',
                    '0x0000000000000000000000000000000000000000',
                    '0x0000000000000000000000000000000000000000',
                    '0x0000000000000000000000000000000000000000',
                    '0x0000000000000000000000000000000000000000',
                    '0x0000000000000000000000000000000000000000',
                ],
                [
                    [0, 1, 1, 1, 2],
                    [0, 0, 0, 0, 0],
                    [0, 0, 0, 0, 0],
                    [0, 0, 0, 0, 0],
                    [0, 0, 0, 0, 0],
                ]
            );

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

    // describe('token', () => {
    //     it('should swap token to token', async () => {
    //         const tokenInAddr = addresses.;
    //         const tokenOutAddr = addresses.;
    //         const impersonate = '0xF977814e90dA44bFA03b6295A0616a897441aceC';
    //         const amount = tokenify('100');
    //         const minAmountOut = tokenify('99');

    //         await tokenConverter.setRoute(
    //             tokenInAddr,
    //             tokenOutAddr,
    //             [
    //                 '0xd533a949740bb3306d119cc777fa900ba034cd52',
    //                 '0x4ebdf703948ddcea3b11f675b4d1fba9d2414a14',
    //                 '0xf939e0a03fb07f59a73314e73794be0e57ac1b4e',
    //                 '0x8c24b3213fd851db80245fccc42c40b94ac9a745',
    //                 '0x8c0d76c9b18779665475f3e212d9ca1ed6a1a0e6',
    //                 '0x0000000000000000000000000000000000000000',
    //                 '0x0000000000000000000000000000000000000000',
    //                 '0x0000000000000000000000000000000000000000',
    //                 '0x0000000000000000000000000000000000000000',
    //                 '0x0000000000000000000000000000000000000000',
    //                 '0x0000000000000000000000000000000000000000',
    //             ],
    //             [
    //                 [2, 0, 1, 3, 3],
    //                 [0, 1, 1, 1, 2],
    //                 [0, 0, 0, 0, 0],
    //                 [0, 0, 0, 0, 0],
    //                 [0, 0, 0, 0, 0],
    //             ]
    //         );

    //         const tokenIn = await ethers.getContractAt('ERC20Token', tokenInAddr);
    //         const tokenOut = await ethers.getContractAt('ERC20Token', tokenOutAddr);
    //         await sendTokens(impersonate, alice.address, tokenIn.address, amount, admin);

    //         const balanceBefore = await tokenOut.balanceOf(alice.address);
    //         await tokenIn.connect(alice).transfer(tokenConverter.address, amount);
    //         await tokenConverter.connect(alice).handle(tokenInAddr, tokenOutAddr, amount, minAmountOut);

    //         expect(await tokenOut.balanceOf(alice.address)).to.be.gt(balanceBefore);
    //     });

    // });
});
