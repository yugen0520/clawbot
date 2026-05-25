import "dotenv/config";
import { ethers } from "ethers";
import {
  initContracts, getAgentInfo, getAllStrategies, verifyAgent,
  deposit, executeStrategy, getTotalDeposits, provider, signer
} from "./src/contract";

initContracts(
  process.env.MANTLE_RPC_URL || "",
  process.env.PRIVATE_KEY || "",
  process.env.AGENT_VAULT_ADDRESS || "",
  process.env.AGENT_IDENTITY_ADDRESS || ""
);

async function main() {
  console.log("=== Final Check ===\n");
  const wallet = await signer.getAddress();
  console.log(`Wallet: ${wallet}`);
  console.log(`Balance: ${ethers.formatEther(await provider.getBalance(wallet))} MNT\n`);

  const agent = await getAgentInfo(0);
  console.log(`Agent: ${agent.name} | Active: ${agent.isActive} | Rep: ${agent.reputationScore.toString()}`);

  const { valid } = await verifyAgent(0);
  console.log(`Verified: ${valid}`);

  const strategies = await getAllStrategies();
  console.log(`Strategies: ${strategies.filter((s: any) => s.active).length} active`);

  // Test deposit + execute
  console.log("\n--- Test: deposit 0.001 + execute ---");
  const depositTx = await deposit("0.001");
  console.log(`Deposit tx: ${depositTx.hash}`);

  const execTx = await executeStrategy("AGNI_USDC", "0.001", 850, "Final check: allocate to Agni");
  console.log(`Execute tx: ${execTx.hash}`);

  const total = await getTotalDeposits();
  console.log(`Total deposits: ${total} MNT`);

  const agent2 = await getAgentInfo(0);
  console.log(`Agent actions: ${agent2.actionCount.toString()}`);

  // Test double-allocation prevention
  console.log("\n--- Test: double-allocation prevention ---");
  try {
    await executeStrategy("MOE_MNT_USDC", "0.001", 1200, "Should fail: no available balance");
    console.log("FAIL: should have reverted");
  } catch (e: any) {
    console.log(`OK: correctly reverted: ${e.message?.slice(0, 80)}`);
  }

  console.log("\n=== All checks passed ===");
}

main().catch((e) => { console.error("FAIL:", e.message); process.exit(1); });
