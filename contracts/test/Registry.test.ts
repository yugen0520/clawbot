import { expect } from "chai";
import { ethers } from "hardhat";
import { GuardianRegistry, BotRegistry, EconomicModel } from "../typechain-types";

describe("GuardianRegistry", function () {
  let registry: GuardianRegistry;
  let g1: any, g2: any, g3: any, other: any;
  const MIN_STAKE = ethers.parseEther("1");

  beforeEach(async function () {
    [g1, g2, g3, other] = await ethers.getSigners();
    const GR = await ethers.getContractFactory("GuardianRegistry");
    registry = await GR.deploy();
    await registry.waitForDeployment();
  });

  it("registers a guardian with sufficient stake", async function () {
    await registry.connect(g1).register({ value: MIN_STAKE });
    expect(await registry.isGuardian(g1.address)).to.be.true;
    expect(await registry.guardianCount()).to.equal(1);
  });

  it("rejects registration with insufficient stake", async function () {
    await expect(
      registry.connect(g1).register({ value: ethers.parseEther("0.5") })
    ).to.be.revertedWith("Insufficient stake");
  });

  it("prevents duplicate registration", async function () {
    await registry.connect(g1).register({ value: MIN_STAKE });
    await expect(
      registry.connect(g1).register({ value: MIN_STAKE })
    ).to.be.revertedWith("Already registered");
  });

  it("allows increasing stake", async function () {
    await registry.connect(g1).register({ value: MIN_STAKE });
    await registry.connect(g1).addStake({ value: ethers.parseEther("0.5") });
    const g = await registry.getGuardian(g1.address);
    expect(g.stake).to.equal(ethers.parseEther("1.5"));
  });

  it("allows partial stake withdrawal above minimum", async function () {
    await registry.connect(g1).register({ value: ethers.parseEther("2") });
    const balBefore = await ethers.provider.getBalance(g1.address);
    await registry.connect(g1).withdrawStake(ethers.parseEther("0.5"));
    const g = await registry.getGuardian(g1.address);
    expect(g.stake).to.equal(ethers.parseEther("1.5"));
  });

  it("rejects withdrawal that would fall below minimum", async function () {
    await registry.connect(g1).register({ value: ethers.parseEther("1.5") });
    await expect(
      registry.connect(g1).withdrawStake(ethers.parseEther("1.0"))
    ).to.be.revertedWith("Would fall below minimum stake");
  });

  it("allows deregistration and full stake withdrawal", async function () {
    await registry.connect(g1).register({ value: MIN_STAKE });
    await registry.connect(g1).deregister();
    expect(await registry.isGuardian(g1.address)).to.be.false;
    expect(await registry.guardianCount()).to.equal(0);
  });

  it("slashes guardian correctly", async function () {
    await registry.connect(g1).register({ value: ethers.parseEther("2") });
    await registry.slash(g1.address, ethers.parseEther("0.5"), "Bad vote");
    const g = await registry.getGuardian(g1.address);
    expect(g.stake).to.equal(ethers.parseEther("1.5"));
    expect(g.slashCount).to.equal(1);
  });

  it("tracks total staked across guardians", async function () {
    await registry.connect(g1).register({ value: ethers.parseEther("2") });
    await registry.connect(g2).register({ value: ethers.parseEther("3") });
    expect(await registry.totalStaked()).to.equal(ethers.parseEther("5"));
  });

  it("records participation and votes", async function () {
    await registry.connect(g1).register({ value: MIN_STAKE });
    await registry.recordParticipation(g1.address, 42);
    await registry.recordVote(g1.address, 42);
    const g = await registry.getGuardian(g1.address);
    expect(g.challengesParticipated).to.equal(1);
    expect(g.votesCast).to.equal(1);
  });

  it("prevents non-authorized caller from slashing", async function () {
    await registry.connect(g1).register({ value: MIN_STAKE });
    await expect(
      registry.connect(g2).slash(g1.address, ethers.parseEther("0.5"), "Bad")
    ).to.be.revertedWith("Not authorized");
  });

  it("prevents non-authorized caller from adding rewards", async function () {
    await expect(
      registry.connect(g2).addRewards(g1.address, ethers.parseEther("1"))
    ).to.be.revertedWith("Not authorized");
  });

  it("prevents non-authorized caller from setting minStake", async function () {
    await expect(
      registry.connect(g2).setMinStake(0)
    ).to.be.revertedWith("Not authorized");
  });

  it("authorized caller can slash, add rewards, and set minStake", async function () {
    await registry.connect(g1).register({ value: ethers.parseEther("2") });
    await registry.setAuthorizedCaller(g2.address, true);

    await registry.connect(g2).slash(g1.address, ethers.parseEther("0.5"), "Bad vote");
    const g = await registry.getGuardian(g1.address);
    expect(g.stake).to.equal(ethers.parseEther("1.5"));

    await registry.connect(g2).addRewards(g1.address, ethers.parseEther("1"));
    expect(await registry.pendingRewards(g1.address)).to.equal(ethers.parseEther("1"));

    await registry.connect(g2).setMinStake(ethers.parseEther("2"));
    expect(await registry.minStake()).to.equal(ethers.parseEther("2"));
  });
});

