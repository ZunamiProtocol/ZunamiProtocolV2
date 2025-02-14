const { ethers } = require('hardhat');

// const GOVERNOR_ABI = [
//     "function propose(address[] targets, uint256[] values, bytes[] calldatas, string description) returns (uint256)",
//     "function state(uint256 proposalId) view returns (uint8)",
//     "function execute(address[] targets, uint256[] values, bytes[] calldatas, bytes32 descriptionHash)",
//     "function castVote(uint256 proposalId, uint8 support)"
// ];

async function submitProposal(governor, targets, values, calldatas, description) {
    try {

        console.log("Creating proposal...");
        const tx = await governor.propose(
            targets,
            values,
            calldatas,
            description
        );

        const receipt = await tx.wait();
        console.log("Proposal created! Transaction hash:", receipt.transactionHash);

        const proposalId = receipt.events[0].args.proposalId;
        console.log("Proposal ID:", proposalId.toString());

        return proposalId;

    } catch (error) {
        console.error("Error creating proposal:", error);
        throw error;
    }
}

async function checkProposalState(proposalId, governor) {

    const state = await governor.state(proposalId);
    const states = [
        "Pending",
        "Active",
        "Canceled",
        "Defeated",
        "Succeeded",
        "Queued",
        "Expired",
        "Executed"
    ];

    console.log("Proposal state:", states[state]);
    return state;
}

async function castVote(signer, proposalId, support, governor) {
    const tx = await governor.castVote(proposalId, support);
    await tx.wait();
    console.log("Vote cast successfully!");
}

function encodeFunctionData(contract, functionName, args) {
    return contract.interface.encodeFunctionData(functionName, args);
}

async function main() {
    const [admin] = await ethers.getSigners();
    console.log('Admin:', admin.address);

    const governorAddress = "0xaEcC730A20E7645060C14124E74094B63a94c874";
    const Governor = await ethers.getContractFactory('ZunamiGovernor');
    const governor = await Governor.attach(governorAddress);

    const targets = ["0xaEcC730A20E7645060C14124E74094B63a94c874"];
    const values = [0];
    const calldatas = [
        encodeFunctionData(Governor, "setVotingPeriod", [228800])
    ];
    const description = "Governor: setVotingPeriod 228800";

    try {
        const proposalId = await submitProposal(governor, targets, values, calldatas, description);
        await checkProposalState(proposalId, governor);

    } catch (error) {
        console.error("Error in main:", error);
    }
}


main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
