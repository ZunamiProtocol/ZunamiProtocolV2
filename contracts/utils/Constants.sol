//SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

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
    address internal constant zunUSD_ADDRESS = address(0); // Will be added after deployment of zunUSD v2 pool
    address internal constant zunUSD_CONTROLLER_ADDRESS = address(0); // Will be added after deployment of zunUSD v2 pool controller
    address internal constant zunETH_ADDRESS = address(0); // Will be added after deployment of zunETH v2 pool

    address public constant CHAINLINK_FEED_REGISTRY_ETH_ADDRESS =
        0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;

    address internal constant CRV_3POOL_ADDRESS = 0xbEbc44782C7dB0a1A60Cb6fe97d0b483032FF1C7;
    address internal constant CRV_3POOL_LP_ADDRESS = 0x6c3F90f043a72FA612cbac8115EE7e52BDe6E490;

    address internal constant CRV_TRICRYPTO2_ADDRESS = 0xD51a44d3FaE010294C616388b506AcdA1bfAAE46;

    address internal constant ETH_frxETH_ADDRESS = 0xa1F8A6807c402E4A15ef4EBa36528A3FED24E577;
    address internal constant ETH_frxETH_LP_ADDRESS = 0xf43211935C781D5ca1a41d2041F397B8A7366C7A;

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

    address internal constant CRV_BOOSTER_ADDRESS = 0xF403C135812408BFbE8713b5A23a04b3D48AAE31;

    address internal constant CRV_ETH_stETH_ADDRESS = 0x21E27a5E5513D6e65C4f830167390997aA84843a;
    address internal constant CRV_ETH_stETH_LP_ADDRESS = 0x21E27a5E5513D6e65C4f830167390997aA84843a;
    address internal constant CVX_ETH_stETH_REWARDS_ADDRESS =
        0x6B27D7BC63F1999D14fF9bA900069ee516669ee8;
    uint256 internal constant CVX_ETH_stETH_PID = 177;

    // Will be added after deployment of zunUSD v2 pool and curve pool for zunUSD
    address internal constant CRV_zunUSD_crvFRAX_ADDRESS = address(0);
    address internal constant CRV_zunUSD_crvFRAX_LP_ADDRESS = address(0);
    address internal constant CVX_zunUSD_crvFRAX_REWARDS_ADDRESS = address(0);
    uint256 internal constant CVX_zunUSD_crvFRAX_PID = 0;

    address internal constant CRV_zunUSD_crvUSD_ADDRESS = address(0);
    address internal constant CRV_zunUSD_crvUSD_LP_ADDRESS = address(0);
    address internal constant CVX_zunUSD_crvUSD_REWARDS_ADDRESS = address(0);
    uint256 internal constant CVX_zunUSD_crvUSD_PID = 0;
}
