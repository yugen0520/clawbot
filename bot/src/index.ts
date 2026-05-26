import "dotenv/config";
import { Bot, InlineKeyboard } from "grammy";
import nodeFetch from "node-fetch";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { HttpsProxyAgent } = require("https-proxy-agent") as { HttpsProxyAgent: any };

const PROXY_URL = process.env.HTTPS_PROXY || process.env.https_proxy || "";
const proxyAgent = PROXY_URL ? new HttpsProxyAgent(PROXY_URL) : undefined;

function createProxiedFetch(): typeof nodeFetch {
  if (!proxyAgent) return nodeFetch;
  return ((url: any, init?: any) => {
    return nodeFetch(url, { ...init, agent: proxyAgent as any });
  }) as typeof nodeFetch;
}

import {
  processMessage,
  detectLanguageName,
  setUserLang,
  getUserLang,
  translateText,
  addToHistory,
  setPendingInvestment,
  getPendingInvestment,
} from "./ai-nlu";
import {
  getHighestAPY,
  getBestByRisk,
  getAllPools,
  formatPoolSummary,
  formatAllPools,
} from "./defi-queries";
import {
  initContracts,
  setEthersProxy,
  getAgentInfo,
  getAgentActions,
  getAllStrategies,
  deposit,
  executeStrategy,
  getTotalDeposits,
  endorseOtherAgent,
  getAllAgents,
  publishIntent,
  challengeIntent,
  resolveArbiterChallenge,
  canExecute,
  getIntent,
  getBotInfo,
  stakeAsBot,
  stakeAsGuardianArbiter,
  submitStrategyResult,
  stakeAsSubmitter,
  stakeAsGuardianReputation,
  getEffectiveReputation,
  getSubmitterInfo,
  getFeeParams,
  getPendingPools,
  getTotalFeesCollected,
  getArbiterIntentCount,
  challengeResult,
  voteOnChallenge,
  resolveReputationChallenge,
  finalizeResult,
  provider,
  signer,
  identityContract,
} from "./contract";
import { ethers } from "ethers";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const RPC_URL = process.env.MANTLE_RPC_URL || "https://rpc.sepolia.mantle.xyz";
const PRIVATE_KEY = process.env.PRIVATE_KEY || "";
const VAULT_ADDR = process.env.AGENT_VAULT_ADDRESS || "";
const IDENTITY_ADDR = process.env.AGENT_IDENTITY_ADDRESS || "";
const REPUTATION_ADDR = process.env.REPUTATION_CALCULATOR_ADDRESS || "";
const ARBITER_ADDR = process.env.STRATEGY_ARBITER_ADDRESS || "";
const ECONOMIC_ADDR = process.env.ECONOMIC_MODEL_ADDRESS || "";

if (BOT_TOKEN && PRIVATE_KEY && VAULT_ADDR && IDENTITY_ADDR) {
  if (proxyAgent) setEthersProxy(proxyAgent);
  initContracts(RPC_URL, PRIVATE_KEY, VAULT_ADDR, IDENTITY_ADDR, REPUTATION_ADDR || undefined, ARBITER_ADDR || undefined, ECONOMIC_ADDR || undefined);
}

const bot = proxyAgent
  ? new Bot(BOT_TOKEN, { client: { fetch: createProxiedFetch() as any } })
  : new Bot(BOT_TOKEN);

// Request logging
bot.use(async (ctx, next) => {
  const start = Date.now();
  await next();
  const ms = Date.now() - start;
  const msg = ctx.message?.text || ctx.callbackQuery?.data || "";
  const preview = msg.slice(0, 80).replace(/\n/g, " ");
  console.log(`[${ms}ms] ${preview}`);
});

function hasProvider(): boolean {
  return typeof provider !== "undefined" && provider !== null;
}

async function bilingual(english: string, lang: string): Promise<string> {
  if (lang === "English") return english;
  const translated = await translateText(english, lang);
  return `${english}\n\n${translated}`;
}

async function replyBilingual(
  ctx: any,
  english: string,
  opts?: { parse_mode?: string; reply_markup?: any }
) {
  const lang = getUserLang(ctx.chat?.id || 0);
  const text = await bilingual(english, lang);
  await ctx.reply(text, opts);
}

// Welcome
bot.command("start", async (ctx) => {
  const keyboard = new InlineKeyboard()
    .text("Compare Yields / 对比收益", "compare")
    .text("Best Strategy / 最佳策略", "best")
    .row()
    .text("Portfolio / 我的资产", "portfolio")
    .text("Agent Info / Agent 信息", "agent")
    .row()
    .text("Agent Directory / Agent 目录", "agents_list")
    .text("Check Balance / 查余额", "check_balance_prompt")
    .row()
    .text("Reputation / 信誉查询", "reputation_check")
    .text("Protocol Fees / 协议费用", "protocol_fees");

  await ctx.reply(
    [
      "Hello! I'm *ClawBot*, your AI DeFi butler on Mantle Network.",
      "你好！我是 *ClawBot*，你在 Mantle Network 上的 AI DeFi 管家。",
      "",
      "I reply in your language — just talk to me naturally.",
      "我会自动跟随你的语言回复，直接用母语跟我对话即可。",
      "",
      "• Find the best yield strategies / 找最高收益策略",
      "• Deposit into AI-optimized vaults / 存入 AI 优化金库",
      "• Publish strategy intents / 发布策略意图公示",
      "• Challenge suspicious strategies / 挑战可疑策略",
      "• Check agent reputation (on-chain) / 查链上信誉评分",
      "• Stake as Bot or Guardian / 质押成为 Bot 或守护者",
      "",
      "Commands: /agents /rate /publish /challenge /reputation /stake /guardians",
    ].join("\n"),
    { parse_mode: "Markdown", reply_markup: keyboard }
  );
});

