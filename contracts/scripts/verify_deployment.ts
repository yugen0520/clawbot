import { ethers } from "hardhat";

async function main() {
  const [signer] = await ethers.getSigners();
  console.log("Signer:", signer.address, "\n");

  // Load contract addresses from deployment
  const addrs = {
    identity: "0x68E64D3f8c91984FD260ef7C6e405d52460a3bB9",
    vault: "0xc6178059f510930550e76D7A76E7BF9BFd5daB3d",
    reputation: "0x8B6A3D352ceCF054A40E7E763B78d96A0023cEA3",
    arbiter: "0x0Cec6cBC116CB2f5d6955187605d25684FEFF089",
    guardianReg: "0xBC719a685c92c384d60bEaA3283EFD36933FaE8D",
    botReg: "0xb73F770064f5939637AE3Ba9019F7f2728836897",
    economic: "0xff05175d3E4cB49CD5B7a3b345C5D418b5fBB134",
    challenge: "0x58EF9F759f7Dbc601eBBfFFA02a15042d3Deb4ab",
  };

  const identity = await ethers.getContractAt("AgentIdentity", addrs.identity);
  const vault = await ethers.getContractAt("AgentVault", addrs.vault);
  const arbiter = await ethers.getContractAt("StrategyArbiter", addrs.arbiter);
  const reputation = await ethers.getContractAt("ReputationCalculator", addrs.reputation);
  const guardianReg = await ethers.getContractAt("GuardianRegistry", addrs.guardianReg);
  const botReg = await ethers.getContractAt("BotRegistry", addrs.botReg);

  // ── Test 1: Check Agent 0 (created by AgentVault constructor) ──
  console.log("--- Test 1: Agent 0 Info ---");
  const agent = await identity.getAgent(0);
  console.log("  Name:", agent.name);
  console.log("  Model:", agent.modelProvider);
  console.log("  Active:", agent.isActive);
  console.log("  Reputation:", agent.reputationScore.toString());
  console.log("  Owner:", agent.owner);

  // ── Test 2: Register a second Agent ──
  console.log("\n--- Test 2: Register Agent 1 ---");
  const tx1 = await identity.createAgent("TestBot v2", "DeepSeek-v4", ethers.encodeBytes32String("test_agent_2"));
  await tx1.wait();
  const agent1 = await identity.getAgent(1);
  console.log("  Agent 1 created, name:", agent1.name);
  console.log("  TX:", tx1.hash);

  // ── Test 3: Deposit to Vault ──
  console.log("\n--- Test 3: Deposit 0.01 MNT to Vault ---");
  const tx2 = await vault.deposit({ value: ethers.parseEther("0.01") });
  await tx2.wait();
  const pos = await vault.positions(signer.address);
  console.log("  Deposited:", ethers.formatEther(pos.deposited), "MNT");
  console.log("  Shares:", pos.shares.toString());
  console.log("  TX:", tx2.hash);

  // ── Test 4: Add a strategy ──
  console.log("\n--- Test 4: Add Strategy ---");
  const tx3 = await vault.addStrategy(
    ethers.encodeBytes32String("AGNI_USDC"),
    "Agni Finance USDC Pool",
    "0x0000000000000000000000000000000000000001",
    850
  );
  await tx3.wait();
  console.log("  Strategy AGNI_USDC added");
  console.log("  TX:", tx3.hash);

  // ── Test 5: Stake as bot + publish intent ──
  console.log("\n--- Test 5: Stake as Bot & Publish Intent ---");
  const tx4 = await arbiter.stakeAsBot({ value: ethers.parseEther("0.1") });
  await tx4.wait();
  console.log("  Bot staked 0.1 MNT, TX:", tx4.hash);

  const tx5 = await arbiter.publishIntent(
    0, addrs.vault,
    ethers.encodeBytes32String("AGNI_USDC"),
    ethers.parseEther("0.005"),
    850,
    JSON.stringify([{ action: "deposit", protocol: "Agni", amount: "0.005 MNT", expectedAPY: "8.5%" }])
  );
  await tx5.wait();
  const intent = await arbiter.intents(0);
  console.log("  Intent published, agentId:", intent.agentId.toString());
  console.log("  TX:", tx5.hash);

  // ── Test 6: Register Guardian ──
  console.log("\n--- Test 6: Register Guardian ---");
  const tx6 = await guardianReg.register({ value: ethers.parseEther("1") });
  await tx6.wait();
  const guardian = await guardianReg.getGuardian(signer.address);
  console.log("  Guardian registered, stake:", ethers.formatEther(guardian.stake), "MNT");
  console.log("  TX:", tx6.hash);

  // ── Test 7: Register Bot in BotRegistry ──
  console.log("\n--- Test 7: Register Bot ---");
  const tx7 = await botReg.register(0, { value: ethers.parseEther("0.01") });
  await tx7.wait();
  const bot = await botReg.getBot(signer.address);
  console.log("  Bot registered, stake:", ethers.formatEther(bot.stake), "MNT");
  console.log("  TX:", tx7.hash);

  // ── Test 8: Endorse Agent 1 from Agent 0's vault ──
  console.log("\n--- Test 8: Endorse Agent 1 ---");
  const tx8 = await vault.endorseOtherAgent(1, 5, "Excellent performance");
  await tx8.wait();
  const endStats = await identity.getEndorsementStats(1);
  console.log("  Endorsement count:", endStats.count.toString());
  console.log("  Aggregate score:", endStats.aggregateScore.toString());
  console.log("  TX:", tx8.hash);

  // ── Test 9: Execute strategy after challenge window ──
  console.log("\n--- Test 9: Execute Strategy (after fast-forward) ---");
  await ethers.provider.send("evm_increaseTime", [200]);
  await ethers.provider.send("evm_mine", []);
  const tx9 = await vault.executeStrategyWithIntent(
    0,
    ethers.encodeBytes32String("AGNI_USDC"),
    ethers.parseEther("0.005"),
    850,
    "AI agent executed Agni USDC deposit"
  );
  await tx9.wait();
  const intentAfter = await arbiter.intents(0);
  console.log("  Executed:", intentAfter.executed);
  console.log("  TX:", tx9.hash);

  console.log("\n╔════════════════════════════════╗");
  console.log("║  All 9 operations successful   ║");
  console.log("╚════════════════════════════════╝");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
