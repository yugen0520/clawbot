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
      await identity.updateReputation(1, 500, "Good performance");
      const agent = await identity.getAgent(1);
      expect(agent.reputationScore).to.equal(5500);

      const histLen = await identity.getReputationHistoryLength(1);
      expect(histLen).to.equal(1n);
      const change = await identity.getReputationChange(1, 0);
      expect(change.delta).to.equal(500);
      expect(change.reason).to.equal("Good performance");
    });

    it("should cap reputation at 10000", async function () {
      await identity.createAgent("CapBot", "GPT-5", ethers.encodeBytes32String("cap"));
      await identity.setAuthorizedUpdater(owner.address, true);
      await identity.updateReputationByUpdater(1, 9999, "Super positive");
      const agent = await identity.getAgent(1);
      expect(agent.reputationScore).to.equal(10000);
    });

    it("should floor reputation at 0", async function () {
      await identity.createAgent("FloorBot", "GPT-5", ethers.encodeBytes32String("floor"));
      await identity.setAuthorizedUpdater(owner.address, true);
      await identity.updateReputationByUpdater(1, -9999, "Very bad");
      const agent = await identity.getAgent(1);
      expect(agent.reputationScore).to.equal(0);
    });

    it("should reject updateReputation with delta exceeding max", async function () {
      await identity.createAgent("DeltaBot", "GPT-5", ethers.encodeBytes32String("delta"));
      await expect(
        identity.updateReputation(1, 600, "Too positive")
      ).to.be.revertedWith("Delta exceeds max");
      await expect(
        identity.updateReputation(1, -600, "Too negative")
      ).to.be.revertedWith("Delta exceeds max");
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

    it("should reject vault proxy of updateMinReputation (only owner can set)", async function () {
      // setMinReputation now requires identity owner — vault cannot call it
      await expect(
        vault.updateMinReputation(3000)
      ).to.be.revertedWith("Not owner");
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

  describe("Endorsements (Multi-Agent)", function () {
    let vaultB: AgentVault;

    beforeEach(async function () {
      const Vault = await ethers.getContractFactory("AgentVault");
      vaultB = await Vault.deploy(
        await identity.getAddress(),
        "Agent Beta", "deepseek-chat",
        ethers.encodeBytes32String("beta_telegram")
      );
      await vaultB.waitForDeployment();
      // vault = agentId 0 (ClawBot v1)
      // vaultB = agentId 1 (Agent Beta)
    });

    it("should allow vault A to endorse vault B's agent", async function () {
      await vault.endorseOtherAgent(1, 5, "Excellent agent");
      const stats = await identity.getEndorsementStats(1);
      expect(stats.count).to.equal(1);
      expect(stats.aggregateScore).to.equal(5);

      const agentB = await identity.getAgent(1);
      expect(agentB.reputationScore).to.equal(5100); // 5000 + 100
    });

    it("should deduct reputation for score 1", async function () {
      await vault.endorseOtherAgent(1, 1, "Failed to deliver");
      const agentB = await identity.getAgent(1);
      expect(agentB.reputationScore).to.equal(4900); // 5000 - 100
    });

    it("should add 50 for score 4", async function () {
      await vault.endorseOtherAgent(1, 4, "Good work");
      const agentB = await identity.getAgent(1);
      expect(agentB.reputationScore).to.equal(5050); // 5000 + 50
    });

    it("should add 10 for score 3", async function () {
      await vault.endorseOtherAgent(1, 3, "OK");
      const agentB = await identity.getAgent(1);
      expect(agentB.reputationScore).to.equal(5010); // 5000 + 10
    });

    it("should deduct 30 for score 2", async function () {
      await vault.endorseOtherAgent(1, 2, "Below average");
      const agentB = await identity.getAgent(1);
      expect(agentB.reputationScore).to.equal(4970); // 5000 - 30
    });

    it("should prevent self-endorsement", async function () {
      await expect(
        vault.endorseOtherAgent(0, 5, "Self praise")
      ).to.be.revertedWith("Cannot endorse self");
    });

    it("should prevent duplicate endorsement", async function () {
      await vault.endorseOtherAgent(1, 5, "First");
      await expect(
        vault.endorseOtherAgent(1, 4, "Second")
      ).to.be.revertedWith("Already endorsed");
    });

    it("should prevent endorsement from inactive agent", async function () {
      await vault.setAgentActive(false);
      await expect(
        vault.endorseOtherAgent(1, 5, "Inactive rater")
      ).to.be.revertedWith("Rater inactive");
    });

    it("should prevent endorsement from low-reputation agent", async function () {
      // Authorize owner as updater to bypass delta cap
      await identity.setAuthorizedUpdater(owner.address, true);
      await identity.updateReputationByUpdater(0, -4500, "Bad performance");
      await expect(
        vault.endorseOtherAgent(1, 5, "Low rep rater")
      ).to.be.revertedWith("Rater reputation too low");
    });

    it("should return correct endorsement data", async function () {
      await vault.endorseOtherAgent(1, 4, "Solid agent");
      const e = await identity.getEndorsement(1, 0);
      expect(e.raterAgentId).to.equal(0);
      expect(e.targetAgentId).to.equal(1);
      expect(e.score).to.equal(4);
      expect(e.reason).to.equal("Solid agent");
    });

    it("should get endorsement stats correctly", async function () {
      await vault.endorseOtherAgent(1, 5, "A");
      const vaultC = await (await ethers.getContractFactory("AgentVault")).deploy(
        await identity.getAddress(),
        "Agent Gamma", "deepseek-chat",
        ethers.encodeBytes32String("gamma_telegram")
      );
      await vaultC.waitForDeployment();
      await vaultC.endorseOtherAgent(1, 3, "B");

      const stats = await identity.getEndorsementStats(1);
      expect(stats.count).to.equal(2);
      expect(stats.aggregateScore).to.equal(8); // 5 + 3
    });

    it("should log endorsement in reputation history", async function () {
      await vault.endorseOtherAgent(1, 5, "Great");
      const histLen = await identity.getReputationHistoryLength(1);
      expect(histLen).to.equal(1);
      const change = await identity.getReputationChange(1, 0);
      expect(change.delta).to.equal(100);
      expect(change.reason).to.equal("Great");
    });

    it("should reject non-owner from endorseOtherAgent", async function () {
      await expect(
        vault.connect(user).endorseOtherAgent(1, 5, "Hack")
      ).to.be.revertedWith("Not vault owner");
    });
  });
});
