import {BigNumber} from "ethers";
import {ethers} from "hardhat";

export function getMinAmountUZD(): BigNumber[] {
  const zero = ethers.utils.parseUnits('0', 'ether');
  const amount = '1000';
  const dai = ethers.utils.parseUnits(amount, 'ether');
  const usdc = ethers.utils.parseUnits(amount, 'mwei');
  const usdt = ethers.utils.parseUnits(amount, 'mwei');
  return [dai, usdc, usdt, zero, zero];
}
