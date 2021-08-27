import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { GrantElectionAdapter } from "@popcorn/contracts";
import { getBytes32FromIpfsHash } from "@popcorn/utils";
import bluebird from "bluebird";
import { deployContract } from "ethereum-waffle";
import { BigNumber, Contract, utils } from "ethers";
import { parseEther } from "ethers/lib/utils";
import { ShareType } from "../adapters/GrantElection/GrantElectionAdapter";
const UniswapV2FactoryJSON = require("../artifactsUniswap/UniswapV2Factory.json");
const UniswapV2Router02JSON = require("../artifactsUniswap/UniswapV2Router.json");
const UniswapV2PairJSON = require("../artifactsUniswap/UniswapV2Pair.json");

// This script creates two beneficiaries and one quarterly grant that they are both eligible for. Run this
// Run this instead of the normal deploy.js script
const beneficiaryApplicationCids = [
  "QmNcbrqvXLqScWQ1CDn9V2S2g7rzCzFNo22sWjdE2bQCJ6",
  "Qmexe7BcyAvH5VwScqV6eruCU18G72rXAtNeq8hhMUTMJD",
  "QmU2r3RodJ8DuiDvJAFxoXnqTeX2NJ5Ni5yU7reneYE8sE",
  "QmUw919qE8y4hGH34XLPPScjmWSb4oAJd4VvvKh61HFxEr",
  "QmPVt64krTxNqqdbZfhGgTMj72sHSfTY7Au1J7Qoqh9Hfz",
  "QmPCrpLSwFJJw1YEaEpntd7ANufFKXRKdfX7Y66ik212ZU",
  "QmWUDpdehrQazpVDLeLHkAHfNhFQiFXpvsMfN3hA93JhWV",
  "QmdRE2228xTQ3WhcsxKFJr8AVRea5fVMxnES7srgFSe6rL",
  "QmQVPiwbRES34kcgPc73DzkEjH6Vpbd5ZSmJ5jNUkgTW3f",
  "QmRdGW8AsMNLZ21xpyqE9gmfH5KEc3y6jWD9XCbCY2rt7h",
  "QmS7hWFX9vWxZxmjBjqZePkyUDfWFLNyLwBk1FrvdbgKye",
  "QmXjgrr476d97EcBtgJZY9ZMkdJGHdh3ZoNDvG9Y925Sku",
  "QmTkBonnx625VpdEwVBpusSYoGbWzWxSCPWDToRrk96K5",
  "QmfR7pTMTkR5UMTmcxrU2LYu7bXLy252tFiXQb1q23rm7M",
  "QmQ8WsW1u4tNWwp9b5GuQVpa2h7AEt271sAfGeXmSYSdoQ",
  "QmSAjfr2vGNA6ndNdov9oxKZkZjrpzySjgCet7NkSHQFWn",
  "QmeY6kurdvfgiBKRT7R4WSZigftctLfaaRzFkJ13os1vQ4",
  "QmUz8hMjveD8u71aftChmYBupeTK8VyGyxZ9E6NEULiVUb",
  "QmR8MLaN6WjqXWTaERbBrreQneQKHpsZnV4vwjQ386v1FQ",
  "Qmdz9dhwW318kY2BJVqa2oZzP3nECqyZGM7LsfURBpV7B5",
];

interface Contracts {
  beneficiaryRegistry: Contract;
  mockPop: Contract;
  staking: Contract;
  randomNumberConsumer: Contract;
  grantElections: Contract;
  beneficiaryVaults: Contract;
  rewardsManager: Contract;
  mock3CRV: Contract;
  uniswapFactory: Contract;
  uniswapRouter: Contract;
  uniswapPair: Contract;
  beneficiaryGovernance: Contract;
}

enum Vote {
  Yes,
  No,
}

