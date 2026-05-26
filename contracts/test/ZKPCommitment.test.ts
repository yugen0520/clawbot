import { expect } from "chai";
import { ethers } from "hardhat";
import { AgentIdentity, AgentVault, StrategyArbiter, CommitmentVerifier } from "../typechain-types";

describe("ZKP Commitment (Commit-Reveal)", function () {
  let identity: AgentIdentity;
  let vault: AgentVault;
  let arbiter: StrategyArbiter;
  let verifier: CommitmentVerifier;
  let owner: any;
  let bot: any;
  let guardian: any;
  const telegramHash = ethers.keccak256(ethers.encodeBytes32String("bot1"));

  beforeEach(async function () {
    [owner, bot, guardian] = await ethers.getSigners();

    const AgentIdentity = await ethers.getContractFactory("AgentIdentity");
    identity = await AgentIdentity.deploy();
    await identity.waitForDeployment();

    const Verifier = await ethers.getContractFactory("CommitmentVerifier");
    verifier = await Verifier.deploy();
    await verifier.waitForDeployment();

    const Arbiter = await ethers.getContractFactory("StrategyArbiter");
    arbiter = await Arbiter.deploy();
    await arbiter.waitForDeployment();

    const Vault = await ethers.getContractFactory("AgentVault");
    vault = await Vault.deploy(
      await identity.getAddress(), "ClawBot v1", "DeepSeek-v4", telegramHash
    );
    await vault.waitForDeployment();
    await vault.setArbiter(await arbiter.getAddress());

    await arbiter.connect(bot).stakeAsBot({ value: ethers.parseEther("0.1") });
    await arbiter.connect(guardian).stakeAsGuardian({ value: ethers.parseEther("2") });
    await arbiter.connect(guardian).setChallengeWindow(5);

    await vault.addStrategy(
      ethers.encodeBytes32String("AGNI_USDC"), "Agni USDC", owner.address, 850
    );
    // Deposit so the vault has funds to allocate
    await vault.connect(owner).deposit({ value: ethers.parseEther("20") });
  });

  describe("CommitmentVerifier", function () {
    it("verifies correct commitment", async function () {
      const salt = ethers.randomBytes(32);
      const agentId = 0;
      const strategyId = ethers.encodeBytes32String("AGNI_USDC");
      const amount = ethers.parseEther("5");
      const apyBps = 850;

      const commitment = await verifier.computeCommitment(agentId, strategyId, amount, apyBps, salt);

      const valid = await verifier.verifyCommitment(commitment, agentId, strategyId, amount, apyBps, salt);
      expect(valid).to.be.true;
    });

    it("rejects commitment with wrong parameters", async function () {
      const salt = ethers.randomBytes(32);
      const strategyId = ethers.encodeBytes32String("AGNI_USDC");

      const commitment = await verifier.computeCommitment(
        0, strategyId, ethers.parseEther("5"), 850, salt
      );

      // Try to verify with wrong amount
      const valid = await verifier.verifyCommitment(
        commitment, 0, strategyId, ethers.parseEther("10"), 850, salt
      );
      expect(valid).to.be.false;
    });

    it("rejects commitment with wrong salt", async function () {
      const salt1 = ethers.randomBytes(32);
      const salt2 = ethers.randomBytes(32);
      const strategyId = ethers.encodeBytes32String("AGNI_USDC");

      const commitment = await verifier.computeCommitment(
        0, strategyId, ethers.parseEther("5"), 850, salt1
      );

      const valid = await verifier.verifyCommitment(
        commitment, 0, strategyId, ethers.parseEther("5"), 850, salt2
      );
      expect(valid).to.be.false;
    });

    it("returns proof system identifier", async function () {
      expect(await verifier.proofSystem()).to.equal("commitment-reveal-v1");
    });

    it("rejects empty proof", async function () {
      await expect(verifier.verifyProof("0x", "0x")).to.be.revertedWith("Empty proof not valid");
    });
  });

  describe("StrategyArbiter Commit-Reveal Flow", function () {
    const AGNI_ID = ethers.encodeBytes32String("AGNI_USDC");
    let salt: Uint8Array;

    beforeEach(async function () {
      salt = ethers.randomBytes(32);
      await arbiter.connect(guardian).setZKPVerifier(await verifier.getAddress());
    });

    async function submitWithCommitment(amount = ethers.parseEther("5"), apy = 850) {
      const commitment = await verifier.computeCommitment(0, AGNI_ID, amount, apy, salt);
      return arbiter.connect(bot).submitStrategyWithCommitment(
        0, await vault.getAddress(), AGNI_ID, amount, apy,
        '[{"action":"deposit"}]',
        commitment, ethers.hexlify(salt)
      );
    }

    it("submits strategy with commitment and emits event", async function () {
      const tx = await submitWithCommitment();
      const receipt = await tx.wait();

      expect(await arbiter.intentCount()).to.equal(1);

      const c = await arbiter.intentCommitments(0);
      expect(c.revealed).to.be.false;
      expect(c.verified).to.be.false;
    });

    it("rejects commitment with mismatched hash", async function () {
      const badCommitment = ethers.keccak256(ethers.toUtf8Bytes("wrong"));
      await expect(
        arbiter.connect(bot).submitStrategyWithCommitment(
          0, await vault.getAddress(), AGNI_ID,
          ethers.parseEther("5"), 850, "[]",
          badCommitment, ethers.hexlify(salt)
        )
      ).to.be.revertedWith("Commitment hash mismatch");
    });

    it("reveals commitment after execution and verifies", async function () {
      await submitWithCommitment();

      // Fast-forward past challenge window
      await ethers.provider.send("evm_increaseTime", [10]);
      await ethers.provider.send("evm_mine", []);

      // Execute strategy
      await vault.executeStrategyWithIntent(
        0, AGNI_ID, ethers.parseEther("5"), 850, "Executed"
      );

      // Reveal commitment
      const tx = await arbiter.connect(bot).revealCommitment(0, ethers.hexlify(salt), "0x");
      const receipt = await tx.wait();

      const c = await arbiter.intentCommitments(0);
      expect(c.revealed).to.be.true;
      expect(c.verified).to.be.true;
    });

    it("rejects reveal with wrong salt", async function () {
      await submitWithCommitment();

      await ethers.provider.send("evm_increaseTime", [10]);
      await ethers.provider.send("evm_mine", []);
      await vault.executeStrategyWithIntent(0, AGNI_ID, ethers.parseEther("5"), 850, "Executed");

      const wrongSalt = ethers.randomBytes(32);
      const tx = await arbiter.connect(bot).revealCommitment(0, ethers.hexlify(wrongSalt), "0x");
      const receipt = await tx.wait();

      const c = await arbiter.intentCommitments(0);
      expect(c.revealed).to.be.true;
      expect(c.verified).to.be.false;
    });

    it("prevents double reveal", async function () {
      await submitWithCommitment();

      await ethers.provider.send("evm_increaseTime", [10]);
      await ethers.provider.send("evm_mine", []);
      await vault.executeStrategyWithIntent(0, AGNI_ID, ethers.parseEther("5"), 850, "Executed");

      await arbiter.connect(bot).revealCommitment(0, ethers.hexlify(salt), "0x");
      await expect(
        arbiter.connect(bot).revealCommitment(0, ethers.hexlify(salt), "0x")
      ).to.be.revertedWith("Already revealed");
    });

    it("rejects reveal before execution", async function () {
      await submitWithCommitment();

      await expect(
        arbiter.connect(bot).revealCommitment(0, ethers.hexlify(salt), "0x")
      ).to.be.revertedWith("Strategy not yet executed");
    });

    it("rejects reveal for non-existent commitment", async function () {
      await expect(
        arbiter.connect(bot).revealCommitment(999, ethers.hexlify(salt), "0x")
      ).to.be.revertedWith("No commitment found");
    });
  });
});
