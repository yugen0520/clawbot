import { expect } from "chai";
import { ethers } from "hardhat";
import { EconomicModel } from "../typechain-types";

describe("EconomicModel", function () {
  let model: EconomicModel;
  let treasury: any;
  let agent: any;
  let user: any;

  beforeEach(async function () {
    [treasury, agent, user] = await ethers.getSigners();

    const EconomicModel = await ethers.getContractFactory("EconomicModel");
    model = await EconomicModel.deploy(treasury.address);
    await model.waitForDeployment();
  });

  describe("Fee Collection", function () {
    it("should charge registration fee and allocate to pools", async function () {
      const fee = await model.registrationFee();
      await model.connect(agent).chargeRegistrationFee(agent.address, 1, { value: fee });

      expect(await model.totalFeesCollected()).to.equal(fee);
      const [treasuryPool, guardianPool, agentPool] = await model.getPendingPools();
      expect(treasuryPool + guardianPool + agentPool).to.be.gt(0);
    });

    it("should charge query fee and allocate to pools", async function () {
      const fee = await model.queryFee();
      await model.connect(user).chargeQueryFee(user.address, { value: fee });

      expect(await model.totalFeesCollected()).to.equal(fee);
    });

    it("should charge matching fee proportional to amount", async function () {
      const matchingBps = await model.matchingFeeBasisPoints();
      const amount = ethers.parseEther("100");
      const expectedFee = amount * matchingBps / 10000n;

      await model.connect(agent).chargeMatchingFee(agent.address, 0, 1, amount, {
        value: expectedFee
      });

      expect(await model.totalFeesCollected()).to.equal(expectedFee);
    });

    it("should reject insufficient fee payments", async function () {
      const fee = await model.registrationFee();
      await expect(
        model.connect(agent).chargeRegistrationFee(agent.address, 1, {
          value: fee - 1n
        })
      ).to.be.revertedWith("Insufficient registration fee");
    });

    it("should accept direct ETH transfers via receive", async function () {
      await agent.sendTransaction({
        to: await model.getAddress(),
        value: ethers.parseEther("0.01")
      });
      expect(await model.totalFeesCollected()).to.equal(ethers.parseEther("0.01"));
    });
  });

  describe("Fee Distribution", function () {
    it("should distribute treasury share to treasury address", async function () {
      const fee = await model.registrationFee();
      await model.connect(agent).chargeRegistrationFee(agent.address, 1, { value: fee });

      const treasuryBefore = await ethers.provider.getBalance(treasury.address);
      await model.distributeFees();
      const treasuryAfter = await ethers.provider.getBalance(treasury.address);

      expect(treasuryAfter).to.be.gt(treasuryBefore);
    });

    it("should update distribution ratios when called by governance", async function () {
      // treasury is governance
      await model.connect(treasury).setDistributionRatios(6000, 3000, 1000); // 60/30/10

      const params = await model.getFeeParams();
      // getFeeParams returns: (registrationFee, queryFee, matchingFee, treasuryShare, guardianShare, agentShare)
      expect(params[3]).to.equal(6000);
      expect(params[4]).to.equal(3000);
      expect(params[5]).to.equal(1000);
    });

    it("should reject invalid distribution ratios", async function () {
      await expect(
        model.connect(treasury).setDistributionRatios(5000, 3000, 3000) // sums to 11000 > 10000
      ).to.be.revertedWith("Must sum to 10000");
    });

    it("should allow guardian to claim rewards", async function () {
      const fee = await model.registrationFee();
      await model.connect(agent).chargeRegistrationFee(agent.address, 1, { value: fee });

      const guardianBalanceBefore = await ethers.provider.getBalance(agent.address);
      await model.connect(agent).claimGuardianRewards(agent.address, 1); // 1 total guardian
      const guardianBalanceAfter = await ethers.provider.getBalance(agent.address);

      expect(guardianBalanceAfter).to.be.gt(guardianBalanceBefore);
    });

    it("should allow governance to allocate agent incentives to top agents", async function () {
      const fee = ethers.parseEther("0.01");
      await model.connect(agent).chargeRegistrationFee(agent.address, 1, { value: fee });

      // Distribute to build up agent pool
      await model.distributeFees();

      // Send more to build up agent pool
      await model.connect(agent).chargeRegistrationFee(agent.address, 1, { value: fee });

      const agentPoolBefore = (await model.getPendingPools()).agentPool;

      await model.connect(treasury).allocateAgentIncentives([0, 1]);

      // Agent can claim
      const balBefore = await ethers.provider.getBalance(agent.address);
      await model.connect(agent).claimAgentIncentives(0);
      const balAfter = await ethers.provider.getBalance(agent.address);
      expect(balAfter).to.be.gt(balBefore);
    });
  });

  describe("Fee Parameter Updates", function () {
    it("should update fee parameters via governance", async function () {
      const newReg = ethers.parseEther("0.005");
      const newQuery = ethers.parseEther("0.0005");
      await model.connect(treasury).setFeeParams(newReg, newQuery, 20);

      const params = await model.getFeeParams();
      expect(params[0]).to.equal(newReg);
      expect(params[1]).to.equal(newQuery);
      expect(params[2]).to.equal(20);
    });

    it("should update treasury address", async function () {
      await model.connect(treasury).setTreasury(agent.address);
      expect(await model.treasury()).to.equal(agent.address);
    });

    it("should reject setting treasury to zero address", async function () {
      await expect(
        model.connect(treasury).setTreasury(ethers.ZeroAddress)
      ).to.be.revertedWith("Zero address");
    });
  });
});
