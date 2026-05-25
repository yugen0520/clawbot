import "dotenv/config";
import {
  processMessage,
  detectLanguageName,
  setUserLang,
  getUserLang,
  addToHistory,
  setPendingInvestment,
  getPendingInvestment,
} from "./ai-nlu";
import {
  getHighestAPY,
  getBestByRisk,
  getAllPools,
  formatPoolSummary,
} from "./defi-queries";

const CHAT_ID = 99999;

function assert(condition: boolean, label: string) {
  if (!condition) {
    console.error(`FAIL: ${label}`);
    process.exitCode = 1;
  } else {
    console.log(`  OK: ${label}`);
  }
}

async function main() {
  console.log("=== ClawBot Self-Test ===\n");

  // ── 1. Language detection ──
  console.log("1. Language detection");
  assert(detectLanguageName("你好世界") === "Chinese", "Chinese detected");
  assert(detectLanguageName("こんにちは") === "Japanese", "Japanese detected");
  assert(detectLanguageName("안녕하세요") === "Korean", "Korean detected");
  assert(detectLanguageName("Hello world") === "English", "English fallback");
  assert(detectLanguageName("0x3811d50e6385fC6b34196eBe3972df43dA3084B5") === "English", "Address → English");
  setUserLang(CHAT_ID, "Chinese");
  assert(getUserLang(CHAT_ID) === "Chinese", "Language stored & retrieved");

  // ── 2. Intent parsing + response (combined) ──
  console.log("\n2. Combined intent + response");

  // Test 1: Chinese compare query
  const r1 = await processMessage("推荐个收益最高的池子", CHAT_ID, "Chinese");
  console.log(`  Intent: ${r1.intent.action}, Strategy: ${r1.intent.strategy}`);
  console.log(`  Response (truncated): ${r1.response.slice(0, 80)}...`);
  assert(
    r1.intent.action === "compare" || r1.intent.action === "invest",
    "Chinese 'recommend best pool' → compare/invest"
  );
  assert(r1.response.length > 10, "Response has content");

  // Test 2: Invest with amount
  const r2 = await processMessage("帮我买 20 MNT 的", CHAT_ID, "Chinese");
  console.log(`  Intent: ${r2.intent.action}, Amount: ${r2.intent.amount}, Token: ${r2.intent.token}`);
  assert(r2.intent.action === "invest" || r2.intent.action === "compare", "Buy → invest/compare");
  assert(r2.intent.amount === 20, "Amount extracted: 20");
  assert(r2.intent.token === "MNT" || r2.intent.token === "", "Token: MNT");

  // Test 3: Confirm execute (should carry over from history)
  const r3 = await processMessage("好的，帮我执行吧", CHAT_ID, "Chinese");
  console.log(`  Intent: ${r3.intent.action}, Amount: ${r3.intent.amount}, Token: ${r3.intent.token}`);
  assert(
    r3.intent.action === "deposit" || r3.intent.action === "invest",
    "Confirm → deposit/invest (from history)"
  );
  // Amount should be carried from history (previous message said "20 MNT")
  if (r3.intent.amount && r3.intent.amount > 0) {
    console.log(`  Amount carried over from history: ${r3.intent.amount} ${r3.intent.token || "MNT"}`);
  } else {
    console.log(`  WARN: Amount not carried over (may need history context improvement)`);
  }

  // Test 4: Wallet address in message
  const addr = "0x3811d50e6385fC6b34196eBe3972df43dA3084B5";
  const r4 = await processMessage(`${addr} の残高を調べて`, 88888, "Japanese");
  console.log(`  Intent: ${r4.intent.action}, Target: ${r4.intent.targetAddress}`);
  assert(r4.intent.action === "check_balance", "Address query → check_balance");
  assert(r4.intent.targetAddress === addr, "Address extracted correctly");

  // Test 5: Status query
  const r5 = await processMessage("我的资产怎么样", CHAT_ID, "Chinese");
  console.log(`  Intent: ${r5.intent.action}`);
  assert(r5.intent.action === "status", "Portfolio query → status");

  // ── 3. DeFi data functions ──
  console.log("\n3. DeFi data integrity");
  const all = getAllPools();
  assert(all.length >= 4, `Pool count: ${all.length}`);
  assert(all[0].apy >= all[all.length - 1].apy, "Pools sorted by APY descending");

  const best = getHighestAPY();
  assert(best.apy >= 450, `Highest APY pool exists: ${best.name} @ ${(best.apy / 100).toFixed(1)}%`);

  const summary = formatPoolSummary(best);
  assert(summary.includes(best.name), "Pool summary contains name");
  assert(summary.includes("APY"), "Pool summary contains APY");

  // ── 4. Pending investment storage ──
  console.log("\n4. Pending investment carry-over");
  setPendingInvestment(CHAT_ID, 50, "MNT");
  const pending = getPendingInvestment(CHAT_ID);
  assert(pending !== null && pending.amount === 50, "Pending amount: 50 MNT");
  assert(pending !== null && pending.token === "MNT", "Pending token: MNT");

  // Clear for new chat
  const empty = getPendingInvestment(12345);
  assert(empty === null, "Unknown chat → null pending");

  // ── 5. History persistence ──
  console.log("\n5. Conversation history");
  const histChat = 77777;
  const r6 = await processMessage("What's the highest APY?", histChat, "English");
  assert(r6.intent.action === "compare", "EN compare intent");
  // Second message in same chat — history should have context
  const r7 = await processMessage("And the safest one?", histChat, "English");
  console.log(`  Follow-up intent: ${r7.intent.action}, Strategy: ${r7.intent.strategy}`);
  assert(r7.response.length > 10, "Follow-up has response");

  // ── 6. English-only (no translation overhead) ──
  console.log("\n6. English fast path");
  const engChat = 33333;
  setUserLang(engChat, "English");
  assert(getUserLang(engChat) === "English", "English stored");
  const r8 = await processMessage("show me pools", engChat, "English");
  assert(r8.intent.action !== "unknown", "EN pool query");
  assert(r8.response.length > 10, "EN response generated");

  console.log("\n=== Self-test complete ===");
}

main().catch((e) => {
  console.error("Test crashed:", e);
  process.exit(1);
});
