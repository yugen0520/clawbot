import "dotenv/config";
import { Bot, InlineKeyboard } from "grammy";
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
  getAgentInfo,
  getAgentActions,
  getAllStrategies,
  deposit,
  executeStrategy,
  getTotalDeposits,
  provider,
  signer,
} from "./contract";
import { ethers } from "ethers";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const RPC_URL = process.env.MANTLE_RPC_URL || "https://rpc.sepolia.mantle.xyz";
const PRIVATE_KEY = process.env.PRIVATE_KEY || "";
const VAULT_ADDR = process.env.AGENT_VAULT_ADDRESS || "";
const IDENTITY_ADDR = process.env.AGENT_IDENTITY_ADDRESS || "";

if (BOT_TOKEN && PRIVATE_KEY && VAULT_ADDR && IDENTITY_ADDR) {
  initContracts(RPC_URL, PRIVATE_KEY, VAULT_ADDR, IDENTITY_ADDR);
}

const bot = new Bot(BOT_TOKEN);

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
    .text("Check Balance / 查余额", "check_balance_prompt");

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
      "• Check on-chain wallet balance / 查链上钱包余额",
      "",
      "Try sending a wallet address, or ask: \"which pool has the highest APY?\" / \"哪个池子收益最高？\"",
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