// ── Callbacks ──

bot.callbackQuery("compare", async (ctx) => {
  await ctx.answerCallbackQuery();
  const text = formatAllPools();
  await replyBilingual(ctx, text, { parse_mode: "Markdown" });
  addToHistory(ctx.chat?.id || 0, "user", "[Compare Yields]");
  addToHistory(ctx.chat?.id || 0, "assistant", text.slice(0, 200));
});

bot.callbackQuery("best", async (ctx) => {
  await ctx.answerCallbackQuery();
  const best = getHighestAPY();
  const summary = formatPoolSummary(best);
  await replyBilingual(
    ctx,
    `*Best Yield Strategy:*\n${summary}`,
    { parse_mode: "Markdown" }
  );
  addToHistory(ctx.chat?.id || 0, "user", "[Best Strategy]");
  addToHistory(ctx.chat?.id || 0, "assistant", `Best: ${best.name} at ${(best.apy / 100).toFixed(1)}% APY`);
});

bot.callbackQuery("portfolio", async (ctx) => {
  await ctx.answerCallbackQuery();
  const lang = getUserLang(ctx.chat?.id || 0);
  const cid = ctx.chat?.id || 0;
  try {
    const totalDeposits = await getTotalDeposits();
    const strategies = await getAllStrategies();
    const walletAddr = await signer.getAddress();
    const balance = await provider.getBalance(walletAddr);
    const lines = [
      `*Wallet:* \`${walletAddr}\``,
      `*On-chain Balance:* ${ethers.formatEther(balance)} MNT`,
      `*Vault Deposits:* ${totalDeposits} MNT`,
      "",
      "*Active Strategies:*",
    ];
    for (const s of strategies) {
      if (s.active) {
        lines.push(`  - ${s.name}: ${(Number(s.currentAPY) / 100).toFixed(1)}% APY`);
      }
    }
    const text = await bilingual(lines.join("\n"), lang);
    await ctx.reply(text, { parse_mode: "Markdown" });
    addToHistory(cid, "user", "[Portfolio]");
    addToHistory(cid, "assistant", `Balance: ${ethers.formatEther(balance)} MNT, Deposits: ${totalDeposits} MNT`);
  } catch {
    await replyBilingual(ctx, "Contract not connected.");
  }
});

bot.callbackQuery("agent", async (ctx) => {
  await ctx.answerCallbackQuery();
  const lang = getUserLang(ctx.chat?.id || 0);
  const cid = ctx.chat?.id || 0;
  try {
    const agent = await getAgentInfo(0);
    const actions = await getAgentActions(0, 3);
    const repScore = Number(agent.reputationScore);
    const repEmoji = repScore >= 7000 ? "🟢" : repScore >= 3000 ? "🟡" : "🔴";
    const lines = [
      `*Agent:* ${agent.name}`,
      `Model: ${agent.modelProvider}`,
      `Status: ${agent.isActive ? "Active" : "Inactive"}`,
      `Reputation: ${repEmoji} ${(repScore / 100).toFixed(0)}%`,
      `Actions logged: ${agent.actionCount.toString()}`,
      `Managed: ${ethers.formatEther(agent.totalValueManaged)} MNT`,
      "",
      "*Recent Actions:*",
    ];
    for (const a of actions) {
      lines.push(`  - [${new Date(Number(a.timestamp) * 1000).toLocaleDateString()}] ${a.description}`);
    }
    const text = await bilingual(lines.join("\n"), lang);
    await ctx.reply(text, { parse_mode: "Markdown" });
    addToHistory(cid, "user", "[Agent Info]");
    addToHistory(cid, "assistant", `Agent ${agent.name}, managed: ${ethers.formatEther(agent.totalValueManaged)} MNT`);
  } catch {
    await replyBilingual(ctx, "Agent identity contract not connected.");
  }
});

bot.callbackQuery("check_balance_prompt", async (ctx) => {
  await ctx.answerCallbackQuery();
  const walletAddr = hasProvider() ? await signer.getAddress() : "";
  await replyBilingual(
    ctx,
    [
      "Send me a wallet address (0x...) to check its MNT balance.",
      "",
      `Example:\n\`${walletAddr || "0xE3D68E3674B58F55282C1bCc37f240dFf87918e4"}\``,
    ].join("\n"),
    { parse_mode: "Markdown" }
  );
  addToHistory(ctx.chat?.id || 0, "user", "[Check Balance]");
});

