import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Using:", deployer.address);

  const IDENTITY_ADDR = "0xeb0A26aA083B7D4548e266189FE0F84d360dB0A1";
  const REPUTATION_ADDR = "0xD591B100F2eAc43819C5c71f367fA17d1fC90801";

  const identity = await ethers.getContractAt("AgentIdentity", IDENTITY_ADDR);

  // Check if deployer already has agents
  const agents = await identity.getOwnerAgents(deployer.address);
  console.log("Deployer agents:", agents.length);

  if (agents.length === 0) {
    console.log("Creating deployer-owned agent...");
    const tx = await identity.createAgent("DeployerAdmin", "manual", ethers.encodeBytes32String("deployer"));
    await tx.wait();
    console.log("Deployer agent created");
  }

  console.log("Authorizing ReputationCalculator...");
  const authTx = await identity.setAuthorizedUpdater(REPUTATION_ADDR, true);
  await authTx.wait();
  console.log("ReputationCalculator authorized as updater");

  // Verify
  const isAuth = await identity.authorizedReputationUpdaters(REPUTATION_ADDR);
  console.log("Authorized:", isAuth);
}

main().catch((e) => { console.error(e); process.exit(1); });
