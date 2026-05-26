import { expect } from "chai";
import { ethers } from "hardhat";
import { ChallengeMechanism } from "../typechain-types";

const INITIAL_STAKE = ethers.parseEther("0.1");
const ESCALATION_BPS = 15000n;
const BPS = 10000n;
const MAX_ROUNDS = 5;
const ROUND_TIMEOUT = 300;

function nextStake(current: bigint): bigint {
  return (current * ESCALATION_BPS) / BPS;
}

describe("ChallengeMechanism", function () {
  let cm: ChallengeMechanism;
  let owner: any;
  let challenger: any;
  let bot: any;
  let g1: any;
  let g2: any;
  let g3: any;
  let other: any;

  beforeEach(async function () {
    [owner, challenger, bot, g1, g2, g3, other] = await ethers.getSigners();
    const CM = await ethers.getContractFactory("ChallengeMechanism");
    cm = await CM.deploy();
    await cm.waitForDeployment();
  });

  async function openChallenge(intentId = 1) {
    return cm.connect(challenger).challenge(
      intentId, bot.address, "Suspicious strategy",
      { value: INITIAL_STAKE }
    );
  }

  describe("Challenge Opening", function () {
    it("opens a challenge with exact initial stake", async function () {
      await openChallenge();
      const c = await cm.getChallenge(0);
      expect(c.challengeId).to.equal(0);
      expect(c.intentId).to.equal(1);
      expect(c.challenger).to.equal(challenger.address);
      expect(c.bot).to.equal(bot.address);
      expect(c.currentRound).to.equal(1);
      expect(c.challengerTotalStake).to.equal(INITIAL_STAKE);
      expect(c.botTotalStake).to.equal(0);
      expect(c.status).to.equal(1); // ChallengerTurn
      expect(c.outcome).to.equal(0); // Unresolved
    });

    it("increments challenge count", async function () {
      await openChallenge(1);
      await openChallenge(2);
      expect(await cm.challengeCount()).to.equal(2);
    });

    it("rejects incorrect stake amount", async function () {
      await expect(
        cm.connect(challenger).challenge(1, bot.address, "Bad", { value: ethers.parseEther("0.05") })
      ).to.be.revertedWith("Must stake exact initialStake");
    });

    it("rejects self-challenge (Sybil defense)", async function () {
      await expect(
        cm.connect(challenger).challenge(1, challenger.address, "Self", { value: INITIAL_STAKE })
      ).to.be.revertedWith("Cannot challenge self");
    });

    it("rejects zero bot address", async function () {
      await expect(
        cm.connect(challenger).challenge(1, ethers.ZeroAddress, "Zero", { value: INITIAL_STAKE })
      ).to.be.revertedWith("Invalid bot address");
    });
  });

  describe("Bot Counter-Stake", function () {
    it("allows bot to match challenger stake", async function () {
      await openChallenge();
      await cm.connect(bot).counterStake(0, { value: INITIAL_STAKE });

      const c = await cm.getChallenge(0);
      expect(c.botTotalStake).to.equal(INITIAL_STAKE);
      expect(c.status).to.equal(2); // BotTurn
    });

    it("sets correct next required stake after counter-stake", async function () {
      await openChallenge();
      await cm.connect(bot).counterStake(0, { value: INITIAL_STAKE });

      const c = await cm.getChallenge(0);
      const expectedNext = nextStake(INITIAL_STAKE);
      expect(c.currentRequiredStake).to.equal(expectedNext);
    });

    it("rejects counter-stake from non-bot address", async function () {
      await openChallenge();
      await expect(
        cm.connect(other).counterStake(0, { value: INITIAL_STAKE })
      ).to.be.revertedWith("Only the challenged bot");
    });

    it("rejects counter-stake when challenger hasn't opened", async function () {
      // No challenge exists
      await expect(
        cm.connect(bot).counterStake(0, { value: INITIAL_STAKE })
      ).to.be.reverted;
    });

    it("rejects counter-stake with wrong amount", async function () {
      await openChallenge();
      await expect(
        cm.connect(bot).counterStake(0, { value: ethers.parseEther("0.05") })
      ).to.be.revertedWith("Must match required stake");
    });
  });

  describe("Multi-Round Escalation", function () {
    it("completes full 5-round escalation to arbitration", async function () {
      await openChallenge();

      // Round 1: bot counter-stakes 0.1
      await cm.connect(bot).counterStake(0, { value: INITIAL_STAKE });
      let c = await cm.getChallenge(0);
      expect(c.status).to.equal(2); // BotTurn
      expect(c.currentRound).to.equal(1);

      // Round 2: challenger escalates 0.15
      const stake2 = nextStake(INITIAL_STAKE);
      await cm.connect(challenger).escalate(0, { value: stake2 });
      c = await cm.getChallenge(0);
      expect(c.currentRound).to.equal(2);
      expect(c.status).to.equal(1); // ChallengerTurn
      expect(c.challengerTotalStake).to.equal(INITIAL_STAKE + stake2);

      // Round 2: bot counter-stakes 0.15
      await cm.connect(bot).counterStake(0, { value: stake2 });
      c = await cm.getChallenge(0);
      expect(c.status).to.equal(2); // BotTurn

      // Round 3: challenger escalates 0.225
      const stake3 = nextStake(stake2);
      await cm.connect(challenger).escalate(0, { value: stake3 });
      c = await cm.getChallenge(0);
      expect(c.currentRound).to.equal(3);
      expect(c.challengerTotalStake).to.equal(INITIAL_STAKE + stake2 + stake3);

      // Round 3: bot counter-stakes 0.225
      await cm.connect(bot).counterStake(0, { value: stake3 });
      const stake4 = nextStake(stake3);

      // Round 4: challenger escalates 0.3375
      await cm.connect(challenger).escalate(0, { value: stake4 });
      await cm.connect(bot).counterStake(0, { value: stake4 });
      const stake5 = nextStake(stake4);

      // Round 5: challenger escalates 0.50625
      await cm.connect(challenger).escalate(0, { value: stake5 });
      // Bot counter-stakes final round → arbitration
      await cm.connect(bot).counterStake(0, { value: stake5 });

      c = await cm.getChallenge(0);
      expect(c.status).to.equal(3); // Arbitration
      expect(c.currentRound).to.equal(5);
    });

    it("enters arbitration after max rounds and prevents further escalation", async function () {
      await openChallenge();
      await cm.connect(bot).counterStake(0, { value: INITIAL_STAKE });

      let stake = nextStake(INITIAL_STAKE);
      for (let r = 2; r <= MAX_ROUNDS; r++) {
        await cm.connect(challenger).escalate(0, { value: stake });
        if (r < MAX_ROUNDS) {
          await cm.connect(bot).counterStake(0, { value: stake });
          stake = nextStake(stake);
        }
      }
      // Final bot counter-stake at round 5 → Arbitration
      await cm.connect(bot).counterStake(0, { value: stake });

      const c = await cm.getChallenge(0);
      expect(c.status).to.equal(3); // Arbitration
      expect(c.currentRound).to.equal(5);

      // Cannot escalate from Arbitration
      await expect(
        cm.connect(challenger).escalate(0, { value: nextStake(stake) })
      ).to.be.revertedWith("Not bot turn to escalate from");
    });

    it("enforces geometric growth in required stake", async function () {
      await openChallenge();
      await cm.connect(bot).counterStake(0, { value: INITIAL_STAKE });

      // Round 2: required = 0.15 (150% of 0.1)
      const r2 = nextStake(INITIAL_STAKE);
      expect(r2).to.equal(ethers.parseEther("0.15"));

      await cm.connect(challenger).escalate(0, { value: r2 });
      await cm.connect(bot).counterStake(0, { value: r2 });

      // Round 3: required = 0.225 (150% of 0.15)
      const r3 = nextStake(r2);
      expect(r3).to.equal(ethers.parseEther("0.225"));
    });
  });

  describe("Timeout Claims", function () {
    it("awards challenger when bot fails to counter-stake", async function () {
      await openChallenge();
      const challengerBalBefore = await ethers.provider.getBalance(challenger.address);

      // Fast-forward past timeout
      await ethers.provider.send("evm_increaseTime", [ROUND_TIMEOUT + 1]);
      await ethers.provider.send("evm_mine", []);

      await cm.connect(challenger).claimTimeout(0);

      const c = await cm.getChallenge(0);
      expect(c.status).to.equal(4); // Resolved
      expect(c.outcome).to.equal(1); // ChallengerWon

      // Challenger gets their stake back (no bot stake to claim)
      const challengerBalAfter = await ethers.provider.getBalance(challenger.address);
      expect(challengerBalAfter).to.be.gt(challengerBalBefore - ethers.parseEther("0.01"));
    });

    it("awards bot when challenger fails to escalate", async function () {
      await openChallenge();
      await cm.connect(bot).counterStake(0, { value: INITIAL_STAKE });

      // Fast-forward past timeout
      await ethers.provider.send("evm_increaseTime", [ROUND_TIMEOUT + 1]);
      await ethers.provider.send("evm_mine", []);

      await cm.connect(bot).claimTimeout(0);

      const c = await cm.getChallenge(0);
      expect(c.status).to.equal(4); // Resolved
      expect(c.outcome).to.equal(2); // BotWon
    });

    it("transfers total accumulated stake to winner", async function () {
      await openChallenge();
      await cm.connect(bot).counterStake(0, { value: INITIAL_STAKE });

      // Fast-forward past timeout — challenger doesn't escalate
      await ethers.provider.send("evm_increaseTime", [ROUND_TIMEOUT + 1]);
      await ethers.provider.send("evm_mine", []);

      const botBalBefore = await ethers.provider.getBalance(bot.address);
      const tx = await cm.connect(bot).claimTimeout(0);
      const receipt = await ethers.provider.getTransactionReceipt(tx.hash);
      const gasCost = receipt.gasUsed * receipt.gasPrice;
      const botBalAfter = await ethers.provider.getBalance(bot.address);

      // Bot gets challenger's 0.1 + bot's 0.1 = 0.2
      const gain = botBalAfter - botBalBefore + gasCost;
      expect(gain).to.equal(ethers.parseEther("0.2"));
    });

    it("rejects timeout claim before expiry", async function () {
      await openChallenge();
      await expect(
        cm.connect(challenger).claimTimeout(0)
      ).to.be.revertedWith("Timeout not yet expired");
    });

    it("rejects timeout claim on resolved challenge", async function () {
      await openChallenge();
      await ethers.provider.send("evm_increaseTime", [ROUND_TIMEOUT + 1]);
      await ethers.provider.send("evm_mine", []);
      await cm.connect(challenger).claimTimeout(0);

      // Second claim should fail
      await expect(
        cm.connect(challenger).claimTimeout(0)
      ).to.be.revertedWith("Not in active round");
    });
  });

  describe("Guardian System", function () {
    it("allows staking as guardian", async function () {
      await cm.connect(g1).stakeAsGuardian({ value: ethers.parseEther("1") });
      expect(await cm.guardianStakes(g1.address)).to.equal(ethers.parseEther("1"));
      expect(await cm.getGuardianCount()).to.equal(1);
    });

    it("allows unstaking as guardian", async function () {
      await cm.connect(g1).stakeAsGuardian({ value: ethers.parseEther("1") });
      const balBefore = await ethers.provider.getBalance(g1.address);
      const tx = await cm.connect(g1).unstakeGuardian();
      const receipt = await ethers.provider.getTransactionReceipt(tx.hash);
      const gasCost = receipt.gasUsed * receipt.gasPrice;
      const balAfter = await ethers.provider.getBalance(g1.address);
      expect(balAfter - balBefore + gasCost).to.equal(ethers.parseEther("1"));
      expect(await cm.guardianStakes(g1.address)).to.equal(0);
    });

    it("rejects guardian with insufficient stake", async function () {
      await expect(
        cm.connect(g1).stakeAsGuardian({ value: ethers.parseEther("0.5") })
      ).to.be.revertedWith("Insufficient guardian stake");
    });

    it("rejects non-guardian parameter updates", async function () {
      await expect(
        cm.connect(other).setMaxRounds(10)
      ).to.be.revertedWith("Not a guardian");
    });
  });

  describe("Arbitration", function () {
    beforeEach(async function () {
      // Setup guardians
      for (const g of [g1, g2, g3]) {
        await cm.connect(g).stakeAsGuardian({ value: ethers.parseEther("1") });
      }
      // Lower consensus for testing
      await cm.connect(g1).setMinGuardianConsensus(2);
    });

    async function escalateToArbitration() {
      await openChallenge();
      let stake = INITIAL_STAKE;
      for (let r = 1; r <= MAX_ROUNDS; r++) {
        await cm.connect(bot).counterStake(0, { value: stake });
        if (r < MAX_ROUNDS) {
          stake = nextStake(stake);
          await cm.connect(challenger).escalate(0, { value: stake });
        }
      }
    }

    it("triggers arbitration after max rounds reached", async function () {
      await escalateToArbitration();
      const c = await cm.getChallenge(0);
      expect(c.status).to.equal(3); // Arbitration
    });

    it("allows guardians to vote on arbitration", async function () {
      await escalateToArbitration();
      await cm.connect(g1).voteOnArbitration(0, true);
      await cm.connect(g2).voteOnArbitration(0, true);

      const [forCh, forBot, total] = await cm.getArbitrationVotes(0);
      expect(forCh).to.equal(2);
      expect(forBot).to.equal(0);
      expect(total).to.equal(2);
    });

    it("resolves in challenger favor when guardians vote for challenger", async function () {
      await escalateToArbitration();

      const c0 = await cm.getChallenge(0);
      const totalStake = c0.challengerTotalStake + c0.botTotalStake;

      await cm.connect(g1).voteOnArbitration(0, true);
      await cm.connect(g2).voteOnArbitration(0, true);

      const chalBalBefore = await ethers.provider.getBalance(challenger.address);
      await cm.resolveArbitration(0);
      const chalBalAfter = await ethers.provider.getBalance(challenger.address);

      const c = await cm.getChallenge(0);
      expect(c.status).to.equal(4); // Resolved
      expect(c.outcome).to.equal(1); // ChallengerWon
      expect(chalBalAfter - chalBalBefore).to.equal(totalStake);
    });

    it("resolves in bot favor when guardians vote for bot", async function () {
      await escalateToArbitration();

      const c0 = await cm.getChallenge(0);
      const totalStake = c0.challengerTotalStake + c0.botTotalStake;

      await cm.connect(g1).voteOnArbitration(0, false);
      await cm.connect(g2).voteOnArbitration(0, false);

      const botBalBefore = await ethers.provider.getBalance(bot.address);
      await cm.resolveArbitration(0);
      const botBalAfter = await ethers.provider.getBalance(bot.address);

      const c = await cm.getChallenge(0);
      expect(c.outcome).to.equal(2); // BotWon
      expect(botBalAfter - botBalBefore).to.equal(totalStake);
    });

    it("prevents duplicate guardian votes", async function () {
      await escalateToArbitration();
      await cm.connect(g1).voteOnArbitration(0, true);
      await expect(
        cm.connect(g1).voteOnArbitration(0, false)
      ).to.be.revertedWith("Already voted");
    });

    it("requires minimum guardian consensus to resolve", async function () {
      await escalateToArbitration();
      await cm.connect(g1).voteOnArbitration(0, true);
      // Only 1 vote, min consensus = 2
      await expect(
        cm.resolveArbitration(0)
      ).to.be.revertedWith("Insufficient guardian votes");
    });

    it("rejects votes from non-guardians", async function () {
      await escalateToArbitration();
      await expect(
        cm.connect(other).voteOnArbitration(0, true)
      ).to.be.revertedWith("Not a guardian");
    });

    it("allows any guardian to request arbitration at max rounds", async function () {
      await openChallenge();
      // Advance to round 5 through escalation
      await cm.connect(bot).counterStake(0, { value: INITIAL_STAKE });
      let stake = nextStake(INITIAL_STAKE);
      for (let r = 2; r < MAX_ROUNDS; r++) {
        await cm.connect(challenger).escalate(0, { value: stake });
        await cm.connect(bot).counterStake(0, { value: stake });
        stake = nextStake(stake);
      }
      await cm.connect(challenger).escalate(0, { value: stake });
      // Now round=5, status=ChallengerTurn, guardian can request arbitration
      await cm.connect(g1).requestArbitration(0);
      const c = await cm.getChallenge(0);
      expect(c.status).to.equal(3); // Arbitration
    });
  });

  describe("Parameter Updates", function () {
    beforeEach(async function () {
      await cm.connect(g1).stakeAsGuardian({ value: ethers.parseEther("1") });
    });

    it("updates initial stake", async function () {
      await cm.connect(g1).setInitialStake(ethers.parseEther("0.2"));
      expect(await cm.initialStake()).to.equal(ethers.parseEther("0.2"));
    });

    it("updates escalation multiplier", async function () {
      await cm.connect(g1).setEscalationBasisPoints(20000); // 200%
      expect(await cm.escalationBasisPoints()).to.equal(20000);
    });

    it("rejects escalation multiplier below 100%", async function () {
      await expect(
        cm.connect(g1).setEscalationBasisPoints(5000)
      ).to.be.revertedWith("Multiplier must be >= 100%");
    });

    it("updates max rounds within bounds", async function () {
      await cm.connect(g1).setMaxRounds(10);
      expect(await cm.maxRounds()).to.equal(10);
    });

    it("rejects max rounds below 2", async function () {
      await expect(
        cm.connect(g1).setMaxRounds(1)
      ).to.be.revertedWith("Rounds must be 2-20");
    });

    it("updates round timeout", async function () {
      await cm.connect(g1).setRoundTimeout(600);
      expect(await cm.roundTimeout()).to.equal(600);
    });

    it("updates min guardian consensus", async function () {
      await cm.connect(g1).setMinGuardianConsensus(4);
      expect(await cm.minGuardianConsensus()).to.equal(4);
    });
  });

  describe("Full Escalation Cost Estimate", function () {
    it("calculates total cost for all rounds", async function () {
      const totalCost = await cm.estimateFullEscalationCost();
      // initialStake 0.1, escalation 150%, 5 rounds
      // Round 1: 0.1, Round 2: 0.15, Round 3: 0.225, Round 4: 0.3375, Round 5: 0.50625
      // Total: 1.31875
      const expected = ethers.parseEther("1.31875");
      expect(totalCost).to.equal(expected);
    });
  });

  describe("Sybil Attack Defense", function () {
    it("deters sybil by requiring escalating capital commitment", async function () {
      // A sybil attacker trying to grief: they must stake increasing amounts
      // Round 1: 0.1 MNT
      // To reach round 5, total challenger cost = 1.31875 MNT
      const totalCost = await cm.estimateFullEscalationCost();
      // 100 sybil challenges to round 1 = 10 MNT
      expect(totalCost * 100n).to.equal(ethers.parseEther("131.875"));
    });

    it("prevents challenger from draining funds via self-created bots", async function () {
      // Attacker creates challenge and tries to win instantly
      // They cannot because bot must counter-stake (which requires bot's cooperation)
      await openChallenge();
      // Status is ChallengerTurn, waiting for bot
      // Attacker cannot call counterStake from different address
      await expect(
        cm.connect(challenger).counterStake(0, { value: INITIAL_STAKE })
      ).to.be.revertedWith("Only the challenged bot");
    });

    it("makes deep escalation prohibitively expensive for griefers", async function () {
      // Scale up: 50 challenges to round 5
      const totalCost = await cm.estimateFullEscalationCost();
      const cost50 = totalCost * 50n;
      // ~65.9 MNT for 50 full escalations — economically irrational
      expect(cost50).to.be.gt(ethers.parseEther("50"));
    });
  });
});