describe("BotRegistry", function () {
  let registry: BotRegistry;
  let bot1: any, bot2: any, other: any;
  const MIN_STAKE = ethers.parseEther("0.01");

  beforeEach(async function () {
    [bot1, bot2, other] = await ethers.getSigners();
    const BR = await ethers.getContractFactory("BotRegistry");
    registry = await BR.deploy();
    await registry.waitForDeployment();
  });

  it("registers a bot with sufficient stake", async function () {
    await registry.connect(bot1).register(0, { value: MIN_STAKE });
    expect(await registry.isBot(bot1.address)).to.be.true;
    expect(await registry.botCount()).to.equal(1);
  });

  it("rejects registration with insufficient stake", async function () {
    await expect(
      registry.connect(bot1).register(0, { value: ethers.parseEther("0.001") })
    ).to.be.revertedWith("Insufficient stake");
  });

  it("tracks strategy publishing and execution", async function () {
    await registry.connect(bot1).register(0, { value: MIN_STAKE });
    await registry.connect(bot1).recordStrategyPublished(bot1.address, 1);
    await registry.recordStrategyExecuted(bot1.address, 1, ethers.parseEther("100"));
    const b = await registry.getBot(bot1.address);
    expect(b.strategiesPublished).to.equal(1);
    expect(b.strategiesExecuted).to.equal(1);
    expect(b.totalVolumeExecuted).to.equal(ethers.parseEther("100"));
  });

  it("tracks challenge outcomes", async function () {
    await registry.connect(bot1).register(0, { value: MIN_STAKE });
    await registry.recordChallengeSurvived(bot1.address);
    const b = await registry.getBot(bot1.address);
    expect(b.challengesSurvived).to.equal(1);
    expect(b.challengesLost).to.equal(0);
  });

  it("slashes bot and increments lost count", async function () {
    await registry.connect(bot1).register(0, { value: ethers.parseEther("0.05") });
    await registry.slash(bot1.address, ethers.parseEther("0.01"), "Fraud");
    const b = await registry.getBot(bot1.address);
    expect(b.slashCount).to.equal(1);
    expect(b.challengesLost).to.equal(1);
    expect(b.stake).to.equal(ethers.parseEther("0.04"));
  });

  it("returns top bots by volume", async function () {
    await registry.connect(bot1).register(0, { value: MIN_STAKE });
    await registry.connect(bot2).register(1, { value: MIN_STAKE });
    await registry.recordStrategyExecuted(bot1.address, 1, ethers.parseEther("50"));
    await registry.recordStrategyExecuted(bot2.address, 2, ethers.parseEther("200"));

    const [addrs, volumes] = await registry.getTopBots(2);
    expect(addrs[0]).to.equal(bot2.address);
    expect(volumes[0]).to.equal(ethers.parseEther("200"));
    expect(addrs[1]).to.equal(bot1.address);
  });

  it("prevents non-authorized caller from slashing bot", async function () {
    await registry.connect(bot1).register(0, { value: MIN_STAKE });
    await expect(
      registry.connect(bot2).slash(bot1.address, ethers.parseEther("0.01"), "Bad")
    ).to.be.revertedWith("Not authorized");
  });

  it("prevents non-authorized caller from recording strategy executed", async function () {
    await registry.connect(bot1).register(0, { value: MIN_STAKE });
    await expect(
      registry.connect(bot2).recordStrategyExecuted(bot1.address, 1, ethers.parseEther("100"))
    ).to.be.revertedWith("Not authorized");
  });

  it("deregisters bot and allows re-registration without duplicate list entries", async function () {
    await registry.connect(bot1).register(0, { value: MIN_STAKE });
    await registry.connect(bot1).deregister();
    expect(await registry.isBot(bot1.address)).to.be.false;

    // Re-register should work and not push a duplicate
    await registry.connect(bot1).register(0, { value: MIN_STAKE });
    expect(await registry.isBot(bot1.address)).to.be.true;
    expect(await registry.botCount()).to.equal(1);
  });
});

