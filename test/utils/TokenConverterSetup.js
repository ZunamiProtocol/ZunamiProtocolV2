const { ethers } = require('hardhat');
const { Contract } = require('@ethersproject/contracts');
const { SignerWithAddress } = require('@nomiclabs/hardhat-ethers/signers');

const addresses = require('../address.json');

async function setupTokenConverterStables(tokenConverter) {
    const tokenIns = [
        addresses.stablecoins.usdt,
        addresses.stablecoins.usdt,
        addresses.stablecoins.usdt,
        addresses.stablecoins.usdt,

        addresses.stablecoins.usdc,
        addresses.stablecoins.usdc,
        addresses.stablecoins.usdc,
        addresses.stablecoins.usdc,

        addresses.stablecoins.dai,
        addresses.stablecoins.dai,
        addresses.stablecoins.dai,
        addresses.stablecoins.dai,

        addresses.stablecoins.crvUSD,
        addresses.stablecoins.crvUSD,
        addresses.stablecoins.crvUSD,
        addresses.stablecoins.crvUSD,
    ];
    const tokenOuts = [
        addresses.stablecoins.usdc,
        addresses.stablecoins.dai,
        addresses.stablecoins.crvUSD,
        addresses.stablecoins.zunUSD,

        addresses.stablecoins.usdt,
        addresses.stablecoins.dai,
        addresses.stablecoins.crvUSD,
        addresses.stablecoins.zunUSD,

        addresses.stablecoins.usdt,
        addresses.stablecoins.usdc,
        addresses.stablecoins.crvUSD,
        addresses.stablecoins.zunUSD,

        addresses.stablecoins.usdt,
        addresses.stablecoins.usdc,
        addresses.stablecoins.dai,
        addresses.stablecoins.zunUSD,
    ];
    const routes = [
        [
            addresses.stablecoins.usdt,
            '0xbebc44782c7db0a1a60cb6fe97d0b483032ff1c7',
            addresses.stablecoins.usdc,
        ],
        [
            addresses.stablecoins.usdt,
            '0xbebc44782c7db0a1a60cb6fe97d0b483032ff1c7',
            addresses.stablecoins.dai,
        ],
        [
            addresses.stablecoins.usdt,
            '0x390f3595bCa2Df7d23783dFd126427CCeb997BF4',
            addresses.stablecoins.crvUSD,
        ],
        [
            addresses.stablecoins.usdt,
            '0x390f3595bCa2Df7d23783dFd126427CCeb997BF4',
            addresses.stablecoins.crvUSD,
            '0x8c24b3213fd851db80245fccc42c40b94ac9a745',
            addresses.stablecoins.zunUSD,
        ],

        [
            addresses.stablecoins.usdc,
            '0xbebc44782c7db0a1a60cb6fe97d0b483032ff1c7',
            addresses.stablecoins.usdt,
        ],
        [
            addresses.stablecoins.usdc,
            '0xbebc44782c7db0a1a60cb6fe97d0b483032ff1c7',
            addresses.stablecoins.dai,
        ],
        [
            addresses.stablecoins.usdc,
            '0x4dece678ceceb27446b35c672dc7d61f30bad69e',
            addresses.stablecoins.crvUSD,
        ],
        [
            addresses.stablecoins.usdc,
            '0x4dece678ceceb27446b35c672dc7d61f30bad69e',
            addresses.stablecoins.crvUSD,
            '0x8c24b3213fd851db80245fccc42c40b94ac9a745',
            addresses.stablecoins.zunUSD,
        ],

        [
            addresses.stablecoins.dai,
            '0xbebc44782c7db0a1a60cb6fe97d0b483032ff1c7',
            addresses.stablecoins.usdt,
        ],
        [
            addresses.stablecoins.dai,
            '0xbebc44782c7db0a1a60cb6fe97d0b483032ff1c7',
            addresses.stablecoins.usdc,
        ],
        [
            addresses.stablecoins.dai,
            '0xbebc44782c7db0a1a60cb6fe97d0b483032ff1c7',
            addresses.stablecoins.usdt,
            '0x390f3595bCa2Df7d23783dFd126427CCeb997BF4',
            addresses.stablecoins.crvUSD,
        ],
        [
            addresses.stablecoins.dai,
            '0xbebc44782c7db0a1a60cb6fe97d0b483032ff1c7',
            addresses.stablecoins.usdt,
            '0x390f3595bCa2Df7d23783dFd126427CCeb997BF4',
            addresses.stablecoins.crvUSD,
            '0x8c24b3213fd851db80245fccc42c40b94ac9a745',
            addresses.stablecoins.zunUSD,
        ],

        [
            addresses.stablecoins.crvUSD,
            '0x390f3595bCa2Df7d23783dFd126427CCeb997BF4',
            addresses.stablecoins.usdt,
        ],
        [
            addresses.stablecoins.crvUSD,
            '0x4dece678ceceb27446b35c672dc7d61f30bad69e',
            addresses.stablecoins.usdc,
        ],
        [
            addresses.stablecoins.crvUSD,
            '0x4dece678ceceb27446b35c672dc7d61f30bad69e',
            addresses.stablecoins.usdc,
            '0xbebc44782c7db0a1a60cb6fe97d0b483032ff1c7',
            addresses.stablecoins.dai,
        ],
        [
            addresses.stablecoins.crvUSD,
            '0x8c24b3213fd851db80245fccc42c40b94ac9a745',
            addresses.stablecoins.zunUSD,
        ],
    ];
    const swapParams = [
        [
            [2, 1, 1, 1, 3],
        ],
        [
            [2, 0, 1, 1, 3],
        ],
        [
            [0, 1, 1, 1, 2],
        ],
        [
            [0, 1, 1, 1, 2],
            [0, 1, 1, 1, 2],
        ],

        [
            [1, 2, 1, 1, 3],
        ],
        [
            [1, 0, 1, 1, 3],
        ],
        [
            [0, 1, 1, 1, 2],
        ],
        [
            [0, 1, 1, 1, 2],
            [0, 1, 1, 1, 2],
        ],

        [
            [0, 2, 1, 1, 3],
        ],
        [
            [0, 1, 1, 1, 3],
        ],
        [
            [0, 2, 1, 1, 3],
            [0, 1, 1, 1, 2],
        ],
        [
            [0, 2, 1, 1, 3],
            [0, 1, 1, 1, 2],
            [0, 1, 1, 1, 2],
        ],

        [
            [1, 0, 1, 1, 2],
        ],

        [
            [1, 0, 1, 1, 2],
        ],
        [
            [1, 0, 1, 1, 2],
            [1, 0, 1, 1, 3],
        ],
        [
            [0, 1, 1, 1, 2],
        ],
    ];
    await tokenConverter.setRoutes(tokenIns, tokenOuts, routes, swapParams);
}

async function setupTokenConverterRewardsToZunETH(tokenConverter) {
    const tokenIns = [
        
    ];
    const tokenOuts = [
       
    ];
    const routes = [
        [
            addresses.stablecoins.usdt,
            '0xbebc44782c7db0a1a60cb6fe97d0b483032ff1c7',
            addresses.stablecoins.usdc,
        ],
    ];
    const swapParams = [
        [
            [2, 1, 1, 1, 3],
        ],
        
    ];
    await tokenConverter.setRoutes(tokenIns, tokenOuts, routes, swapParams);
}

async function setupTokenConverterETHsToZunETH(tokenConverter) {
    const tokenIns = [
        
    ];
    const tokenOuts = [
       
    ];
    const routes = [
        [
            addresses.stablecoins.usdt,
            '0xbebc44782c7db0a1a60cb6fe97d0b483032ff1c7',
            addresses.stablecoins.usdc,
        ],
    ];
    const swapParams = [
        [
            [2, 1, 1, 1, 3],
        ],
        
    ];
    await tokenConverter.setRoutes(tokenIns, tokenOuts, routes, swapParams);
}

module.exports = {
    setupTokenConverterETHsToZunETH,
    setupTokenConverterRewardsToZunETH,
    setupTokenConverterStables
};