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

  // 3. Deploy ReputationCalculator
  const ReputationCalculator = await ethers.getContractFactory("ReputationCalculator");
  const reputation = await ReputationCalculator.deploy(identityAddr);
  await reputation.waitForDeployment();
  const reputationAddr = await reputation.getAddress();
  console.log("ReputationCalculator deployed to:", reputationAddr);

  // 4. Deploy StrategyArbiter
  const StrategyArbiter = await ethers.getContractFactory("StrategyArbiter");
  const arbiter = await StrategyArbiter.deploy();
  await arbiter.waitForDeployment();
  const arbiterAddr = await arbiter.getAddress();
  console.log("StrategyArbiter deployed to:", arbiterAddr);

  // 5. Deploy EconomicModel
  const EconomicModel = await ethers.getContractFactory("EconomicModel");
  const economic = await EconomicModel.deploy(deployer.address);
  await economic.waitForDeployment();
  const economicAddr = await economic.getAddress();
  console.log("EconomicModel deployed to:", economicAddr);

  // 6. Wire up: set StrategyArbiter on AgentVault
  const setArbiterTx = await vault.setArbiter(arbiterAddr);
  await setArbiterTx.wait();
  console.log("StrategyArbiter linked to AgentVault");

  // 7. Wire up: authorize ReputationCalculator as updater on AgentIdentity
  // setAuthorizedUpdater requires caller to be an agent owner — create a deployer-owned agent first
  await identity.createAgent("DeployerAdmin", "manual", ethers.encodeBytes32String("deployer"));
  const authTx = await identity.setAuthorizedUpdater(reputationAddr, true);
  await authTx.wait();
  console.log("ReputationCalculator authorized as updater on AgentIdentity");

  // 8. Add initial strategies
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
  console.log("ReputationCalculator:", reputationAddr);
  console.log("StrategyArbiter:", arbiterAddr);
  console.log("EconomicModel:", economicAddr);
  console.log("Agent ID:", 0);

  // Verify agent was created properly
  const agent = await identity.getAgent(0);
  console.log("\nAgent 0 info:");
  console.log("  Name:", agent.name);
  console.log("  Model:", agent.modelProvider);
  console.log("  Active:", agent.isActive);
  console.log("  Reputation:", agent.reputationScore.toString());

  // Summary for .env
  console.log("\n--- .env entries ---");
  console.log("AGENT_IDENTITY_ADDRESS=" + identityAddr);
  console.log("AGENT_VAULT_ADDRESS=" + vaultAddr);
  console.log("REPUTATION_CALCULATOR_ADDRESS=" + reputationAddr);
  console.log("STRATEGY_ARBITER_ADDRESS=" + arbiterAddr);
  console.log("ECONOMIC_MODEL_ADDRESS=" + economicAddr);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
