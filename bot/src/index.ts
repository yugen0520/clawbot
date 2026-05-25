import "dotenv/config";
import { Bot, InlineKeyboard } from "grammy";
import { parseIntent, generateResponse } from "./ai-nlu";
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
  getTotalDeposits,
} from "./contract";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const RPC_URL = process.env.MANTLE_RPC_URL || "https://rpc.sepolia.mantle.xyz";
const PRIVATE_KEY = process.env.PRIVATE_KEY || "";
const VAULT_ADDR = process.env.AGENT_VAULT_ADDRESS || "";
const IDENTITY_ADDR = process.env.AGENT_IDENTITY_ADDRESS || "";

if (BOT_TOKEN && PRIVATE_KEY && VAULT_ADDR && IDENTITY_ADDR) {
  initContracts(RPC_URL, PRIVATE_KEY, VAULT_ADDR, IDENTITY_ADDR);
}

const bot = new Bot(BOT_TOKEN);

// Welcome message with inline keyboard
bot.command("start", async (ctx) => {
  const keyboard = new InlineKeyboard()
    .text("Compare Yields", "compare")
    .text("Best Strategy", "best")
    .row()
    .text("My Portfolio", "portfolio")
    .text("Agent Info", "agent");

  await ctx.reply(
    [
      "Hello, I'm *ClawBot*, your AI DeFi butler on Mantle Network.",
      "",
      "I can help you:",
      "• Find the best yield strategies",
      "• Deposit into AI-optimized vaults",
      "• Execute strategies with natural language",
      "",
      "Try: \"show me the highest APY pool\" or \"invest 10 MNT into stable strategy\"",
      "",
      "What would you like to do?",
    ].join("\n"),
    { parse_mode: "Markdown", reply_markup: keyboard }
  );
});

// Handle inline button callbacks
bot.callbackQuery("compare", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.reply(formatAllPools(), { parse_mode: "Markdown" });
});

bot.callbackQuery("best", async (ctx) => {
  await ctx.answerCallbackQuery();
  const best = getHighestAPY();
  await ctx.reply(
    ["*Best Yield Strategy:*\n", formatPoolSummary(best)].join("\n"),
    { parse_mode: "Markdown" }
  );
});

bot.callbackQuery("portfolio", async (ctx) => {
  await ctx.answerCallbackQuery();
  try {
    const totalDeposits = await getTotalDeposits();
    const strategies = await getAllStrategies();
    const lines = [
      `*Total Vault Deposits:* ${totalDeposits} MNT\n`,
      "*Active Strategies:*",
    ];
    for (const s of strategies) {
      if (s.active) {
        lines.push(
          `  • ${s.name}: ${(Number(s.currentAPY) / 100).toFixed(1)}% APY`
        );
      }
    }
    await ctx.reply(lines.join("\n"), { parse_mode: "Markdown" });
  } catch {
    await ctx.reply(
      "Contract connection not configured. Please set PRIVATE_KEY and contract addresses in .env"
    );
  }
});

bot.callbackQuery("agent", async (ctx) => {
  await ctx.answerCallbackQuery();
  try {
    const agent = await getAgentInfo(0);
    const actions = await getAgentActions(0, 3);
    const lines = [
      `*Agent:* ${agent.name}`,
      `Model: ${agent.modelProvider}`,
      `Actions logged: ${agent.actionCount.toString()}`,
      `Total value managed: ${agent.totalValueManaged.toString()} wei`,
      "",
      "*Recent actions:*",
    ];
    for (const a of actions) {
      lines.push(
        `  • [${new Date(Number(a.timestamp) * 1000).toLocaleDateString()}] ${a.description}`
      );
    }
    await ctx.reply(lines.join("\n"), { parse_mode: "Markdown" });
  } catch {
    await ctx.reply(
      "Agent identity contract not connected. Set IDENTITY_ADDRESS in .env"
    );
  }
});

// Main message handler: AI NLU
bot.on("message:text", async (ctx) => {
  const msg = ctx.message.text;

  // Quick commands without AI
  if (msg.toLowerCase() === "/compare") {
    await ctx.reply(formatAllPools(), { parse_mode: "Markdown" });
    return;
  }

  const intent = await parseIntent(msg);

  switch (intent.action) {
    case "compare":
    case "invest": {
      const riskLevel = intent.riskLevel || "medium";
      const pool =
        intent.strategy === "highest yield"
          ? getHighestAPY(riskLevel)
          : getBestByRisk(riskLevel);

      const response = await generateResponse(intent, {
        recommendedPool: pool,
        amount: intent.amount || "unspecified",
        riskLevel,
      });

      const keyboard = new InlineKeyboard().text(
        "Execute This Strategy",
        `execute_${pool.name.slice(0, 20)}`
      );

      await ctx.reply(
        `${response}\n\n*Recommended Pool:*\n${formatPoolSummary(pool)}`,
        { parse_mode: "Markdown", reply_markup: keyboard }
      );
      break;
    }

    case "status": {
      try {
        const total = await getTotalDeposits();
        const strategies = await getAllStrategies();
        const activeStrats = strategies.filter((s: any) => s.active);
        const response = await generateResponse(intent, {
          totalDeposits: total,
          activeStrategies: activeStrats.length,
          strategies: activeStrats.map((s: any) => ({
            name: s.name,
            apy: (Number(s.currentAPY) / 100).toFixed(1) + "%",
            allocated: s.totalAllocated.toString(),
          })),
        });
        await ctx.reply(response);
      } catch {
        await ctx.reply(
          "Contract not connected. Use /help to see available commands."
        );
      }
      break;
    }

    case "help":
    default: {
      const response = await generateResponse(intent, {
        pools: getAllPools().length,
        topAPY: (getHighestAPY().apy / 100).toFixed(1) + "%",
      });
      await ctx.reply(response, { parse_mode: "Markdown" });
      break;
    }
  }
});

// Start polling
if (BOT_TOKEN) {
  bot.start({
    onStart: () => console.log("ClawBot is running..."),
  });
} else {
  console.log("TELEGRAM_BOT_TOKEN not set. Bot is not running.");
  console.log("Available in dry-run mode for testing.");
}

export { bot };
