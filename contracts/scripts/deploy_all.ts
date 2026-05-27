import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Deployer:", deployer.address);
  console.log("Balance:", ethers.formatEther(balance), "MNT\n");

  if (balance < ethers.parseEther("0.5")) {
    console.error("ERROR: Balance below 0.5 MNT. Please get testnet tokens from faucet.");
    process.exit(1);
  }

  // ═══════════════════════════════════════════════════════════════
  // PHASE 1: No-dependency contracts
  // ═══════════════════════════════════════════════════════════════

  // 1. AgentIdentity
  console.log("--- Phase 1: No-dependency contracts ---\n");
  const AgentIdentity = await ethers.getContractFactory("AgentIdentity");
  const identity = await AgentIdentity.deploy();
  await identity.waitForDeployment();
  const identityAddr = await identity.getAddress();
  console.log("[1/9] AgentIdentity:", identityAddr);

  // 2. StrategyArbiter (no deps)
  const StrategyArbiter = await ethers.getContractFactory("StrategyArbiter");
  const arbiter = await StrategyArbiter.deploy();
  await arbiter.waitForDeployment();
  const arbiterAddr = await arbiter.getAddress();
  console.log("[2/9] StrategyArbiter:", arbiterAddr);

  // 3. ChallengeMechanism (no deps)
  const ChallengeMechanism = await ethers.getContractFactory("ChallengeMechanism");
  const challengeMech = await ChallengeMechanism.deploy();
  await challengeMech.waitForDeployment();
  const challengeMechAddr = await challengeMech.getAddress();
  console.log("[3/9] ChallengeMechanism:", challengeMechAddr);

  // 4. CommitmentVerifier (no deps)
  const CommitmentVerifier = await ethers.getContractFactory("CommitmentVerifier");
  const zkpVerifier = await CommitmentVerifier.deploy();
  await zkpVerifier.waitForDeployment();
  const zkpAddr = await zkpVerifier.getAddress();
  console.log("[4/9] CommitmentVerifier:", zkpAddr);

  // 5. GuardianRegistry (no deps)
  const GuardianRegistry = await ethers.getContractFactory("GuardianRegistry");
  const guardianReg = await GuardianRegistry.deploy();
  await guardianReg.waitForDeployment();
  const guardianRegAddr = await guardianReg.getAddress();
  console.log("[5/9] GuardianRegistry:", guardianRegAddr);

  // 6. BotRegistry (no deps)
  const BotRegistry = await ethers.getContractFactory("BotRegistry");
  const botReg = await BotRegistry.deploy();
  await botReg.waitForDeployment();
  const botRegAddr = await botReg.getAddress();
  console.log("[6/9] BotRegistry:", botRegAddr);

  // ═══════════════════════════════════════════════════════════════
  // PHASE 2: Contracts depending on AgentIdentity
  // ═══════════════════════════════════════════════════════════════

  console.log("\n--- Phase 2: Identity-dependent contracts ---\n");

  // 7. ReputationCalculator (needs AgentIdentity)
  const ReputationCalculator = await ethers.getContractFactory("ReputationCalculator");
  const reputation = await ReputationCalculator.deploy(identityAddr);
  await reputation.waitForDeployment();
  const reputationAddr = await reputation.getAddress();
  console.log("[7/9] ReputationCalculator:", reputationAddr);

  // 8. AgentVault (needs AgentIdentity, creates agent 0 internally)
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
  console.log("[8/9] AgentVault:", vaultAddr);

  // 9. EconomicModel (needs treasury = deployer)
  const EconomicModel = await ethers.getContractFactory("EconomicModel");
  const economic = await EconomicModel.deploy(deployer.address);
  await economic.waitForDeployment();
  const economicAddr = await economic.getAddress();
  console.log("[9/9] EconomicModel:", economicAddr);

  // ═══════════════════════════════════════════════════════════════
  // PHASE 3: Post-deployment wiring
  // ═══════════════════════════════════════════════════════════════

  console.log("\n--- Phase 3: Wiring ---\n");

  // Wire 1: AgentVault.setArbiter(StrategyArbiter)
  let tx = await vault.setArbiter(arbiterAddr);
  await tx.wait();
  console.log("[Wire 1] AgentVault.setArbiter(", arbiterAddr, ")");

  // Wire 2: AgentIdentity.setAuthorizedUpdater(ReputationCalculator, true)
  // Deployer owns agent 0 (created by AgentVault constructor)
  tx = await identity.setAuthorizedUpdater(reputationAddr, true);
  await tx.wait();
  console.log("[Wire 2] ReputationCalculator authorized as updater on AgentIdentity");

  // Wire 3: EconomicModel.setGuardianRegistry(GuardianRegistry)
  tx = await economic.setGuardianRegistry(guardianRegAddr);
  await tx.wait();
  console.log("[Wire 3] EconomicModel.setGuardianRegistry(", guardianRegAddr, ")");

  // Wire 4: EconomicModel.setBotRegistry(BotRegistry)
  tx = await economic.setBotRegistry(botRegAddr);
  await tx.wait();
  console.log("[Wire 4] EconomicModel.setBotRegistry(", botRegAddr, ")");

  // Wire 5: ReputationCalculator → GuardianRegistry authorized
  tx = await guardianReg.setAuthorizedCaller(reputationAddr, true);
  await tx.wait();
  console.log("[Wire 5] ReputationCalculator authorized on GuardianRegistry");

  // Wire 6: ReputationCalculator → BotRegistry authorized
  tx = await botReg.setAuthorizedCaller(reputationAddr, true);
  await tx.wait();
  console.log("[Wire 6] ReputationCalculator authorized on BotRegistry");

  // Wire 7: StrategyArbiter → BotRegistry authorized
  tx = await botReg.setAuthorizedCaller(arbiterAddr, true);
  await tx.wait();
  console.log("[Wire 7] StrategyArbiter authorized on BotRegistry");

  // ═══════════════════════════════════════════════════════════════
  // Summary
  // ═══════════════════════════════════════════════════════════════

  const addresses = {
    AGENT_IDENTITY_ADDRESS: identityAddr,
    AGENT_VAULT_ADDRESS: vaultAddr,
    REPUTATION_CALCULATOR_ADDRESS: reputationAddr,
    STRATEGY_ARBITER_ADDRESS: arbiterAddr,
    CHALLENGE_MECHANISM_ADDRESS: challengeMechAddr,
    ZKP_VERIFIER_ADDRESS: zkpAddr,
    GUARDIAN_REGISTRY_ADDRESS: guardianRegAddr,
    BOT_REGISTRY_ADDRESS: botRegAddr,
    ECONOMIC_MODEL_ADDRESS: economicAddr,
  };

  console.log("\n╔══════════════════════════════════════════════╗");
  console.log("║   All 9 contracts deployed to Mantle Sepolia  ║");
  console.log("╚══════════════════════════════════════════════╝\n");

  for (const [name, addr] of Object.entries(addresses)) {
    console.log(`${name}=${addr}`);
  }

  // Write to file
  const fs = require("fs");
  const path = require("path");
  const outputPath = path.join(__dirname, "..", "DEPLOYED_ADDRESSES.md");
  const md = `# ClawBot — Mantle Sepolia 部署地址

> 部署时间: ${new Date().toISOString()}
> 部署者: ${deployer.address}
> 网络: Mantle Sepolia Testnet (Chain ID 5003)

| # | 合约 | 地址 |
|---|------|------|
| 1 | AgentIdentity | \`${identityAddr}\` |
| 2 | StrategyArbiter | \`${arbiterAddr}\` |
| 3 | ChallengeMechanism | \`${challengeMechAddr}\` |
| 4 | CommitmentVerifier | \`${zkpAddr}\` |
| 5 | GuardianRegistry | \`${guardianRegAddr}\` |
| 6 | BotRegistry | \`${botRegAddr}\` |
| 7 | ReputationCalculator | \`${reputationAddr}\` |
| 8 | AgentVault | \`${vaultAddr}\` |
| 9 | EconomicModel | \`${economicAddr}\` |

## .env 更新

\`\`\`
AGENT_IDENTITY_ADDRESS=${identityAddr}
AGENT_VAULT_ADDRESS=${vaultAddr}
REPUTATION_CALCULATOR_ADDRESS=${reputationAddr}
STRATEGY_ARBITER_ADDRESS=${arbiterAddr}
CHALLENGE_MECHANISM_ADDRESS=${challengeMechAddr}
ZKP_VERIFIER_ADDRESS=${zkpAddr}
GUARDIAN_REGISTRY_ADDRESS=${guardianRegAddr}
BOT_REGISTRY_ADDRESS=${botRegAddr}
ECONOMIC_MODEL_ADDRESS=${economicAddr}
\`\`\`
`;
  fs.writeFileSync(outputPath, md);
  console.log("\n[DONE] Addresses written to DEPLOYED_ADDRESSES.md");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