bot.callbackQuery("agents_list", async (ctx) => {
  await ctx.answerCallbackQuery();
  const lang = getUserLang(ctx.chat?.id || 0);
  try {
    const agents = await getAllAgents();
    if (agents.length === 0) {
      await replyBilingual(ctx, "No agents registered yet.");
      return;
    }
    const lines = [`*All Registered Agents (${agents.length}):*\n`];
    for (const a of agents) {
      const repEmoji = a.reputationScore >= 7000 ? "🟢" : a.reputationScore >= 3000 ? "🟡" : "🔴";
      lines.push(
        `*ID ${a.id}:* ${a.name} ${a.isActive ? "" : "(Inactive)"}`,
        `  Model: ${a.modelProvider} | Rep: ${repEmoji} ${(a.reputationScore / 100).toFixed(0)}%`,
        `  Actions: ${a.actionCount} | Endorsements: ${a.endorsementCount} (avg ${a.avgEndorsement}/5)`,
        ""
      );
    }
    const text = await bilingual(lines.join("\n"), lang);
    await ctx.reply(text, { parse_mode: "Markdown" });
  } catch {
    await replyBilingual(ctx, "Could not fetch agent directory.");
  }
});

bot.callbackQuery("reputation_check", async (ctx) => {
  await ctx.answerCallbackQuery();
  const lang = getUserLang(ctx.chat?.id || 0);
  try {
    const agent = await getAgentInfo(0);
    const effective = await getEffectiveReputation(0).catch(() => 0);
    const lines = [
      `*Agent #0 Reputation*`,
      `Base score: ${(Number(agent.reputationScore) / 100).toFixed(0)}%`,
      `Effective (decay-adjusted): ${(effective / 100).toFixed(0)}%`,
      `Status: ${agent.isActive ? "Active" : "Inactive"}`,
      `Actions: ${agent.actionCount.toString()}`,
      "",
      effective === 0 ? "ReputationCalculator not deployed yet — showing base score." : "Effective score computed by ReputationCalculator with APY, timeliness, and time-decay factors.",
    ];
    await replyBilingual(ctx, lines.join("\n"), { parse_mode: "Markdown" });
  } catch {
    await replyBilingual(ctx, "Reputation data unavailable. Ensure contracts are deployed.");
  }
});

bot.callbackQuery("protocol_fees", async (ctx) => {
  await ctx.answerCallbackQuery();
  const lang = getUserLang(ctx.chat?.id || 0);
  try {
    const fees = await getFeeParams();
    const pools = await getPendingPools();
    const total = await getTotalFeesCollected();
    const lines = [
      "*Protocol Fee Structure (EconomicModel)*",
      "",
      `Registration fee: ${fees?.registrationFee || "N/A"} MNT`,
      `Query fee: ${fees?.queryFee || "N/A"} MNT`,
      `Matching fee: ${fees?.matchingFeeBasisPoints || "N/A"} bps (${(fees?.matchingFeeBasisPoints || 0) / 100}%)`,
      "",
      "*Distribution:*",
      `Treasury: ${fees?.treasuryShare || 50}% | Guardians: ${fees?.guardianShare || 30}% | Agents: ${fees?.agentIncentiveShare || 20}%`,
      "",
      `Total collected: ${total} MNT`,
      pools ? `Pending: ${pools.treasury} MNT (treasury) | ${pools.guardian} MNT (guardians) | ${pools.agent} MNT (agents)` : "",
    ].filter(Boolean);
    await replyBilingual(ctx, lines.join("\n"), { parse_mode: "Markdown" });
  } catch {
    await replyBilingual(ctx, "Economic model contract not deployed yet.");
  }
});

