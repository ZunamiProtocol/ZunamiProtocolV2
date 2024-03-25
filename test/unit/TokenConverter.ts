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
            const tokenInAddr = '0xD533a949740bb3306d119CC777fa900bA034cd52';
            const tokenOutAddr = '0x8C0D76C9B18779665475F3E212D9Ca1Ed6A1A0e6';
            const impersonate = '0xF977814e90dA44bFA03b6295A0616a897441aceC';
            const amount = tokenify('100');
            const slippage = 1000;

            await tokenConverter.setRoute(
                addresses.crypto.crv,
                addresses.stablecoins.zunUSD,
                [
                    '0xd533a949740bb3306d119cc777fa900ba034cd52',
                    '0x4ebdf703948ddcea3b11f675b4d1fba9d2414a14',
                    '0xf939e0a03fb07f59a73314e73794be0e57ac1b4e',
                    '0x8c24b3213fd851db80245fccc42c40b94ac9a745',
                    '0x8c0d76c9b18779665475f3e212d9ca1ed6a1a0e6',
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
            await tokenIn.connect(alice).approve(tokenConverter.address, amount);
            await tokenConverter.connect(alice).handle(tokenInAddr, tokenOutAddr, amount, slippage);

            expect(await tokenOut.balanceOf(alice.address)).to.be.gt(balanceBefore);
        });

        it('should swap CRV to crvUSD', async () => {
            const tokenInAddr = '0xD533a949740bb3306d119CC777fa900bA034cd52';
            const tokenOutAddr = '0xf939e0a03fb07f59a73314e73794be0e57ac1b4e';
            const impersonate = '0xF977814e90dA44bFA03b6295A0616a897441aceC';
            const amount = tokenify('100');
            const slippage = 1000;

            await tokenConverter.setRoute(
                addresses.crypto.crv,
                addresses.stablecoins.crvUSD,
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
            await tokenIn.connect(alice).approve(tokenConverter.address, amount);
            await tokenConverter.connect(alice).handle(tokenInAddr, tokenOutAddr, amount, slippage);

            expect(await tokenOut.balanceOf(alice.address)).to.be.gt(balanceBefore);
        });
    });
});
