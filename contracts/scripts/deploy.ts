import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying with:", deployer.address);

  // 1. Deploy AgentIdentity
  const AgentIdentity = await ethers.getContractFactory("AgentIdentity");
  const identity = await AgentIdentity.deploy();
  await identity.waitForDeployment();
  const identityAddr = await identity.getAddress();
  console.log("AgentIdentity deployed to:", identityAddr);

  // 2. Deploy AgentVault with telegram ID hash
  const telegramId = ethers.encodeBytes32String("8764147977");
  const telegramIdHash = ethers.keccak256(telegramId);

  const AgentVault = await ethers.getContractFactory("AgentVault");
  const vault = await AgentVault.deploy(
    identityAddr,
    "ClawBot v1",
    "DeepSeek-v4",
    telegramIdHash
  );
  await vault.waitForDeployment();
  const vaultAddr = await vault.getAddress();
  console.log("AgentVault deployed to:", vaultAddr);

  // 3. Add initial strategies
  const strategies = [
    { id: ethers.encodeBytes32String("AGNI_USDC"), name: "Agni Finance USDC Pool", protocol: "0x0000000000000000000000000000000000000001", apy: 850 },
    { id: ethers.encodeBytes32String("MOE_MNT_USDC"), name: "Merchant Moe MNT-USDC LP", protocol: "0x0000000000000000000000000000000000000002", apy: 1200 },
    { id: ethers.encodeBytes32String("LEND_MNT"), name: "Lendle MNT Lending", protocol: "0x0000000000000000000000000000000000000003", apy: 620 },
  ];

  for (const s of strategies) {
    const tx = await vault.addStrategy(s.id, s.name, s.protocol, s.apy);
    await tx.wait();
    console.log(`Strategy added: ${s.name}`);
  }

  console.log("\n--- Deployment Complete ---");
  console.log("AgentIdentity:", identityAddr);
  console.log("AgentVault:", vaultAddr);
  console.log("Agent ID:", 0);

  // Verify agent was created properly
  const agent = await identity.getAgent(0);
  console.log("\nAgent 0 info:");
  console.log("  Name:", agent.name);
  console.log("  Model:", agent.modelProvider);
  console.log("  Active:", agent.isActive);
  console.log("  Reputation:", agent.reputationScore.toString());
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
