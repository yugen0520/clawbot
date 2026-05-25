import { expect } from "chai";
import { ethers } from "hardhat";
import { AgentIdentity, AgentVault } from "../typechain-types";

describe("ClawBot Contracts", function () {
  let identity: AgentIdentity;
  let vault: AgentVault;
  let owner: any;
  let user: any;
  const telegramHash = ethers.keccak256(ethers.encodeBytes32String("8764147977"));

  beforeEach(async function () {
    [owner, user] = await ethers.getSigners();

    const AgentIdentity = await ethers.getContractFactory("AgentIdentity");
    identity = await AgentIdentity.deploy();
    await identity.waitForDeployment();

    const AgentVault = await ethers.getContractFactory("AgentVault");
    vault = await AgentVault.deploy(
      await identity.getAddress(),
      "ClawBot v1",
      "DeepSeek-v4",
      telegramHash
    );
    await vault.waitForDeployment();
  });

  describe("AgentIdentity", function () {
    it("should create an agent with telegram hash", async function () {
      const tx = await identity.createAgent("TestBot", "GPT-5", ethers.encodeBytes32String("test123"));
      await tx.wait();

      const agent = await identity.getAgent(1);
      expect(agent.name).to.equal("TestBot");
      expect(agent.owner).to.equal(owner.address);
    });

    it("should start with reputation 5000", async function () {
      const agent = await identity.getAgent(0);
      expect(agent.reputationScore).to.equal(5000);
    });

    it("should verify active agent with sufficient reputation", async function () {
      const [valid, score] = await identity.verifyAgent(0);
      expect(valid).to.be.true;
      expect(score).to.equal(5000);
    });

    it("should fail verification for inactive agent", async function () {
      await identity.createAgent("InactiveBot", "GPT-5", ethers.encodeBytes32String("inactive"));
      await identity.setAgentStatus(1, false);
      const [valid] = await identity.verifyAgent(1);
      expect(valid).to.be.false;
    });

    it("should update reputation and record history", async function () {
      await identity.createAgent("RepBot", "GPT-5", ethers.encodeBytes32String("rep"));
      await identity.updateReputation(1, 1000, "Good performance");
      const agent = await identity.getAgent(1);
      expect(agent.reputationScore).to.equal(6000);

      const histLen = await identity.getReputationHistoryLength(1);
      expect(histLen).to.equal(1n);
      const change = await identity.getReputationChange(1, 0);
      expect(change.delta).to.equal(1000);
      expect(change.reason).to.equal("Good performance");
    });

    it("should cap reputation at 10000", async function () {
      await identity.createAgent("CapBot", "GPT-5", ethers.encodeBytes32String("cap"));
      await identity.updateReputation(1, 9999, "Super positive");
      const agent = await identity.getAgent(1);
      expect(agent.reputationScore).to.equal(10000);
    });

    it("should floor reputation at 0", async function () {
      await identity.createAgent("FloorBot", "GPT-5", ethers.encodeBytes32String("floor"));
      await identity.updateReputation(1, -9999, "Very bad");
      const agent = await identity.getAgent(1);
      expect(agent.reputationScore).to.equal(0);
    });

    it("should log agent actions", async function () {
      await identity.createAgent("TestBot", "GPT-5", ethers.encodeBytes32String("test"));
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

    it("should return owner agents for vault address", async function () {
      const vaultAddr = await vault.getAddress();
      const agents = await identity.getOwnerAgents(vaultAddr);
      expect(agents.length).to.equal(1);
      expect(agents[0]).to.equal(0);
    });
  });

  describe("AgentVault", function () {
    it("should accept deposits", async function () {
      await vault.connect(user).deposit({ value: ethers.parseEther("10") });
      const pos = await vault.getUserPosition(user.address);
      expect(pos.deposited).to.equal(ethers.parseEther("10"));
    });

    it("should add strategy", async function () {
      const stratId = ethers.encodeBytes32String("AGNI_USDC");
      await vault.addStrategy(stratId, "Agni USDC", owner.address, 850);
      const strategies = await vault.getAllStrategies();
      expect(strategies.length).to.equal(1);
      expect(strategies[0].name).to.equal("Agni USDC");
    });

    it("should execute AI strategy and log action", async function () {
      const stratId = ethers.encodeBytes32String("AGNI_USDC");
      await vault.addStrategy(stratId, "Agni USDC", owner.address, 850);
      await vault.connect(user).deposit({ value: ethers.parseEther("10") });

      await vault.executeStrategy(
        stratId,
        ethers.parseEther("5"),
        850,
        "AI agent detected highest APY: 8.5% on Agni Finance"
      );

      const strategies = await vault.getAllStrategies();
      expect(strategies[0].totalAllocated).to.equal(ethers.parseEther("5"));

      const action = await identity.getAction(0, 0);
      expect(action.actionType).to.equal(ethers.keccak256(ethers.toUtf8Bytes("STRATEGY_EXECUTED")));
    });

    it("should reject strategy execution from non-owner", async function () {
      const stratId = ethers.encodeBytes32String("AGNI_USDC");
      await vault.addStrategy(stratId, "Agni USDC", owner.address, 850);
      await expect(
        vault.connect(user).executeStrategy(stratId, ethers.parseEther("1"), 850, "test")
      ).to.be.reverted;
    });

    it("should prevent double-allocation of same funds", async function () {
      const stratA = ethers.encodeBytes32String("STRAT_A");
      const stratB = ethers.encodeBytes32String("STRAT_B");
      await vault.addStrategy(stratA, "Strategy A", owner.address, 850);
      await vault.addStrategy(stratB, "Strategy B", owner.address, 650);
      await vault.connect(user).deposit({ value: ethers.parseEther("10") });

      // Allocate 8 to strategy A — should work
      await vault.executeStrategy(stratA, ethers.parseEther("8"), 850, "Allocate 8 to A");

      // Try to allocate 8 to strategy B — only 2 available, should revert
      await expect(
        vault.executeStrategy(stratB, ethers.parseEther("8"), 650, "Try to double-allocate")
      ).to.be.revertedWith("Insufficient available balance");

      // Allocate remaining 2 to B — should work
      await vault.executeStrategy(stratB, ethers.parseEther("2"), 650, "Allocate 2 to B");

      const strategies = await vault.getAllStrategies();
      expect(strategies[0].totalAllocated).to.equal(ethers.parseEther("8"));
      expect(strategies[1].totalAllocated).to.equal(ethers.parseEther("2"));
      expect(await vault.totalAllocated()).to.equal(ethers.parseEther("10"));
    });

    it("should allow withdrawals", async function () {
      await vault.connect(user).deposit({ value: ethers.parseEther("10") });
      await vault.connect(user).withdraw(ethers.parseEther("5"));
      const pos = await vault.getUserPosition(user.address);
      expect(pos.deposited).to.equal(ethers.parseEther("5"));
    });

    // ── Proxy functions (bot wallet → vault → identity) ──

    it("should proxy updateAgentReputation through vault", async function () {
      await vault.updateAgentReputation(500, "Strategy performed well");
      const agent = await identity.getAgent(0);
      expect(agent.reputationScore).to.equal(5500);
    });

    it("should proxy setAgentActive through vault", async function () {
      await vault.setAgentActive(false);
      const agent = await identity.getAgent(0);
      expect(agent.isActive).to.be.false;
      const [valid] = await identity.verifyAgent(0);
      expect(valid).to.be.false;
    });

    it("should proxy updateMinReputation through vault", async function () {
      await vault.updateMinReputation(3000);
      // Create agent with default 5000 rep, threshold now 3000 — should still pass
      const [valid] = await identity.verifyAgent(0);
      expect(valid).to.be.true;
    });

    it("should reject non-owner from proxy functions", async function () {
      await expect(
        vault.connect(user).updateAgentReputation(100, "test")
      ).to.be.revertedWith("Not vault owner");

      await expect(
        vault.connect(user).setAgentActive(false)
      ).to.be.revertedWith("Not vault owner");
    });
  });
});
