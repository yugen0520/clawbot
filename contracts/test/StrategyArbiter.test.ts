import { expect } from "chai";
import { ethers } from "hardhat";
import { AgentIdentity, AgentVault, StrategyArbiter } from "../typechain-types";

describe("StrategyArbiter", function () {
  let identity: AgentIdentity;
  let vault: AgentVault;
  let arbiter: StrategyArbiter;
  let owner: any;
  let bot: any;
  let guardian: any;
  let user: any;
  const telegramHash = ethers.keccak256(ethers.encodeBytes32String("test"));

  beforeEach(async function () {
    [owner, bot, guardian, user] = await ethers.getSigners();

    const AgentIdentity = await ethers.getContractFactory("AgentIdentity");
    identity = await AgentIdentity.deploy();
    await identity.waitForDeployment();

    const Arbiter = await ethers.getContractFactory("StrategyArbiter");
    arbiter = await Arbiter.deploy();
    await arbiter.waitForDeployment();

    const Vault = await ethers.getContractFactory("AgentVault");
    vault = await Vault.deploy(
      await identity.getAddress(),
      "ClawBot v1",
      "DeepSeek-v4",
      telegramHash
    );
    await vault.waitForDeployment();

    // Set arbiter on vault
    await vault.setArbiter(await arbiter.getAddress());

    // Stake bot and guardian
    await arbiter.connect(bot).stakeAsBot({ value: ethers.parseEther("0.1") });
    await arbiter.connect(guardian).stakeAsGuardian({ value: ethers.parseEther("2") });
    await arbiter.connect(guardian).setChallengeWindow(5); // 5s for testing

    // Add strategy and deposit
    await vault.addStrategy(
      ethers.encodeBytes32String("AGNI_USDC"),
      "Agni USDC",
      owner.address,
      850
    );
    await vault.connect(user).deposit({ value: ethers.parseEther("10") });
  });

  describe("Intent Publication", function () {
    it("should publish a strategy intent", async function () {
      const tx = await arbiter.connect(bot).publishIntent(
        0, // agentId
        await vault.getAddress(),
        ethers.encodeBytes32String("AGNI_USDC"),
        ethers.parseEther("5"),
        850,
        '[{"action":"deposit","protocol":"Agni","amount":"5 MNT","expectedAPY":"8.5%"}]'
      );
      await tx.wait();

      expect(await arbiter.intentCount()).to.equal(1);
      const intent = await arbiter.intents(0);
      expect(intent.agentId).to.equal(0);
      expect(intent.amount).to.equal(ethers.parseEther("5"));
      expect(intent.executed).to.be.false;
    });

    it("should reject intent publication without bot stake", async function () {
      await expect(
        arbiter.connect(user).publishIntent(
          0, await vault.getAddress(),
          ethers.encodeBytes32String("TEST"),
          ethers.parseEther("1"), 500, "[]"
        )
      ).to.be.revertedWith("Insufficient bot stake");
    });

    it("should lock bot stake on intent publication", async function () {
      await arbiter.connect(bot).publishIntent(
        0, await vault.getAddress(),
        ethers.encodeBytes32String("AGNI_USDC"),
        ethers.parseEther("5"), 850, "[]"
      );
      const info = await arbiter.getBotInfo(bot.address);
      expect(info.lockedStake).to.be.gt(0);
    });
  });

  describe("Challenge Window", function () {
    it("should prevent execution during challenge window", async function () {
      await arbiter.connect(bot).publishIntent(
        0, await vault.getAddress(),
        ethers.encodeBytes32String("AGNI_USDC"),
        ethers.parseEther("5"), 850, "[]"
      );

      const [ok, reason] = await arbiter.canExecute(0);
      expect(ok).to.be.false;
      expect(reason).to.equal("Challenge window still open");
    });

    it("should allow execution after challenge window passes", async function () {
      await arbiter.connect(bot).publishIntent(
        0, await vault.getAddress(),
        ethers.encodeBytes32String("AGNI_USDC"),
        ethers.parseEther("5"), 850, "[]"
      );

      await ethers.provider.send("evm_increaseTime", [10]); // past 5s window
      await ethers.provider.send("evm_mine", []);

      const [ok, reason] = await arbiter.canExecute(0);
      expect(ok).to.be.true;
      expect(reason).to.equal("OK");
    });
  });

  describe("Challenge and Resolution", function () {
    it("should allow guardian to challenge an intent", async function () {
      await arbiter.connect(bot).publishIntent(
        0, await vault.getAddress(),
        ethers.encodeBytes32String("AGNI_USDC"),
        ethers.parseEther("5"), 850, "[]"
      );

      await arbiter.connect(guardian).challengeIntent(0, "Suspicious strategy", {
        value: ethers.parseEther("0.001")
      });

      const intent = await arbiter.intents(0);
      expect(intent.challenged).to.be.true;
    });

    it("should slash bot when challenge is upheld", async function () {
      await arbiter.connect(bot).publishIntent(
        0, await vault.getAddress(),
        ethers.encodeBytes32String("FRAUD"),
        ethers.parseEther("100"), 9999, "[]"
      );

      await arbiter.connect(guardian).challengeIntent(0, "Fraud detected", {
        value: ethers.parseEther("0.001")
      });

      const infoBefore = await arbiter.getBotInfo(bot.address);

      await arbiter.connect(guardian).resolveChallenge(0, true); // uphold = true
      const intent = await arbiter.intents(0);
      expect(intent.challengeUpheld).to.be.true;

      const infoAfter = await arbiter.getBotInfo(bot.address);
      expect(infoAfter.slashCount).to.equal(1);
    });

    it("should unlock bot stake when challenge is rejected", async function () {
      await arbiter.connect(bot).publishIntent(
        0, await vault.getAddress(),
        ethers.encodeBytes32String("LEGIT"),
        ethers.parseEther("5"), 850, "[]"
      );

      await arbiter.connect(guardian).challengeIntent(0, "Spam challenge", {
        value: ethers.parseEther("0.001")
      });

      const infoBefore = await arbiter.getBotInfo(bot.address);

      await arbiter.connect(guardian).resolveChallenge(0, false); // uphold = false
      const intent = await arbiter.intents(0);
      expect(intent.challengeUpheld).to.be.false;

      const infoAfter = await arbiter.getBotInfo(bot.address);
      // Locked stake released, no slash
      expect(infoAfter.lockedStake).to.be.lt(infoBefore.lockedStake);
      expect(infoAfter.slashCount).to.equal(0);
    });

    it("should block execution after challenge is upheld", async function () {
      await arbiter.connect(bot).publishIntent(
        0, await vault.getAddress(),
        ethers.encodeBytes32String("BLOCKED"),
        ethers.parseEther("5"), 850, "[]"
      );

      await arbiter.connect(guardian).challengeIntent(0, "Bad", {
        value: ethers.parseEther("0.001")
      });
      await arbiter.connect(guardian).resolveChallenge(0, true);

      const [ok, reason] = await arbiter.canExecute(0);
      expect(ok).to.be.false;
      expect(reason).to.equal("Challenge upheld - execution blocked");
    });

    it("should reject challenge after window expires", async function () {
      await arbiter.connect(bot).publishIntent(
        0, await vault.getAddress(),
        ethers.encodeBytes32String("LATE"),
        ethers.parseEther("5"), 850, "[]"
      );

      await ethers.provider.send("evm_increaseTime", [20]); // past 5s window
      await ethers.provider.send("evm_mine", []);

      await expect(
        arbiter.connect(guardian).challengeIntent(0, "Too late", {
          value: ethers.parseEther("0.001")
        })
      ).to.be.revertedWith("Challenge window closed");
    });
  });

  describe("Full Execution Flow (Vault + Arbiter)", function () {
    it("should execute strategy after intent published and window passed", async function () {
      const stratId = ethers.encodeBytes32String("AGNI_USDC");

      await arbiter.connect(bot).publishIntent(
        0, await vault.getAddress(), stratId,
        ethers.parseEther("5"), 850, "[]"
      );

      await ethers.provider.send("evm_increaseTime", [10]);
      await ethers.provider.send("evm_mine", []);

      await vault.executeStrategyWithIntent(
        0, stratId, ethers.parseEther("5"), 850,
        "AI agent executed after challenge window"
      );

      const intent = await arbiter.intents(0);
      expect(intent.executed).to.be.true;

      const strategies = await vault.getAllStrategies();
      expect(strategies[0].totalAllocated).to.equal(ethers.parseEther("5"));
    });

    it("should reject execution when arbiter not set", async function () {
      const Vault2 = await ethers.getContractFactory("AgentVault");
      const vault2 = await Vault2.deploy(
        await identity.getAddress(), "NoArbiter", "GPT", telegramHash
      );
      await vault2.waitForDeployment();

      await vault2.addStrategy(
        ethers.encodeBytes32String("TEST"), "Test", owner.address, 500
      );

      await expect(
        vault2.executeStrategyWithIntent(
          0, ethers.encodeBytes32String("TEST"),
          ethers.parseEther("1"), 500, "No arbiter set"
        )
      ).to.be.revertedWith("Arbiter not set");
    });

    it("should reject setting arbiter twice", async function () {
      await expect(
        vault.setArbiter(await arbiter.getAddress())
      ).to.be.revertedWith("Arbiter already set");
    });

    it("should maintain backward compatibility: existing executeStrategy still works", async function () {
      const stratId = ethers.encodeBytes32String("AGNI_USDC");
      await vault.executeStrategy(
        stratId, ethers.parseEther("5"), 850,
        "Legacy execution without arbiter"
      );
      const strategies = await vault.getAllStrategies();
      expect(strategies[0].totalAllocated).to.equal(ethers.parseEther("5"));
    });

    it("should allow execution after challenge is rejected (no double-unlock)", async function () {
      const stratId = ethers.encodeBytes32String("AGNI_USDC");

      await arbiter.connect(bot).publishIntent(
        0, await vault.getAddress(), stratId,
        ethers.parseEther("5"), 850, "[]"
      );

      // Guardian challenges
      await arbiter.connect(guardian).challengeIntent(0, "Spam challenge", {
        value: ethers.parseEther("0.001")
      });

      // Challenge resolved: rejected (bot wins, stake unlocked)
      await arbiter.connect(guardian).resolveChallenge(0, false);

      // Fast-forward past challenge window
      await ethers.provider.send("evm_increaseTime", [10]);
      await ethers.provider.send("evm_mine", []);

      // Should NOT revert from botLockedStake underflow
      await vault.executeStrategyWithIntent(
        0, stratId, ethers.parseEther("5"), 850,
        "Executed after challenge rejected"
      );

      const intent = await arbiter.intents(0);
      expect(intent.executed).to.be.true;
    });
  });
});
