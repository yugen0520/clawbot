import { expect } from "chai";
import { ethers } from "hardhat";
import { AgentIdentity, AgentVault } from "../typechain-types";

describe("ClawBot Contracts", function () {
  let identity: AgentIdentity;
  let vault: AgentVault;
  let owner: any;
  let user: any;

  beforeEach(async function () {
    [owner, user] = await ethers.getSigners();

    const AgentIdentity = await ethers.getContractFactory("AgentIdentity");
    identity = await AgentIdentity.deploy();
    await identity.waitForDeployment();

    const AgentVault = await ethers.getContractFactory("AgentVault");
    vault = await AgentVault.deploy(
      await identity.getAddress(),
      "ClawBot v1",
      "DeepSeek-v4"
    );
    await vault.waitForDeployment();
  });

  describe("AgentIdentity", function () {
    it("should create an agent and assign owner", async function () {
      const tx = await identity.createAgent("TestBot", "GPT-5");
      const receipt = await tx.wait();

      const agent = await identity.getAgent(1);
      expect(agent.name).to.equal("TestBot");
      expect(agent.owner).to.equal(owner.address);
    });

    it("should log agent actions", async function () {
      await identity.createAgent("TestBot", "GPT-5");
      await identity.logAction(
        1,
        ethers.encodeBytes32String("TEST"),
        "Test action",
        1000
      );

      const action = await identity.getAction(1, 0);
      expect(action.amount).to.equal(1000);
      expect(action.description).to.equal("Test action");
    });
  });

  describe("AgentVault", function () {
    it("should accept deposits", async function () {
      await vault.connect(user).deposit({ value: ethers.parseEther("10") });
      const pos = await vault.getUserPosition(user.address);
      expect(pos.deposited).to.equal(ethers.parseEther("10"));
    });

    it("should execute AI strategy", async function () {
      // Add strategy first
      const stratId = ethers.encodeBytes32String("AGNI_USDC");
      await vault.addStrategy(stratId, "Agni USDC", owner.address, 850);

      // Deposit
      await vault.connect(user).deposit({ value: ethers.parseEther("10") });

      // Execute strategy (AI decision)
      await vault.executeStrategy(
        stratId,
        ethers.parseEther("5"),
        850,
        "AI agent detected highest APY: 8.5% on Agni Finance"
      );

      const strategies = await vault.getAllStrategies();
      expect(strategies[0].totalAllocated).to.equal(ethers.parseEther("5"));
    });

    it("should record on-chain agent action", async function () {
      const stratId = ethers.encodeBytes32String("MOE_MNT_USDC");
      await vault.addStrategy(stratId, "Merchant Moe", owner.address, 1200);
      await vault.connect(user).deposit({ value: ethers.parseEther("1") });

      await vault.executeStrategy(stratId, ethers.parseEther("0.5"), 1200, "Best yield: 12% MNT-USDC");

      const action = await identity.getAction(0, 0);
      expect(action.actionType).to.equal(ethers.keccak256(ethers.toUtf8Bytes("STRATEGY_EXECUTED")));
    });
  });
});