// Execute strategy callback
bot.callbackQuery(/^execute_/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const strategyName = ctx.callbackQuery.data.replace("execute_", "");
  const lang = getUserLang(ctx.chat?.id || 0);
  const cid = ctx.chat?.id || 0;
  try {
    const pools = getAllPools();
    const pool = pools.find((p) => p.name.startsWith(strategyName));
    if (!pool) {
      await replyBilingual(ctx, "Strategy not found.");
      return;
    }
    if (!pool.strategyId) {
      await replyBilingual(ctx, `Strategy "${pool.name}" is not yet registered on-chain. Please try a different pool.`);
      return;
    }
    const pending = getPendingInvestment(cid);
    if (!pending?.amount) {
      await replyBilingual(ctx, "Please tell me how much you'd like to invest first. For example: \"buy 20 MNT\".");
      return;
    }
    const amount = String(pending.amount);

    // Step 1: deposit MNT into vault
    const depositTx = await deposit(amount);

    // Step 2: execute the on-chain strategy (verifyAgent + logAction)
    const reason = `AI agent executed ${pool.name} at ${(pool.apy / 100).toFixed(1)}% APY`;
    try {
      const execTx = await executeStrategy(pool.strategyId, amount, pool.apy, reason);

      const text = await bilingual(
        [
          `*Executed: ${pool.name}*`,
          `Amount: ${amount} MNT`,
          `APY: ${(pool.apy / 100).toFixed(1)}%`,
          `Protocol: ${pool.protocol}`,
          `Deposit Tx: \`${depositTx.hash}\``,
          `Strategy Tx: \`${execTx.hash}\``,
        ].join("\n"),
        lang
      );
      await ctx.reply(text, { parse_mode: "Markdown" });
      addToHistory(cid, "user", `[Execute: ${pool.name}]`);
      addToHistory(cid, "assistant", `Deposited ${amount} MNT, executed ${pool.name}. Tx: ${execTx.hash}`);
    } catch (execErr: any) {
      const text = await bilingual(
        [
          `*Partially Executed: ${pool.name}*`,
          "",
          `Deposit of ${amount} MNT succeeded.`,
          `Strategy execution failed: ${execErr.message || "unknown"}`,
          "",
          `Your funds are safe in the vault. Use /start → Portfolio to check or withdraw.`,
        ].join("\n"),
        lang
      );
      await ctx.reply(text, { parse_mode: "Markdown" });
      addToHistory(cid, "user", `[Execute: ${pool.name}]`);
      addToHistory(cid, "assistant", `Deposited ${amount} MNT but strategy execution failed: ${execErr.message}`);
    }
  } catch (e: any) {
    await replyBilingual(ctx, `Execution failed: ${e.message || "unknown error"}`);
  }
});

// ── Multi-agent commands ──

bot.command("agents", async (ctx) => {
  const lang = getUserLang(ctx.chat?.id || 0);
  try {
    const agents = await getAllAgents();
    if (agents.length === 0) {
      await replyBilingual(ctx, "No agents registered yet.");
      return;
    }
    const lines = [`*All Registered Agents (${agents.length}):*\n`];
    for (const a of agents) {
      const repEmoji = a.reputationScore >= 7000 ? "🟢" : a.reputationScore >= 3000 ? "🟡" : "🔴";
      lines.push(
        `*ID ${a.id}:* ${a.name} ${a.isActive ? "" : "(Inactive)"}`,
        `  Model: ${a.modelProvider} | Rep: ${repEmoji} ${(a.reputationScore / 100).toFixed(0)}%`,
        `  Actions: ${a.actionCount} | Endorsements: ${a.endorsementCount} (avg ${a.avgEndorsement}/5)`,
        ""
      );
    }
    const text = await bilingual(lines.join("\n"), lang);
    await ctx.reply(text, { parse_mode: "Markdown" });
  } catch {
    await replyBilingual(ctx, "Could not fetch agent directory.");
  }
});

bot.command("rate", async (ctx) => {
  const lang = getUserLang(ctx.chat?.id || 0);
  const args = ctx.message?.text?.split(" ").slice(1) || [];
  if (args.length < 2) {
    await replyBilingual(ctx,
      "Usage: `/rate <agentId> <score 1-5> <reason>`\nExample: `/rate 1 5 Excellent yield optimization`",
      { parse_mode: "Markdown" }
    );
    return;
  }
  const targetAgentId = parseInt(args[0], 10);
  const score = parseInt(args[1], 10);
  const reason = args.slice(2).join(" ") || "Endorsed via ClawBot";

  if (isNaN(targetAgentId) || isNaN(score) || score < 1 || score > 5) {
    await replyBilingual(ctx, "Invalid arguments. Usage: `/rate <agentId> <1-5> <reason>`");
    return;
  }

  try {
    const tx = await endorseOtherAgent(targetAgentId, score, reason);
    const text = await bilingual(
      `*Endorsed Agent #${targetAgentId}*\nScore: ${score}/5\nTx: \`${tx.hash}\``,
      lang
    );
    await ctx.reply(text, { parse_mode: "Markdown" });
  } catch (e: any) {
    await replyBilingual(ctx, `Endorsement failed: ${e.message || "unknown"}`);
  }
});

// ── New commands (judge feedback iteration) ──

bot.command("publish", async (ctx) => {
  const lang = getUserLang(ctx.chat?.id || 0);
  const args = ctx.message?.text?.split(" ").slice(1) || [];
  if (args.length < 4) {
    await replyBilingual(ctx,
      "Usage: `/publish <strategyId> <amountMNT> <apyBasisPoints> <stepsJson>`\n" +
      "Example: `/publish AGNI_USDC 5 850 '[{\"action\":\"deposit\",\"protocol\":\"Agni\",\"amount\":\"5 MNT\"}]'`\n" +
      "This publishes a strategy intent on-chain BEFORE execution. Guardians can challenge during the window.",
      { parse_mode: "Markdown" }
    );
    return;
  }
  const strategyId = args[0];
  const amountEth = args[1];
  const apyBp = parseInt(args[2], 10);
  const stepsJson = args.slice(3).join(" ");

  if (isNaN(apyBp)) {
    await replyBilingual(ctx, "Invalid APY basis points. Example: 850 = 8.5%");
    return;
  }

  try {
    const vaultAgentId = 0; // current agent
    const intentId = await publishIntent(vaultAgentId, strategyId, amountEth, apyBp, stepsJson);
    const text = await bilingual(
      `*Strategy Intent Published #${intentId}*\n` +
      `Strategy: ${strategyId}\nAmount: ${amountEth} MNT\nAPY: ${(apyBp / 100).toFixed(1)}%\n\n` +
      `Guardians have ~180s to challenge. After window passes, execute with /execute_intent ${intentId}.`,
      lang
    );
    await ctx.reply(text, { parse_mode: "Markdown" });
  } catch (e: any) {
    await replyBilingual(ctx, `Publish failed: ${e.message || "unknown"}. Ensure you have staked as Bot first (/stake bot <amount>).`);
  }
});

