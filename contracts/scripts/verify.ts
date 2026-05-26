import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Checking from:", deployer.address);

  const IDENTITY = "0xeb0A26aA083B7D4548e266189FE0F84d360dB0A1";
  const VAULT = "0xC0f12519B1cd8F483Ef4B9C637092852Ce64D00f";
  const REPUTATION = "0xD591B100F2eAc43819C5c71f367fA17d1fC90801";
  const ARBITER = "0x74DD23a520867a87725bCc3cae800eFb68455EBe";
  const ECONOMIC = "0x225EBe5ee16749436d85f3DCa120ffCA7946f5a0";

  const vault = await ethers.getContractAt("AgentVault", VAULT);
  const identity = await ethers.getContractAt("AgentIdentity", IDENTITY);

  // Check arbiter linkage
  const arbiterAddr = await vault.arbiter();
  console.log("Vault arbiter:", arbiterAddr);
  console.log("Expected:", ARBITER);
  console.log("Match:", arbiterAddr.toLowerCase() === ARBITER.toLowerCase());

  // Check agent
  const agent = await identity.getAgent(0);
  console.log("\nAgent 0:", agent.name, "| Active:", agent.isActive, "| Rep:", agent.reputationScore.toString());

  // Check authorized updater
  const isAuth = await identity.authorizedReputationUpdaters(REPUTATION);
  console.log("ReputationCalculator authorized:", isAuth);

  // Summary
  console.log("\n--- .env entries ---");
  console.log("AGENT_IDENTITY_ADDRESS=" + IDENTITY);
  console.log("AGENT_VAULT_ADDRESS=" + VAULT);
  console.log("REPUTATION_CALCULATOR_ADDRESS=" + REPUTATION);
  console.log("STRATEGY_ARBITER_ADDRESS=" + ARBITER);
  console.log("ECONOMIC_MODEL_ADDRESS=" + ECONOMIC);
}

main().catch((e) => { console.error(e); process.exit(1); });
