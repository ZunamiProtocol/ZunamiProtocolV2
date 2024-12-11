//SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

library Constants {
    address internal constant CRVUSD_ADDRESS = 0xf939E0A03FB07F59A73314E73794Be0E57ac1b4E;
    address internal constant USDC_ADDRESS = 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48;
    address internal constant USDT_ADDRESS = 0xdAC17F958D2ee523a2206206994597C13D831ec7;
    address internal constant DAI_ADDRESS = 0x6B175474E89094C44Da98b954EedeAC495271d0F;
    address internal constant FRX_ETH_ADDRESS = 0x5E8422345238F34275888049021821E8E08CAa1f;
    address internal constant WETH_ADDRESS = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;
    address internal constant CVX_ADDRESS = 0x4e3FBD56CD56c3e72c1403e103b45Db9da5B9D2B;
    address internal constant CRV_ADDRESS = 0xD533a949740bb3306d119CC777fa900bA034cd52;
    address internal constant FXS_ADDRESS = 0x3432B6A60D23Ca0dFCa7761B7ab56459D9C964D0;
    address internal constant SPELL_ADDRESS = 0x090185f2135308BaD17527004364eBcC2D37e5F6;
    address internal constant SDT_ADDRESS = 0x73968b9a57c6E53d41345FD57a6E6ae27d6CDB2F;
    address internal constant SFRXETH_ADDRESS = 0xac3E018457B222d93114458476f3E3416Abbe38F;
    address internal constant PXETH_ADDRESS = 0x04C154b66CB340F3Ae24111CC767e0184Ed00Cc6;
    address internal constant WBTC_ADDRESS = 0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599;
    address internal constant TBTC_ADDRESS = 0x18084fbA666a33d37592fA2633fD49a74DD93a88; // tBTC v2
    address internal constant FRAX_ADDRESS = 0x853d955aCEf822Db058eb8505911ED77F175b99e;

    address internal constant scrvUsd_ADDRESS = 0x0655977FEb2f289A4aB78af67BAB0d17aAb84367;

    address internal constant ZUNUSD_ADDRESS = 0x8C0D76C9B18779665475F3E212D9Ca1Ed6A1A0e6;
    address internal constant zunUSD_CONTROLLER_ADDRESS =
        0x618eee502CDF6b46A2199C21D1411f3F6065c940;

    address internal constant zunETH_ADDRESS = 0xc2e660C62F72c2ad35AcE6DB78a616215E2F2222;
    address internal constant zunETH_CONTROLLER_ADDRESS =
        0x54A00DA65c79DDCe24E7fe4691737FD70F7797DF;

    address internal constant ZUNBTC_ADDRESS = 0x0FA308AE0ddE633b6eDE22ba719E7E0Bc45FC6dB;
    address internal constant ZUNBTC_CONTROLLER_ADDRESS = 0x8d6C5C61E815A53b1D24AC94DEEC62f31911EeB4;

    address public constant CHAINLINK_FEED_REGISTRY_ETH_ADDRESS =
        0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;

    address public constant CHAINLINK_FEED_REGISTRY_BTC_ADDRESS =
        0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB;

    address internal constant CRV_3POOL_ADDRESS = 0xbEbc44782C7dB0a1A60Cb6fe97d0b483032FF1C7;
    address internal constant CRV_3POOL_LP_ADDRESS = 0x6c3F90f043a72FA612cbac8115EE7e52BDe6E490;

    address internal constant CRV_TRICRYPTO2_ADDRESS = 0xD51a44d3FaE010294C616388b506AcdA1bfAAE46;

    address internal constant ETH_frxETH_ADDRESS = 0xa1F8A6807c402E4A15ef4EBa36528A3FED24E577;
    address internal constant ETH_frxETH_LP_ADDRESS = 0xf43211935C781D5ca1a41d2041F397B8A7366C7A;

    address internal constant WETH_frxETH_ADDRESS = 0x9c3B46C0Ceb5B9e304FCd6D88Fc50f7DD24B31Bc;
    address internal constant WETH_frxETH_LP_ADDRESS = 0x9c3B46C0Ceb5B9e304FCd6D88Fc50f7DD24B31Bc;

    address internal constant CRV_FRAX_USDC_POOL_ADDRESS =
        0xDcEF968d416a41Cdac0ED8702fAC8128A64241A2;
    address internal constant CRV_FRAX_USDC_POOL_LP_ADDRESS =
        0x3175Df0976dFA876431C2E9eE6Bc45b65d3473CC;

    address internal constant SDT_CRVUSD_USDT_VAULT_ADDRESS =
        0x37b24ac19504C0c6FC1ADc8deb5D24f5C4F6A2f2;
    address internal constant CRV_CRVUSD_USDT_LP_ADDRESS =
        0x390f3595bCa2Df7d23783dFd126427CCeb997BF4;
    address internal constant CRV_CRVUSD_USDT_ADDRESS = 0x390f3595bCa2Df7d23783dFd126427CCeb997BF4;

    address internal constant SDT_CRVUSD_USDC_VAULT_ADDRESS =
        0xb618EA40cb1F5b08839Ba228C8dd58AC3DCA12F3;
    address internal constant CRV_CRVUSD_USDC_LP_ADDRESS =
        0x4DEcE678ceceb27446b35C672dC7d61F30bAD69E;
    address internal constant CRV_CRVUSD_USDC_ADDRESS = 0x4DEcE678ceceb27446b35C672dC7d61F30bAD69E;

    address internal constant SDT_FRAX_CRVUSD_VAULT_ADDRESS =
        0x27da51e2d9E5FD70Fb6a27Dd2976377827E52884;
    address internal constant CRV_FRAX_CRVUSD_LP_ADDRESS =
        0x0CD6f267b2086bea681E922E19D40512511BE538;
    address internal constant CRV_FRAX_CRVUSD_ADDRESS = 0x0CD6f267b2086bea681E922E19D40512511BE538;

    address internal constant CRV_BOOSTER_ADDRESS = 0xF403C135812408BFbE8713b5A23a04b3D48AAE31;
    address internal constant CRV_STAKING_BOOSTER_ADDRESS = 0xD8Bd5Cdd145ed2197CB16ddB172DF954e3F28659;
    address internal constant CRV_FX_BOOSTER_ADDRESS = 0xAffe966B27ba3E4Ebb8A0eC124C7b7019CC762f8;

    address internal constant CRV_ETH_stETH_ADDRESS = 0x21E27a5E5513D6e65C4f830167390997aA84843a;
    address internal constant CRV_ETH_stETH_LP_ADDRESS = 0x21E27a5E5513D6e65C4f830167390997aA84843a;
    address internal constant CVX_ETH_stETH_REWARDS_ADDRESS =
        0x6B27D7BC63F1999D14fF9bA900069ee516669ee8;
    uint256 internal constant CVX_ETH_stETH_PID = 177;

    address internal constant SDT_zunUSD_crvUSD_VAULT_ADDRESS = 0x5962E74338FEA24051e039A6106a68082AB58375;

    address internal constant CRV_zunUSD_crvUSD_ADDRESS =
        0x8C24b3213FD851db80245FCCc42c40B94Ac9a745;
    address internal constant CRV_zunUSD_crvUSD_LP_ADDRESS =
        0x8C24b3213FD851db80245FCCc42c40B94Ac9a745;
    address internal constant CVX_zunUSD_crvUSD_REWARDS_ADDRESS =
        0xB0408d1477554268Ece9b0a40290C345196fBf1B;
    uint256 internal constant CVX_zunUSD_crvUSD_PID = 309;

    address internal constant CRV_USDT_crvUSD_ADDRESS = 0x390f3595bCa2Df7d23783dFd126427CCeb997BF4;

    address internal constant LLAMALEND_CRV_ADDRESS = 0xCeA18a8752bb7e7817F9AE7565328FE415C0f2cA;
    address internal constant SDT_LLAMALEND_CRV_VAULT_ADDRESS =
        0xfa6D40573082D797CB3cC378c0837fB90eB043e5;
    address internal constant CVX_LLAMALEND_CRV_REWARDS_ADDRESS =
        0x4bf2d8484474170bff8a8c34475be3d87dFF28cA;
    uint256 internal constant CVX_LLAMALEND_CRV_PID = 325;

    address internal constant LLAMALEND_WETH_ADDRESS = 0x5AE28c9197a4a6570216fC7e53E7e0221D7A0FEF;
    address internal constant SDT_LLAMALEND_WETH_CRVUSD_VAULT_ADDRESS =
        0xADde9073d897743E7004115Fa2452cC959FBF28a;

    address internal constant LLAMALEND_WETH_2_ADDRESS = 0x8fb1c7AEDcbBc1222325C39dd5c1D2d23420CAe3;
    address internal constant SDT_LLAMALEND_WETH_CRVUSD_VAULT_2_ADDRESS =
        0x09f139184d04789B963205c163C73F4beA468b95;

    address internal constant CRV_zunETH_frxETH_ADDRESS =
        0x3A65cbaebBFecbeA5D0CB523ab56fDbda7fF9aAA;
    address internal constant CRV_zunETH_frxETH_LP_ADDRESS =
        0x3A65cbaebBFecbeA5D0CB523ab56fDbda7fF9aAA;
    address internal constant CVX_zunETH_frxETH_REWARDS_ADDRESS =
        0x756d67A10974Fa0e0cE63F82AF4E7ef0d46d452D;
    uint256 internal constant CVX_zunETH_frxETH_PID = 330;

    uint256 internal constant CVX_STAKING_zunETH_frxETH_PID = 75;


    address internal constant SDT_zunETH_frxETH_VAULT_ADDRESS =
        0xAaE1Ae12d4C8b811DDa1188b01be23b4ab7C62D2;

    address internal constant SDT_zunETH_pxETH_VAULT_ADDRESS =
        0x15Fd70a094f7594CCBac1d0092EFF8904b0797d1;
    address internal constant CRV_zunETH_pxETH_ADDRESS =
        0x17D964DA2bD337CfEaEd30a27c9Ab6580676E730;
    address internal constant CRV_zunETH_pxETH_LP_ADDRESS =
        0x17D964DA2bD337CfEaEd30a27c9Ab6580676E730;


    address internal constant SDT_PXETH_WETH_VAULT_ADDRESS = 0x062AdE4F4583fF6b21f6f2c2Ed04eD7037E8B282;
    address internal constant CRV_PXETH_WETH_ADDRESS = 0xC8Eb2Cf2f792F77AF0Cd9e203305a585E588179D;
    address internal constant CRV_PXETH_WETH_LP_ADDRESS = 0xC8Eb2Cf2f792F77AF0Cd9e203305a585E588179D;

    address internal constant SDT_ETH_ETHX_VAULT_ADDRESS = 0xFab07E6758Db5281CF9CEa8Ff82Ffff68177A7CD;
    address internal constant CRV_ETH_ETHX_ADDRESS = 0x59Ab5a5b5d617E478a2479B0cAD80DA7e2831492;
    address internal constant CRV_ETH_ETHX_LP_ADDRESS = 0x59Ab5a5b5d617E478a2479B0cAD80DA7e2831492;

    address internal constant CRV_zunUSD_fxUSD_ADDRESS = 0x13eA95Ce68185e334d3747539845A3b7643a8cab;
    address internal constant CRV_zunUSD_fxUSD_LP_ADDRESS = 0x13eA95Ce68185e334d3747539845A3b7643a8cab;
    uint256 internal constant CVX_zunUSD_fxUSD_PID = 31;

    address internal constant CRV_WBTC_TBTC_ADDRESS = 0xB7ECB2AA52AA64a717180E030241bC75Cd946726;
    address internal constant CRV_WBTC_TBTC_LP_ADDRESS = 0xB7ECB2AA52AA64a717180E030241bC75Cd946726;
    address internal constant CVX_WBTC_TBTC_REWARDS_ADDRESS = 0x5793691B4ba69665213614d7ac722Db2d3f41927;
    uint256 internal constant CVX_WBTC_TBTC_PID = 220;

    address internal constant CRV_CBBTC_WBTC_ADDRESS = 0x839d6bDeDFF886404A6d7a788ef241e4e28F4802;
    address internal constant CRV_CBBTC_WBTC_LP_ADDRESS = 0x839d6bDeDFF886404A6d7a788ef241e4e28F4802;
    address internal constant SDT_CBBTC_WBTC_VAULT_ADDRESS = 0x19812bb16Dc0B7cA3835A71372f91Db9eFF5dcd8;

    address internal constant SDT_zunBTC_tBTC_VAULT_ADDRESS = 0xdb781b5Ee8223B44559ebf057F6845a49b00730F;
    address internal constant CRV_zunBTC_tBTC_ADDRESS = 0x6fBc5Ddc181240Cb1d9bcEc6Fdea429036818035;
    address internal constant CRV_zunBTC_tBTC_LP_ADDRESS = 0x6fBc5Ddc181240Cb1d9bcEc6Fdea429036818035;

    // Will be added after deployment of zunUSD v2 pool and curve pool for zunUSD
    address internal constant CRV_zunUSD_crvFRAX_ADDRESS = address(0);
    address internal constant CRV_zunUSD_crvFRAX_LP_ADDRESS = address(0);
    address internal constant CVX_zunUSD_crvFRAX_REWARDS_ADDRESS = address(0);
    uint256 internal constant CVX_zunUSD_crvFRAX_PID = 0;
}