bot.command("challenge", async (ctx) => {
  const lang = getUserLang(ctx.chat?.id || 0);
  const args = ctx.message?.text?.split(" ").slice(1) || [];
  if (args.length < 2) {
    await replyBilingual(ctx,
      "Usage: `/challenge <intentId> <reason>`\n" +
      "Example: `/challenge 3 Suspicious APY claim`\n" +
      "Challenges cost 0.001 MNT (non-refundable). Must be a staked guardian.",
      { parse_mode: "Markdown" }
    );
    return;
  }
  const intentId = parseInt(args[0], 10);
  const reason = args.slice(1).join(" ");

  if (isNaN(intentId)) {
    await replyBilingual(ctx, "Invalid intent ID.");
    return;
  }

  try {
    const tx = await challengeIntent(intentId, reason, "0.001");
    const text = await bilingual(
      `*Challenge Submitted for Intent #${intentId}*\nReason: ${reason}\nTx: \`${tx.hash}\`\n\nGuardians can now vote. Use /resolve_challenge ${intentId} <true|false> to resolve.`,
      lang
    );
    await ctx.reply(text, { parse_mode: "Markdown" });
  } catch (e: any) {
    await replyBilingual(ctx, `Challenge failed: ${e.message || "unknown"}. Ensure you are a staked guardian and within the challenge window.`);
  }
});

bot.command("reputation", async (ctx) => {
  const lang = getUserLang(ctx.chat?.id || 0);
  const args = ctx.message?.text?.split(" ").slice(1) || [];
  const agentId = args[0] ? parseInt(args[0], 10) : 0;

  try {
    const agent = await getAgentInfo(agentId);
    const effective = await getEffectiveReputation(agentId).catch(() => 0);
    const submitterInfo = await getSubmitterInfo(await signer.getAddress()).catch(() => null);
    const lines = [
      `*Agent #${agentId} Reputation*`,
      `Name: ${agent.name}`,
      `Base score: ${(Number(agent.reputationScore) / 100).toFixed(0)}%`,
      `Effective (decay-adjusted): ${(effective / 100).toFixed(0)}%`,
      `Actions: ${agent.actionCount.toString()}`,
      `Managed: ${ethers.formatEther(agent.totalValueManaged)} MNT`,
    ];
    if (submitterInfo) {
      lines.push("", "*Your Submitter Info:*",
        `Staked: ${submitterInfo.totalStake} MNT`,
        `Locked: ${submitterInfo.lockedStake} MNT`,
        `Slashes: ${submitterInfo.slashCount}`,
      );
    }
    if (effective === 0) {
      lines.push("", "Note: ReputationCalculator not deployed — showing base score only.");
    }
    await replyBilingual(ctx, lines.join("\n"), { parse_mode: "Markdown" });
  } catch (e: any) {
    await replyBilingual(ctx, `Reputation query failed: ${e.message || "unknown"}`);
  }
});

bot.command("stake", async (ctx) => {
  const lang = getUserLang(ctx.chat?.id || 0);
  const args = ctx.message?.text?.split(" ").slice(1) || [];
  if (args.length < 2) {
    await replyBilingual(ctx,
      "Usage: `/stake <role> <amountMNT>`\n" +
      "Roles: `bot` (Arbiter), `guardian_a` (Arbiter guardian), `submitter` (Reputation), `guardian_r` (Reputation guardian)\n" +
      "Example: `/stake bot 0.1` or `/stake guardian_a 1`",
      { parse_mode: "Markdown" }
    );
    return;
  }
  const role = args[0].toLowerCase();
  const amount = args[1];

  try {
    let tx;
    switch (role) {
      case "bot": tx = await stakeAsBot(amount); break;
      case "guardian_a": tx = await stakeAsGuardianArbiter(amount); break;
      case "submitter": tx = await stakeAsSubmitter(amount); break;
      case "guardian_r": tx = await stakeAsGuardianReputation(amount); break;
      default:
        await replyBilingual(ctx, `Unknown role: ${role}. Use bot, guardian_a, submitter, or guardian_r.`);
        return;
    }
    const text = await bilingual(
      `*Staked ${amount} MNT as ${role}*\nTx: \`${tx.hash}\``,
      lang
    );
    await ctx.reply(text, { parse_mode: "Markdown" });
  } catch (e: any) {
    await replyBilingual(ctx, `Staking failed: ${e.message || "unknown"}`);
  }
});