export default async function deploy(ethers): Promise<void> {
  const GrantTerm = { Month: 0, Quarter: 1, Year: 2 };
  const GrantTermMap = { 0: "Monthly", 1: "Quarterly", 2: "Yearly" };
  const overrides = {
    gasLimit: 9999999,
  };
  let accounts: SignerWithAddress[];
  let bennies: SignerWithAddress[];
  let contracts: Contracts;
  let treasuryFund: SignerWithAddress;
  let insuranceFund: SignerWithAddress;

  const setSigners = async (): Promise<void> => {
    accounts = await ethers.getSigners();
    bennies = accounts.slice(1, 20);
    treasuryFund = accounts[18];
    insuranceFund = accounts[19];
  };

  const deployContracts = async (): Promise<void> => {
    console.log("deploying contracts ...");

    const beneficiaryRegistry = await (
      await (await ethers.getContractFactory("BeneficiaryRegistry")).deploy()
    ).deployed();

    const mockPop = await (
      await (
        await ethers.getContractFactory("MockERC20")
      ).deploy("TestPOP", "TPOP", 18)
    ).deployed();

    const mock3CRV = await (
      await (
        await ethers.getContractFactory("MockERC20")
      ).deploy("3CURVE", "3CRV", 18)
    ).deployed();

    const WETH = await (
      await (await ethers.getContractFactory("WETH9")).deploy()
    ).deployed();

    const staking = await (
      await (await ethers.getContractFactory("Staking")).deploy(mockPop.address)
    ).deployed();

    const uniswapFactory = await deployContract(
      accounts[0],
      UniswapV2FactoryJSON,
      [accounts[0].address]
    );
    const uniswapRouter = await deployContract(
      accounts[0],
      UniswapV2Router02JSON,
      [uniswapFactory.address, WETH.address],
      overrides
    );

    await uniswapFactory.createPair(mock3CRV.address, mockPop.address);
    const uniswapPairAddress = await uniswapFactory.getPair(
      mock3CRV.address,
      mockPop.address
    );
    const uniswapPair = new Contract(
      uniswapPairAddress,
      JSON.stringify(UniswapV2PairJSON.abi),
      accounts[0]
    );

    const beneficiaryVaults = await (
      await (
        await ethers.getContractFactory("BeneficiaryVaults")
      ).deploy(mockPop.address, beneficiaryRegistry.address)
    ).deployed();

    const rewardsManager = await (
      await (
        await ethers.getContractFactory("RewardsManager")
      ).deploy(
        mockPop.address,
        staking.address,
        treasuryFund.address,
        insuranceFund.address,
        beneficiaryVaults.address,
        uniswapRouter.address
      )
    ).deployed();

    await staking
      .connect(accounts[0])
      .setRewardsManager(rewardsManager.address);

    const randomNumberConsumer = await (
      await (
        await ethers.getContractFactory("RandomNumberConsumer")
      ).deploy(
        process.env.ADDR_CHAINLINK_VRF_COORDINATOR,
        process.env.ADDR_CHAINLINK_LINK_TOKEN,
        process.env.ADDR_CHAINLINK_KEY_HASH
      )
    ).deployed();

    const grantElections = await (
      await (
        await ethers.getContractFactory("GrantElections")
      ).deploy(
        staking.address,
        beneficiaryRegistry.address,
        beneficiaryVaults.address,
        randomNumberConsumer.address,
        mockPop.address,
        accounts[0].address
      )
    ).deployed();

    const beneficiaryGovernance = await (
      await (
        await ethers.getContractFactory("BeneficiaryGovernance")
      ).deploy(
        staking.address,
        beneficiaryRegistry.address,
        mockPop.address,
        accounts[0].address
      )
    ).deployed();

    contracts = {
      beneficiaryRegistry,
      mockPop,
      staking,
      randomNumberConsumer,
      grantElections,
      beneficiaryVaults,
      rewardsManager,
      mock3CRV,
      uniswapFactory,
      uniswapRouter,
      uniswapPair,
      beneficiaryGovernance,
    };
  };

  const giveBeneficiariesETH = async (): Promise<void> => {
    console.log("giving ETH to beneficiaries ...");
    await Promise.all(
      bennies.map(async (beneficiary: SignerWithAddress) => {
        const balance = await ethers.provider.getBalance(beneficiary.address);
        if (balance.lt(parseEther(".01"))) {
          return accounts[0].sendTransaction({
            to: beneficiary.address,
            value: utils.parseEther(".02"),
          });
        }
      })
    );
  };

  const addBeneficiaryProposals = async (): Promise<void> => {
    console.log("adding beneficiaries proposals...");
    await bluebird.map(
      bennies.slice(0, 3),
      async (beneficiary) => {
        return contracts.beneficiaryGovernance
          .connect(beneficiary)
          .createProposal(
            beneficiary.address,
            getBytes32FromIpfsHash(
              "QmNcbrqvXLqScWQ1CDn9V2S2g7rzCzFNo22sWjdE2bQCJ6"
            ),
            0,
            { gasLimit: 3000000 }
          );
      },
      { concurrency: 1 }
    );
    console.log("reducing voting period to 0");
    await contracts.beneficiaryGovernance
      .connect(accounts[0])
      .setConfiguration(10, 2 * 86400, parseEther("2000"));

    console.log("adding proposals in veto period");
    await bluebird.map(
      bennies.slice(3, 6),
      async (beneficiary) => {
        return contracts.beneficiaryGovernance
          .connect(beneficiary)
          .createProposal(
            beneficiary.address,
            getBytes32FromIpfsHash(
              "QmNcbrqvXLqScWQ1CDn9V2S2g7rzCzFNo22sWjdE2bQCJ6"
            ),
            0,
            { gasLimit: 3000000 }
          );
      },
      { concurrency: 1 }
    );
    ethers.provider.send("evm_increaseTime", [10]);
    ethers.provider.send("evm_mine", []);

    console.log("reducing veto period to 0");
    await contracts.beneficiaryGovernance
      .connect(accounts[0])
      .setConfiguration(10, 0, parseEther("2000"));

    console.log("adding proposals in finalization period");
    await bluebird.map(
      bennies.slice(6, 10),
      async (beneficiary) => {
        return contracts.beneficiaryGovernance
          .connect(beneficiary)
          .createProposal(
            beneficiary.address,
            getBytes32FromIpfsHash(
              "QmNcbrqvXLqScWQ1CDn9V2S2g7rzCzFNo22sWjdE2bQCJ6"
            ),
            0,
            { gasLimit: 3000000 }
          );
      },
      { concurrency: 1 }
    );
    ethers.provider.send("evm_increaseTime", [10]);
    ethers.provider.send("evm_mine", []);
  };

  const addBeneficiaryTakedownProposals = async (): Promise<void> => {
    console.log("reducing voting period to 0");
    await contracts.beneficiaryGovernance
      .connect(accounts[0])
      .setConfiguration(2 * 60 * 60, 2 * 60 * 60, parseEther("2000"));
    console.log("adding beneficiary takedown proposals...");

    await bluebird.map(
      bennies.slice(11),
      async (beneficiary) => {
        return contracts.beneficiaryGovernance
          .connect(beneficiary)
          .createProposal(
            beneficiary.address,
            getBytes32FromIpfsHash(
              "QmNcbrqvXLqScWQ1CDn9V2S2g7rzCzFNo22sWjdE2bQCJ6"
            ),
            1,
            { gasLimit: 3000000 }
          );
      },
      { concurrency: 1 }
    );
  };

  const voteOnProposals = async (): Promise<void> => {
    console.log("vote on beneficiary proposals ...");
    await contracts.beneficiaryGovernance.connect(bennies[0]).vote(0, Vote.Yes);
    await contracts.beneficiaryGovernance.connect(bennies[0]).vote(1, Vote.No);
    await contracts.beneficiaryGovernance.connect(bennies[0]).vote(2, Vote.No);
    await contracts.beneficiaryGovernance.connect(bennies[1]).vote(2, Vote.Yes);
    await contracts.beneficiaryGovernance.connect(bennies[0]).vote(4, Vote.No);
    await contracts.beneficiaryGovernance.connect(bennies[0]).vote(5, Vote.No);

    await contracts.beneficiaryGovernance.connect(accounts[0]).finalize(6);
    await contracts.beneficiaryGovernance.connect(accounts[0]).finalize(7);
    await contracts.beneficiaryGovernance.connect(accounts[0]).finalize(8);
  };

  const voteOnTakedownProposals = async (): Promise<void> => {
    console.log("vote on beneficiary takedown proposals ...");
    await contracts.beneficiaryGovernance
      .connect(bennies[0])
      .vote(11, Vote.Yes);
    await contracts.beneficiaryGovernance.connect(bennies[0]).vote(13, Vote.No);
    await contracts.beneficiaryGovernance.connect(bennies[1]).vote(13, Vote.No);
    await contracts.beneficiaryGovernance
      .connect(bennies[2])
      .vote(14, Vote.Yes);

    await contracts.beneficiaryGovernance.connect(accounts[0]).finalize(6);
    await contracts.beneficiaryGovernance.connect(accounts[0]).finalize(7);
    await contracts.beneficiaryGovernance.connect(accounts[0]).finalize(8);
  };

  const addBeneficiariesToRegistry = async (): Promise<void> => {
    console.log("adding beneficiaries to registry ...");
    await bluebird.map(
      bennies.slice(11),
      async (beneficiary: SignerWithAddress) => {
        return contracts.beneficiaryRegistry.addBeneficiary(
          beneficiary.address,
          getBytes32FromIpfsHash(
            "QmNcbrqvXLqScWQ1CDn9V2S2g7rzCzFNo22sWjdE2bQCJ6"
          ),
          { gasLimit: 3000000 }
        );
      },
      { concurrency: 1 }
    );
  };

  const mintPOP = async (): Promise<void> => {
    console.log("giving everyone POP (yay!) ...");
    await bluebird.map(
      accounts,
      async (account) => {
        return contracts.mockPop.mint(account.address, parseEther("10000"));
      },
      { concurrency: 1 }
    );
    await bluebird.map(
      accounts,
      async (account) => {
        return contracts.mockPop
          .connect(account)
          .approve(contracts.grantElections.address, parseEther("10000"));
      },
      { concurrency: 1 }
    );
    await bluebird.map(
      accounts,
      async (account) => {
        return contracts.mockPop
          .connect(account)
          .approve(
            contracts.beneficiaryGovernance.address,
            parseEther("10000")
          );
      },
      { concurrency: 1 }
    );
  };

  const prepareUniswap = async (): Promise<void> => {
    console.log("Preparing Uniswap 3CRV-POP Pair...");
    const currentBlock = await ethers.provider.getBlock("latest");
    await contracts.mockPop.mint(accounts[0].address, parseEther("100000"));
    await contracts.mock3CRV.mint(accounts[0].address, parseEther("100000"));
    await contracts.mockPop
      .connect(accounts[0])
      .approve(contracts.uniswapRouter.address, parseEther("100000"));
    await contracts.mock3CRV
      .connect(accounts[0])
      .approve(contracts.uniswapRouter.address, parseEther("100000"));

    await contracts.uniswapRouter.addLiquidity(
      contracts.mockPop.address,
      contracts.mock3CRV.address,
      parseEther("100000"),
      parseEther("100000"),
      parseEther("100000"),
      parseEther("100000"),
      accounts[0].address,
      currentBlock.timestamp + 60
    );
  };

  const fundRewardsManager = async (): Promise<void> => {
    console.log("Funding RewardsManager...");
    await contracts.mockPop.mint(accounts[0].address, parseEther("5000"));
    await contracts.mock3CRV.mint(accounts[0].address, parseEther("10000"));
    await contracts.mockPop
      .connect(accounts[0])
      .transfer(contracts.rewardsManager.address, parseEther("10000"));
    await contracts.mock3CRV
      .connect(accounts[0])
      .transfer(contracts.rewardsManager.address, parseEther("5000"));
  };

  const initializeElectionWithFastVotingEnabled = async (
    grantTerm: number
  ): Promise<void> => {
    console.log(
      `initializing ${GrantTermMap[grantTerm]} election with fast voting enabled ...`
    );
    await contracts.grantElections.setConfiguration(
      GrantTerm.Quarter,
      1, // 1 awardee
      3, // 3 qualifying
      true,
      10, // secs for voting period
      120, // secs for registration period,
      10,
      0,
      false,
      30680,
      true,
      ShareType.EqualWeight
    );

    await contracts.grantElections.initialize(grantTerm);
    console.log(
      await GrantElectionAdapter(contracts.grantElections).electionDefaults(
        grantTerm
      )
    );
  };

  const registerBeneficiariesForElection = async (
    grantTerm,
    bennies
  ): Promise<void> => {
    console.log(
      `registering beneficiaries for election (${GrantTermMap[grantTerm]}) ...`
    );
    await bluebird.map(
      bennies,
      async (beneficiary: SignerWithAddress) => {
        console.log(`registering ${beneficiary.address}`);
        return contracts.grantElections.registerForElection(
          beneficiary.address,
          grantTerm,
          { gasLimit: 3000000 }
        );
      },
      { concurrency: 1 }
    );
  };

  const displayElectionMetadata = async (grantTerm): Promise<void> => {
    console.log(
      `${GrantTermMap[grantTerm]} metadata: `,
      await GrantElectionAdapter(contracts.grantElections).getElectionMetadata(
        grantTerm
      )
    );
  };

  // voting active
  const initializeMonthlyElection = async (): Promise<void> => {
    await initializeElectionWithFastVotingEnabled(GrantTerm.Month);
    await registerBeneficiariesForElection(
      GrantTerm.Month,
      bennies.slice(11, 14)
    );
    await displayElectionMetadata(GrantTerm.Month);
  };

  const stakePOP = async (): Promise<void> => {
    console.log("voters are staking POP ...");
    await bluebird.map(accounts, async (voter: SignerWithAddress) => {
      return contracts.staking
        .connect(voter)
        .stake(utils.parseEther("1000"), 86400 * 365 * 4);
    });
  };

  const voteForElection = async (
    term,
    voters,
    beneficiaries
  ): Promise<void> => {
    while (
      (await contracts.staking.getVoiceCredits(
        voters[voters.length - 1].address
      )) === BigNumber.from("0")
    ) {
      await new Promise((r) => setTimeout(r, 1000));
      console.log("waiting for vote credits to be ready ...");
    }

    console.log(`${voters.length} voting for ${beneficiaries.length} bennies`);
    console.log("voters are voting in election ...");
    await voters.forEach(async (voter) =>
      console.log(
        await (
          await contracts.staking.getVoiceCredits(voter.address)
        ).toString()
      )
    );
    await bluebird.map(
      voters,
      async (voter: SignerWithAddress) => {
        return contracts.grantElections.connect(voter).vote(
          beneficiaries.map((benny) => benny.address),
          [
            utils.parseEther("100"),
            utils.parseEther("200"),
            utils.parseEther("300"),
            utils.parseEther("350"),
          ],
          term
        );
      },
      { concurrency: 1 }
    );
  };

  // voting completed: to be finalized
  const initializeQuarterlyElection = async (): Promise<void> => {
    // set configuration for fast registration & voting
    // register
    // stake POP to vote
    // add some votes
    // refresh election state
    console.log(
      "initializing quarterly election with fast forwarding to closed state ..."
    );
    await contracts.grantElections.setConfiguration(
      GrantTerm.Quarter,
      1, // 1 awardee
      3, // 3 qualifying
      true,
      1, // secs for voting period
      120, // secs for registration period,
      100,
      0,
      false,
      30680,
      true,
      ShareType.EqualWeight
    );
    await contracts.grantElections.initialize(GrantTerm.Quarter);
    console.log(
      await GrantElectionAdapter(contracts.grantElections).electionDefaults(
        GrantTerm.Quarter
      )
    );
    await registerBeneficiariesForElection(
      GrantTerm.Quarter,
      bennies.slice(14, 17)
    );

    let electionMetadata = await GrantElectionAdapter(
      contracts.grantElections
    ).getElectionMetadata(GrantTerm.Quarter);

    console.log("refreshing election state");
    while (electionMetadata.electionState != 1) {
      await new Promise((r) => setTimeout(r, 1000));
      await contracts.grantElections.refreshElectionState(GrantTerm.Quarter);
      electionMetadata = await GrantElectionAdapter(
        contracts.grantElections
      ).getElectionMetadata(GrantTerm.Quarter);
      console.log("waiting for election to be ready for voting...");
    }

    await voteForElection(
      GrantTerm.Quarter,
      accounts.slice(5, 8),
      bennies.slice(14, 17)
    );

    while (electionMetadata.votes.length < 4) {
      await new Promise((r) => setTimeout(r, 1000));
      electionMetadata = await GrantElectionAdapter(
        contracts.grantElections
      ).getElectionMetadata(GrantTerm.Quarter);
      console.log("waiting for votes to confirm ...");
    }

    console.log("refreshing election state");
    while (electionMetadata.electionState != 2) {
      await contracts.grantElections.refreshElectionState(GrantTerm.Quarter);
      electionMetadata = await GrantElectionAdapter(
        contracts.grantElections
      ).getElectionMetadata(GrantTerm.Quarter);
      await new Promise((r) => setTimeout(r, 1000));
      console.log("waiting for election to close...");
    }

    await displayElectionMetadata(GrantTerm.Quarter);
  };

  // registration period
  const initializeYearlyElection = async (): Promise<void> => {
    console.log("initializing yearly election ...");
    await contracts.grantElections.initialize(GrantTerm.Year);
    await new Promise((r) => setTimeout(r, 20000));
    await registerBeneficiariesForElection(GrantTerm.Year, bennies.slice(18));
    await displayElectionMetadata(GrantTerm.Year);
  };

  const approveForStaking = async (): Promise<void> => {
    console.log("approving all accounts for staking ...");
    await bluebird.map(
      accounts,
      async (account) => {
        return contracts.mockPop
          .connect(account)
          .approve(contracts.staking.address, utils.parseEther("100000000"));
      },
      { concurrency: 1 }
    );
  };

  const logResults = async (): Promise<void> => {
    console.log({
      eligibleButNotRegistered: bennies.slice(18, 20).map((bn) => bn.address),
      contracts: {
        beneficiaryRegistry: contracts.beneficiaryRegistry.address,
        mockPop: contracts.mockPop.address,
        staking: contracts.staking.address,
        randomNumberConsumer: contracts.randomNumberConsumer.address,
        grantElections: contracts.grantElections.address,
      },
    });
    console.log(`
Paste this into your .env file:

ADDR_BENEFICIARY_REGISTRY=${contracts.beneficiaryRegistry.address}
ADDR_POP=${contracts.mockPop.address}
ADDR_STAKING=${contracts.staking.address}
ADDR_RANDOM_NUMBER=${contracts.randomNumberConsumer.address}
ADDR_BENEFICIARY_GOVERNANCE=${contracts.beneficiaryGovernance.address}
ADDR_GOVERNANCE=${accounts[0].address}
ADDR_GRANT_ELECTION=${contracts.grantElections.address}
ADDR_BENEFICIARY_VAULT=${contracts.beneficiaryVaults.address}
ADDR_REWARDS_MANAGER=${contracts.rewardsManager.address}
ADDR_UNISWAP_ROUTER=${contracts.uniswapRouter.address}
ADDR_3CRV=${contracts.mock3CRV.address}
    `);
  };

  await setSigners();
  await giveBeneficiariesETH();
  await deployContracts();
  await addBeneficiariesToRegistry();
  await mintPOP();
  await addBeneficiaryProposals();
  await addBeneficiaryTakedownProposals();
  await approveForStaking();
  await prepareUniswap();
  await fundRewardsManager();
  await stakePOP();
  await voteOnProposals();
  await initializeMonthlyElection();
  await initializeQuarterlyElection();
  await initializeYearlyElection();
  await logResults();
}