describe("EconomicModel Registry Integration", function () {
  let economic: EconomicModel;
  let guardianReg: GuardianRegistry;
  let botReg: BotRegistry;
  let treasury: any, g1: any, bot1: any;

  beforeEach(async function () {
    [treasury, g1, bot1] = await ethers.getSigners();

    const GR = await ethers.getContractFactory("GuardianRegistry");
    guardianReg = await GR.deploy();
    await guardianReg.waitForDeployment();

    const BR = await ethers.getContractFactory("BotRegistry");
    botReg = await BR.deploy();
    await botReg.waitForDeployment();

    const EM = await ethers.getContractFactory("EconomicModel");
    economic = await EM.deploy(treasury.address);
    await economic.waitForDeployment();

    // Authorize EconomicModel to call registry functions
    await guardianReg.connect(treasury).setAuthorizedCaller(await economic.getAddress(), true);
    await botReg.connect(treasury).setAuthorizedCaller(await economic.getAddress(), true);
  });

  it("sets guardian registry via governance", async function () {
    await economic.connect(treasury).setGuardianRegistry(await guardianReg.getAddress());
    expect(await economic.guardianRegistry()).to.equal(await guardianReg.getAddress());
  });

  it("sets bot registry via governance", async function () {
    await economic.connect(treasury).setBotRegistry(await botReg.getAddress());
    expect(await economic.botRegistry()).to.equal(await botReg.getAddress());
  });

  it("rejects non-governance setting registry", async function () {
    await expect(
      economic.connect(g1).setGuardianRegistry(await guardianReg.getAddress())
    ).to.be.revertedWith("Not governance");
  });

  it("distributes rewards to registered guardians via registry", async function () {
    await economic.connect(treasury).setGuardianRegistry(await guardianReg.getAddress());
    await guardianReg.connect(g1).register({ value: ethers.parseEther("1") });

    // Charge fee to build up guardian pool
    await economic.connect(g1).chargeQueryFee(g1.address, { value: ethers.parseEther("0.001") });

    const [, poolBefore] = await economic.getPendingPools();
    expect(poolBefore).to.be.gt(0);

    await economic.distributeGuardianRewards();

    // Guardian rewards pool should be cleared
    const [, guardianPool] = await economic.getPendingPools();
    expect(guardianPool).to.equal(0);

    // g1 should have pending rewards in the registry
    const g1Rewards = await guardianReg.pendingRewards(g1.address);
    expect(g1Rewards).to.be.gt(0);
  });
});