bot.command("guardians", async (ctx) => {
  const lang = getUserLang(ctx.chat?.id || 0);
  try {
    const intentCount = await getArbiterIntentCount();
    const botInfo = await getBotInfo(await signer.getAddress()).catch(() => null);
    const lines = [
      "*Guardian & Bot Status*",
      "",
      `Total intents published: ${intentCount}`,
    ];
    if (botInfo) {
      lines.push("",
        "*Your Bot Info (Arbiter):*",
        `Staked: ${botInfo.totalStake} MNT`,
        `Locked: ${botInfo.lockedStake} MNT`,
        `Slashes: ${botInfo.slashCount}`,
      );
    }
    lines.push("",
      "Use `/stake guardian_a <amount>` to become an Arbiter guardian.",
      "Use `/stake bot <amount>` to stake as a bot for publishing intents.",
      "Use `/challenge <intentId> <reason>` to challenge a suspicious strategy intent.",
    );
    await replyBilingual(ctx, lines.join("\n"), { parse_mode: "Markdown" });
  } catch (e: any) {
    await replyBilingual(ctx, `Status query failed: ${e.message || "unknown"}`);
  }
});

bot.command("resolve_challenge", async (ctx) => {
  const lang = getUserLang(ctx.chat?.id || 0);
  const args = ctx.message?.text?.split(" ").slice(1) || [];
  if (args.length < 2) {
    await replyBilingual(ctx,
      "Usage: `/resolve_challenge <intentId> <true|false>`\n" +
      "Example: `/resolve_challenge 3 true` (uphold challenge, slash bot)\n" +
      "Must be a staked guardian.",
      { parse_mode: "Markdown" }
    );
    return;
  }
  const intentId = parseInt(args[0], 10);
  const uphold = args[1].toLowerCase() === "true";

  if (isNaN(intentId)) {
    await replyBilingual(ctx, "Invalid intent ID.");
    return;
  }

  try {
    const tx = await resolveArbiterChallenge(intentId, uphold);
    const text = await bilingual(
      `*Challenge Resolved for Intent #${intentId}*\nOutcome: ${uphold ? "UPHELD (bot slashed)" : "REJECTED (challenge failed)"}\nTx: \`${tx.hash}\``,
      lang
    );
    await ctx.reply(text, { parse_mode: "Markdown" });
  } catch (e: any) {
    await replyBilingual(ctx, `Resolution failed: ${e.message || "unknown"}`);
  }
});

// ── Main handler ──

