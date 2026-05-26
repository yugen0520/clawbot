import { expect } from "chai";
import { ethers } from "hardhat";
import { AgentIdentity, ReputationCalculator } from "../typechain-types";

describe("ReputationCalculator", function () {
  let identity: AgentIdentity;
  let calculator: ReputationCalculator;
  let owner: any;
  let bot: any;
  let guardian1: any;
  let guardian2: any;
  let guardian3: any;
  let agentId: number = 0;

  beforeEach(async function () {
    [owner, bot, guardian1, guardian2, guardian3] = await ethers.getSigners();

    const AgentIdentity = await ethers.getContractFactory("AgentIdentity");
    identity = await AgentIdentity.deploy();
    await identity.waitForDeployment();

    const Calc = await ethers.getContractFactory("ReputationCalculator");
    calculator = await Calc.deploy(await identity.getAddress());
    await calculator.waitForDeployment();

    // Bot creates its own agent and authorizes calculator as updater
    const tx = await identity.connect(bot).createAgent("TestBot", "DeepSeek-v4", ethers.encodeBytes32String("test"));
    await tx.wait();
    agentId = 0;

    await identity.setAuthorizedUpdater(await calculator.getAddress(), true);

    // Set a short challenge window for testing
  });

  describe("Staking", function () {
    it("should allow bot to stake as submitter", async function () {
      await calculator.connect(bot).stakeAsSubmitter({ value: ethers.parseEther("0.1") });
      const info = await calculator.getSubmitterInfo(bot.address);
      expect(info.totalStake).to.equal(ethers.parseEther("0.1"));
      expect(info.available).to.equal(ethers.parseEther("0.1"));
    });

    it("should reject insufficient submitter stake", async function () {
      await expect(
        calculator.connect(bot).stakeAsSubmitter({ value: ethers.parseEther("0.001") })
      ).to.be.revertedWith("Insufficient stake");
    });

    it("should allow guardian to stake", async function () {
      await calculator.connect(guardian1).stakeAsGuardian({ value: ethers.parseEther("2") });
      expect(await calculator.getGuardianCount()).to.equal(1);
    });

    it("should allow bot to withdraw unlocked stake", async function () {
      await calculator.connect(bot).stakeAsSubmitter({ value: ethers.parseEther("0.1") });
      await calculator.connect(bot).withdrawSubmitterStake(ethers.parseEther("0.05"));
      const info = await calculator.getSubmitterInfo(bot.address);
      expect(info.totalStake).to.equal(ethers.parseEther("0.05"));
    });
  });

  describe("Strategy Result Submission", function () {
    beforeEach(async function () {
      await calculator.connect(bot).stakeAsSubmitter({ value: ethers.parseEther("0.1") });
      // Owner (identity creator) stakes as guardian so we can set challenge window
      await calculator.connect(owner).stakeAsGuardian({ value: ethers.parseEther("2") });
      await calculator.connect(owner).setChallengeWindow(5); // 5 seconds for testing
    });

    it("should submit strategy result and lock stake", async function () {
      const tx = await calculator.connect(bot).submitStrategyResult(
        agentId,
        ethers.encodeBytes32String("AGNI_USDC"),
        850, // 8.5% APY
        ethers.parseEther("5"),
        Math.floor(Date.now() / 1000),
        Math.floor(Date.now() / 1000) - 10, // 10s early
        "Strategy executed on Agni Finance"
      );
      await tx.wait();

      expect(await calculator.resultCount()).to.equal(1);
      const result = await calculator.results(0);
      expect(result.agentId).to.equal(agentId);
      expect(result.apyBasisPoints).to.equal(850);
      expect(result.amount).to.equal(ethers.parseEther("5"));

      // Stake should be partially locked
      const info = await calculator.getSubmitterInfo(bot.address);
      expect(info.lockedStake).to.be.gt(0);
    });

    it("should reject submission without sufficient stake", async function () {
      await expect(
        calculator.connect(guardian2).submitStrategyResult(
          agentId,
          ethers.encodeBytes32String("TEST"),
          500, ethers.parseEther("1"),
          Math.floor(Date.now() / 1000),
          Math.floor(Date.now() / 1000),
          "No stake"
        )
      ).to.be.revertedWith("Insufficient stake");
    });

    it("should reject submission from non-owner with stake", async function () {
      // guardian2 stakes, but bot (agentId=0 owner) is the agent owner
      await calculator.connect(guardian2).stakeAsSubmitter({ value: ethers.parseEther("0.1") });
      await expect(
        calculator.connect(guardian2).submitStrategyResult(
          agentId,
          ethers.encodeBytes32String("TEST"),
          500, ethers.parseEther("1"),
          Math.floor(Date.now() / 1000),
          Math.floor(Date.now() / 1000),
          "Not my agent"
        )
      ).to.be.revertedWith("Not the agent owner");
    });
  });

  describe("Reputation Computation", function () {
    beforeEach(async function () {
      await calculator.connect(bot).stakeAsSubmitter({ value: ethers.parseEther("0.1") });
      await calculator.connect(owner).stakeAsGuardian({ value: ethers.parseEther("2") });
      await calculator.connect(owner).setChallengeWindow(3);
    });

    it("should increase reputation for above-benchmark APY", async function () {
      const now = Math.floor(Date.now() / 1000);
      await calculator.connect(bot).submitStrategyResult(
        agentId, ethers.encodeBytes32String("HIGH_APY"),
        1200, // 12% APY — well above 5% benchmark
        ethers.parseEther("10"),
        now - 5, // executed 5s ago
        now,     // expected now (executed early = timeliness bonus)
        "High yield strategy"
      );

      // Wait for challenge window
      await ethers.provider.send("evm_increaseTime", [10]);
      await ethers.provider.send("evm_mine", []);

      const agentBefore = await identity.getAgent(agentId);
      await calculator.finalizeResult(0);

      const agentAfter = await identity.getAgent(agentId);
      // Should have increased due to high APY + timeliness bonus
      expect(agentAfter.reputationScore).to.be.gt(agentBefore.reputationScore);
    });

    it("should compute positive delta for timely execution with good APY", async function () {
      const now = Math.floor(Date.now() / 1000);
      await calculator.connect(bot).submitStrategyResult(
        agentId, ethers.encodeBytes32String("GOOD"),
        800, // 8% APY
        ethers.parseEther("5"),
        now,     // on time
        now + 60, // expected later (executed early)
        "Timely execution"
      );

      await ethers.provider.send("evm_increaseTime", [10]);
      await ethers.provider.send("evm_mine", []);

      const before = (await identity.getAgent(agentId)).reputationScore;
      await calculator.finalizeResult(0);
      const after = (await identity.getAgent(agentId)).reputationScore;
      expect(after).to.be.gt(before);
    });

    it("should penalize severely underperforming APY", async function () {
      const now = Math.floor(Date.now() / 1000);
      await calculator.connect(bot).submitStrategyResult(
        agentId, ethers.encodeBytes32String("BAD_APY"),
        100, // 1% APY — below 2% threshold
        ethers.parseEther("5"),
        now + 7200, // 2 hours late
        now,
        "Underperforming strategy"
      );

      await ethers.provider.send("evm_increaseTime", [10]);
      await ethers.provider.send("evm_mine", []);

      const before = (await identity.getAgent(agentId)).reputationScore;
      await calculator.finalizeResult(0);
      const after = (await identity.getAgent(agentId)).reputationScore;
      expect(after).to.be.lt(before);
    });

    it("should apply default penalty via reportDefault", async function () {
      const before = (await identity.getAgent(agentId)).reputationScore;
      await calculator.connect(bot).reportDefault(agentId, "Strategy defaulted");
      const after = (await identity.getAgent(agentId)).reputationScore;
      expect(after).to.equal(Number(before) - 500); // defaultPenalty = -500
    });

    it("should apply time decay to accumulated score", async function () {
      const now = Math.floor(Date.now() / 1000);
      // Submit a good result
      await calculator.connect(bot).submitStrategyResult(
        agentId, ethers.encodeBytes32String("GOOD"),
        1000, ethers.parseEther("5"), now, now,
        "Good strategy"
      );

      await ethers.provider.send("evm_increaseTime", [10]);
      await ethers.provider.send("evm_mine", []);
      await calculator.finalizeResult(0);

      const repAfterGood = (await identity.getAgent(agentId)).reputationScore;
      expect(repAfterGood).to.be.gt(5000);

      // Fast-forward past decay period
      await ethers.provider.send("evm_increaseTime", [31 * 24 * 3600]); // 31 days
      await ethers.provider.send("evm_mine", []);

      // Effective reputation should decay back toward baseline
      const effective = await calculator.getEffectiveReputation(agentId);
      expect(effective).to.be.lte(repAfterGood);
    });

    it("should revert finalizeResult on non-existent result", async function () {
      await expect(
        calculator.finalizeResult(999)
      ).to.be.revertedWith("Result not found");
    });

    it("should revert finalizeResult on challenged result", async function () {
      const now = Math.floor(Date.now() / 1000);
      await calculator.connect(bot).submitStrategyResult(
        agentId, ethers.encodeBytes32String("TEST"),
        800, ethers.parseEther("5"), now, now,
        "Test"
      );

      // Guardian challenges within window
      await calculator.connect(owner).challengeResult(0);

      // Fast-forward past challenge window
      await ethers.provider.send("evm_increaseTime", [10]);
      await ethers.provider.send("evm_mine", []);

      // finalizeResult should revert because result was challenged
      await expect(
        calculator.finalizeResult(0)
      ).to.be.revertedWith("Challenged result, use resolveChallenge");
    });
  });

  describe("Challenge and Guardian Voting", function () {
    beforeEach(async function () {
      await calculator.connect(bot).stakeAsSubmitter({ value: ethers.parseEther("0.1") });
      await calculator.connect(guardian1).stakeAsGuardian({ value: ethers.parseEther("2") });
      await calculator.connect(guardian2).stakeAsGuardian({ value: ethers.parseEther("2") });
      await calculator.connect(guardian3).stakeAsGuardian({ value: ethers.parseEther("2") });
      // Set parameters via guardian
      await calculator.connect(guardian1).setChallengeWindow(60);
      await calculator.connect(guardian1).setGuardianQuorum(3);
    });

    it("should allow guardian to challenge a result", async function () {
      const now = Math.floor(Date.now() / 1000);
      await calculator.connect(bot).submitStrategyResult(
        agentId, ethers.encodeBytes32String("TEST"),
        500, ethers.parseEther("5"), now, now,
        "Test strategy"
      );

      await calculator.connect(guardian1).challengeResult(0);
      const result = await calculator.results(0);
      expect(result.challenged).to.be.true;
    });

    it("should reject challenge after window expires", async function () {
      const now = Math.floor(Date.now() / 1000);
      await calculator.connect(bot).submitStrategyResult(
        agentId, ethers.encodeBytes32String("TEST"),
        500, ethers.parseEther("5"), now, now,
        "Test strategy"
      );

      await ethers.provider.send("evm_increaseTime", [120]); // past 60s window
      await ethers.provider.send("evm_mine", []);

      await expect(
        calculator.connect(guardian1).challengeResult(0)
      ).to.be.revertedWith("Challenge window closed");
    });

    it("should allow guardians to vote on challenge", async function () {
      const now = Math.floor(Date.now() / 1000);
      await calculator.connect(bot).submitStrategyResult(
        agentId, ethers.encodeBytes32String("TEST"),
        500, ethers.parseEther("5"), now, now,
        "Test strategy"
      );

      await calculator.connect(guardian1).challengeResult(0);
      await calculator.connect(guardian1).voteOnChallenge(0, false);
      await calculator.connect(guardian2).voteOnChallenge(0, false);
      await calculator.connect(guardian3).voteOnChallenge(0, false);

      expect(await calculator.guardianInvalidVotes(0)).to.equal(3);
    });

    it("should reject duplicate vote from same guardian", async function () {
      const now = Math.floor(Date.now() / 1000);
      await calculator.connect(bot).submitStrategyResult(
        agentId, ethers.encodeBytes32String("TEST"),
        500, ethers.parseEther("5"), now, now,
        "Test strategy"
      );

      await calculator.connect(guardian1).challengeResult(0);
      await calculator.connect(guardian1).voteOnChallenge(0, true);
      await expect(
        calculator.connect(guardian1).voteOnChallenge(0, true)
      ).to.be.revertedWith("Already voted");
    });

    it("should slash submitter when challenge upheld by guardian majority", async function () {
      const now = Math.floor(Date.now() / 1000);
      await calculator.connect(bot).submitStrategyResult(
        agentId, ethers.encodeBytes32String("FRAUD"),
        9999, ethers.parseEther("100"), now, now,
        "Suspicious data"
      );

      await calculator.connect(guardian1).challengeResult(0);
      await calculator.connect(guardian1).voteOnChallenge(0, false);
      await calculator.connect(guardian2).voteOnChallenge(0, false);
      await calculator.connect(guardian3).voteOnChallenge(0, false);

      await ethers.provider.send("evm_increaseTime", [120]);
      await ethers.provider.send("evm_mine", []);

      await calculator.resolveChallenge(0);
      const result = await calculator.results(0);
      expect(result.valid).to.be.false;

      const info = await calculator.getSubmitterInfo(bot.address);
      expect(info.slashCount).to.equal(1);
    });
  });

  describe("Authorized Updater (AgentIdentity integration)", function () {
    it("should allow authorized calculator to update reputation", async function () {
      await calculator.connect(bot).stakeAsSubmitter({ value: ethers.parseEther("0.1") });
      await calculator.connect(owner).stakeAsGuardian({ value: ethers.parseEther("2") });
      await calculator.connect(owner).setChallengeWindow(3);

      const now = Math.floor(Date.now() / 1000);
      await calculator.connect(bot).submitStrategyResult(
        agentId, ethers.encodeBytes32String("GOOD"),
        1200, ethers.parseEther("5"), now - 10, now,
        "Good strategy"
      );

      await ethers.provider.send("evm_increaseTime", [10]);
      await ethers.provider.send("evm_mine", []);

      await calculator.finalizeResult(0);
      // Check that reputation history was updated
      const histLen = await identity.getReputationHistoryLength(agentId);
      expect(histLen).to.be.gt(0);
    });

    it("should reject unauthorized updater", async function () {
      await expect(
        identity.connect(bot).updateReputationByUpdater(agentId, 100, "Hack")
      ).to.be.revertedWith("Not authorized updater");
    });

    it("should allow agent owner to set/remove authorized updater", async function () {
      await identity.setAuthorizedUpdater(bot.address, true);
      expect(await identity.authorizedReputationUpdaters(bot.address)).to.be.true;

      await identity.setAuthorizedUpdater(bot.address, false);
      expect(await identity.authorizedReputationUpdaters(bot.address)).to.be.false;
    });

    it("should reject non-owner setting authorized updater", async function () {
      await expect(
        identity.connect(bot).setAuthorizedUpdater(bot.address, true)
      ).to.be.revertedWith("Not owner");
    });
  });

  describe("Effective Reputation (time-decay view)", function () {
    beforeEach(async function () {
      await calculator.connect(bot).stakeAsSubmitter({ value: ethers.parseEther("0.2") });
      await calculator.connect(owner).stakeAsGuardian({ value: ethers.parseEther("2") });
      await calculator.connect(owner).setChallengeWindow(3);
    });

    it("should return baseline reputation with no history", async function () {
      const effective = await calculator.getEffectiveReputation(agentId);
      expect(effective).to.equal(5000);
    });

    it("should reflect live decay-adjusted reputation after submissions", async function () {
      const now = Math.floor(Date.now() / 1000);
      for (let i = 0; i < 3; i++) {
        await calculator.connect(bot).submitStrategyResult(
          agentId,
          ethers.encodeBytes32String("REPEAT_" + i),
          1200, ethers.parseEther("5"), now - 10, now,
          "Good strategy " + i
        );
        await ethers.provider.send("evm_increaseTime", [10]);
        await ethers.provider.send("evm_mine", []);
        await calculator.finalizeResult(i);
      }

      const effective = await calculator.getEffectiveReputation(agentId);
      expect(effective).to.be.gt(5000);
    });
  });
});
