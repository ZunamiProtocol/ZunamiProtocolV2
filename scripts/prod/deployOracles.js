const { ethers } = require('hardhat');

async function main() {
    console.log('Start deploy');

    const CurveRegistryCacheFactory = await ethers.getContractFactory('CurveRegistryCache');
    const curveRegistryCache = await CurveRegistryCacheFactory.deploy();
    console.log('CurveRegistryCache deployed to:', curveRegistryCache.address);

    const ChainlinkOracleFactory = await ethers.getContractFactory('ChainlinkOracle');
    const chainlinkOracle = await ChainlinkOracleFactory.deploy();
    console.log('ChainlinkOracle deployed to:', chainlinkOracle.address);

    const GenericOracleFactory = await ethers.getContractFactory('GenericOracle');
    const genericOracle = await GenericOracleFactory.deploy();
    console.log('GenericOracle deployed to:', genericOracle.address);

    const CurveLPOracleFactory = await ethers.getContractFactory('CurveLPOracle');
    const curveLPOracle = await CurveLPOracleFactory.deploy(
        genericOracle.address,
        curveRegistryCache.address
    );
    console.log('CurveLPOracle deployed to:', curveLPOracle.address);

    await genericOracle.initialize(curveLPOracle.address, chainlinkOracle.address);
    console.log('GenericOracle initialized with:', curveLPOracle.address, chainlinkOracle.address);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