bot.on("message:text", async (ctx) => {
  const msg = ctx.message.text.trim();

  // Detect and store user language
  const userLang = detectLanguageName(msg);
  setUserLang(ctx.chat.id, userLang);

  // Quick check: bare wallet address
  const bareAddrMatch = msg.match(/^(0x[a-fA-F0-9]{40})$/);
  if (bareAddrMatch) {
    const addr = bareAddrMatch[1];
    if (!hasProvider()) {
      await replyBilingual(ctx, "RPC not connected. Check PRIVATE_KEY and MANTLE_RPC_URL in .env.");
      return;
    }
    await ctx.reply("Querying on-chain balance...");
    try {
      const balance = await provider.getBalance(addr);
      const mntBalance = ethers.formatEther(balance);
      const hasBalance = Number(mntBalance) > 0;
      const text = await bilingual(
        [
          `*Address:* \`${addr}\``,
          `*Balance:* ${mntBalance} MNT`,
          "",
          hasBalance
            ? "This address has MNT on Mantle Sepolia."
            : "Balance is 0 MNT. This address may need testnet tokens.",
        ].join("\n"),
        userLang
      );
      await ctx.reply(text, { parse_mode: "Markdown" });
      addToHistory(ctx.chat.id, "user", msg);
      addToHistory(ctx.chat.id, "assistant", `Balance of ${addr}: ${mntBalance} MNT`);
    } catch (e: any) {
      await replyBilingual(
        ctx,
        `Balance query failed: ${e.message || "unknown error"}\nPlease verify the address is correct and RPC is available.`
      );
    }
    return;
  }

  // Quick commands
  if (msg.toLowerCase() === "/compare") {
    await replyBilingual(ctx, formatAllPools(), { parse_mode: "Markdown" });
    addToHistory(ctx.chat.id, "user", msg);
    addToHistory(ctx.chat.id, "assistant", "Showed all yield pools.");
    return;
  }

  const { intent, response } = await processMessage(msg, ctx.chat.id, userLang);
  console.log(`  → intent: ${intent.action}`, intent.amount ? `amount: ${intent.amount} ${intent.token || ''}` : '', intent.strategy ? `strategy: ${intent.strategy}` : '');

  switch (intent.action) {
    case "check_balance": {
      if (!hasProvider()) {
        await replyBilingual(ctx, "RPC not connected.");
        return;
      }
      const targetAddr = intent.targetAddress;
      if (targetAddr) {
        try {
          const balance = await provider.getBalance(targetAddr);
          const mntBalance = ethers.formatEther(balance);
          const dataText = await bilingual(
            `*Address:* \`${targetAddr}\`\n*Balance:* ${mntBalance} MNT`,
            userLang
          );
          await ctx.reply(`${response}\n\n${dataText}`, { parse_mode: "Markdown" });
        } catch (e: any) {
          await replyBilingual(ctx, `Query failed: ${e.message || "unknown"}\nPlease verify the address.`);
        }
      } else {
        try {
          const walletAddr = await signer.getAddress();
          const balance = await provider.getBalance(walletAddr);
          const dataText = await bilingual(
            `*Agent Wallet:* \`${walletAddr}\`\n*Balance:* ${ethers.formatEther(balance)} MNT`,
            userLang
          );
          await ctx.reply(`${response}\n\n${dataText}`, { parse_mode: "Markdown" });
        } catch (e: any) {
          await replyBilingual(ctx, `Query failed: ${e.message || "unknown"}`);
        }
      }
      break;
    }

    case "compare":
    case "invest": {
      const riskLevel = intent.riskLevel || "medium";
      const pool =
        intent.strategy === "highest yield"
          ? getHighestAPY(riskLevel)
          : getBestByRisk(riskLevel);

      // Store amount for later execute
      if (intent.amount && intent.amount > 0) {
        setPendingInvestment(ctx.chat.id, intent.amount, intent.token || "MNT");
      }

      const poolText = await bilingual(formatPoolSummary(pool), userLang);

      const keyboard = new InlineKeyboard().text(
        "Execute",
        `execute_${pool.name.slice(0, 20)}`
      );

      await ctx.reply(
        `${response}\n\n*Recommended Pool:*\n${poolText}`,
        { parse_mode: "Markdown", reply_markup: keyboard }
      );
      addToHistory(ctx.chat.id, "assistant", `Recommended: ${pool.name} (${(pool.apy / 100).toFixed(1)}% APY, ${pool.protocol}). Amount: ${intent.amount || "unspecified"} ${intent.token || "MNT"}.`);
      break;
    }

    case "deposit": {
      const amount = intent.amount || 0;
      if (amount <= 0) {
        await ctx.reply(response, { parse_mode: "Markdown" });
        return;
      }
      const token = intent.token || "MNT";
      try {
        const tx = await deposit(String(amount));
        const dataText = await bilingual(
          `Deposited ${amount} ${token}\nTx: \`${tx.hash}\``,
          userLang
        );
        await ctx.reply(`${response}\n\n${dataText}`, { parse_mode: "Markdown" });
      } catch (e: any) {
        await replyBilingual(ctx, `Deposit failed: ${e.message || "unknown"}`);
      }
      break;
    }

    case "status": {
      try {
        const total = await getTotalDeposits();
        const strategies = await getAllStrategies();
        const activeStrats = strategies.filter((s: any) => s.active);
        const walletAddr = await signer.getAddress();
        const balance = await provider.getBalance(walletAddr);
        const lines = [
          `*Wallet:* \`${walletAddr}\``,
          `*Balance:* ${ethers.formatEther(balance)} MNT`,
          `*Total Deposits:* ${total} MNT`,
          `*Active Strategies:* ${activeStrats.length}`,
        ];
        for (const s of activeStrats) {
          lines.push(`  - ${s.name}: ${(Number(s.currentAPY) / 100).toFixed(1)}% APY`);
        }
        const dataText = await bilingual(lines.join("\n"), userLang);
        await ctx.reply(`${response}\n\n${dataText}`, { parse_mode: "Markdown" });
      } catch {
        await replyBilingual(ctx, "Contract not connected. Send /start to see available features.");
      }
      break;
    }

    case "rate_agent": {
      const targetId = intent.targetAgentId;
      const score = intent.ratingScore;
      if (!targetId || !score) {
        await ctx.reply(response, { parse_mode: "Markdown" });
        return;
      }
      try {
        const tx = await endorseOtherAgent(targetId, score, intent.rawQuery);
        const dataText = await bilingual(
          `*Endorsed Agent #${targetId}*\nScore: ${score}/5\nTx: \`${tx.hash}\``,
          userLang
        );
        await ctx.reply(`${response}\n\n${dataText}`, { parse_mode: "Markdown" });
      } catch (e: any) {
        await replyBilingual(ctx, `Endorsement failed: ${e.message || "unknown"}`);
      }
      break;
    }

    case "lookup_agent": {
      try {
        if (intent.targetAgentId && intent.targetAgentId > 0) {
          const agent = await getAgentInfo(intent.targetAgentId);
          const stats = await identityContract.getEndorsementStats(intent.targetAgentId);
          const repScore = Number(agent.reputationScore);
          const repEmoji = repScore >= 7000 ? "🟢" : repScore >= 3000 ? "🟡" : "🔴";
          const lines = [
            `*Agent #${intent.targetAgentId}:* ${agent.name}`,
            `Model: ${agent.modelProvider}`,
            `Status: ${agent.isActive ? "Active" : "Inactive"}`,
            `Reputation: ${repEmoji} ${(repScore / 100).toFixed(0)}%`,
            `Actions: ${agent.actionCount.toString()}`,
            `Endorsements: ${stats.count.toString()} (avg ${stats.count > 0 ? (Number(stats.aggregateScore) / Number(stats.count)).toFixed(1) : "N/A"}/5)`,
          ];
          const dataText = await bilingual(lines.join("\n"), userLang);
          await ctx.reply(`${response}\n\n${dataText}`, { parse_mode: "Markdown" });
        } else {
          const agents = await getAllAgents();
          const lines = [`*All Agents (${agents.length}):*\n`];
          for (const a of agents) {
            const repEmoji = a.reputationScore >= 7000 ? "🟢" : a.reputationScore >= 3000 ? "🟡" : "🔴";
            lines.push(
              `*ID ${a.id}:* ${a.name} ${repEmoji} ${(a.reputationScore / 100).toFixed(0)}% | ${a.endorsementCount} endorsements`
            );
          }
          const dataText = await bilingual(lines.join("\n"), userLang);
          await ctx.reply(`${response}\n\n${dataText}`, { parse_mode: "Markdown" });
        }
      } catch {
        await replyBilingual(ctx, "Agent lookup failed.");
      }
      break;
    }

    case "publish_intent": {
      const amount = intent.amount || 0;
      const strategy = intent.strategy || "AGNI_USDC";
      const apyBp = 850; // default
      if (amount <= 0) {
        await ctx.reply(response + "\n\nPlease specify an amount. Example: \"publish 5 MNT to Agni\"", { parse_mode: "Markdown" });
        return;
      }
      try {
        const stepsJson = JSON.stringify([{ action: "deposit", protocol: strategy, amount: `${amount} MNT`, expectedAPY: `${(apyBp / 100).toFixed(1)}%` }]);
        const intentId = await publishIntent(0, strategy, String(amount), apyBp, stepsJson);
        const dataText = await bilingual(
          `*Intent Published #${intentId}*\nStrategy: ${strategy}\nAmount: ${amount} MNT\nAPY: ${(apyBp / 100).toFixed(1)}%\n\nGuardians have ~180s to challenge.`,
          userLang
        );
        await ctx.reply(`${response}\n\n${dataText}`, { parse_mode: "Markdown" });
      } catch (e: any) {
        await replyBilingual(ctx, `Publish failed: ${e.message || "unknown"}. Stake as bot first with /stake bot 0.1`);
      }
      break;
    }

    case "challenge_intent": {
      const iid = intent.intentId || 0;
      if (iid <= 0) {
        await ctx.reply(response + "\n\nPlease specify an intent ID to challenge. Example: \"challenge intent 3\"", { parse_mode: "Markdown" });
        return;
      }
      try {
        const tx = await challengeIntent(iid, intent.rawQuery, "0.001");
        const dataText = await bilingual(
          `*Challenge Submitted for Intent #${iid}*\nTx: \`${tx.hash}\``,
          userLang
        );
        await ctx.reply(`${response}\n\n${dataText}`, { parse_mode: "Markdown" });
      } catch (e: any) {
        await replyBilingual(ctx, `Challenge failed: ${e.message || "unknown"}`);
      }
      break;
    }

    case "check_reputation": {
      const aid = intent.targetAgentId || 0;
      try {
        const agent = await getAgentInfo(aid);
        const effective = await getEffectiveReputation(aid).catch(() => 0);
        const repScore = Number(agent.reputationScore);
        const repEmoji = repScore >= 7000 ? "🟢" : repScore >= 3000 ? "🟡" : "🔴";
        const lines = [
          `*Agent #${aid}:* ${agent.name}`,
          `Base Rep: ${repEmoji} ${(repScore / 100).toFixed(0)}%`,
          `Effective (decay-adjusted): ${(effective / 100).toFixed(0)}%`,
          `Actions: ${agent.actionCount.toString()}`,
          effective > 0 ? "Score computed on-chain by ReputationCalculator (APY + timeliness + time-decay)." : "ReputationCalculator not deployed — base score shown.",
        ];
        const dataText = await bilingual(lines.join("\n"), userLang);
        await ctx.reply(`${response}\n\n${dataText}`, { parse_mode: "Markdown" });
      } catch {
        await replyBilingual(ctx, "Reputation query failed.");
      }
      break;
    }

    case "stake": {
      await ctx.reply(
        response + "\n\nUse `/stake <role> <amount>` to stake.\nRoles: `bot`, `guardian_a`, `submitter`, `guardian_r`\nExample: `/stake bot 0.1`",
        { parse_mode: "Markdown" }
      );
      break;
    }

    case "help":
    default: {
      await ctx.reply(response, { parse_mode: "Markdown" });
      break;
    }
  }
});

if (BOT_TOKEN) {
  bot.start({
    onStart: () => console.log("ClawBot is running..."),
  });
} else {
  console.log("TELEGRAM_BOT_TOKEN not set. Bot is not running.");
}

export { bot };
