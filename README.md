# ClawBot — AI DeFi Butler on Mantle

> **Mantle Turing Test Hackathon 2026 · Agentic Economy Track**
>
> Natural language DeFi management. Tell ClawBot what you want, it executes on-chain.

## What It Does

ClawBot is a Telegram bot that understands natural language commands and manages DeFi positions on Mantle Network. Instead of clicking through 5 different dApps to compare APY, deposit, and rebalance, you just type:

> "Find me the highest stable yield and invest 50 MNT"

ClawBot parses your intent with AI, scans Mantle's DeFi protocols, recommends the best strategy, and executes it through a smart contract vault — all from a Telegram chat.

Every decision is recorded on-chain via ERC-8004-style Agent Identity NFTs, creating an auditable reputation trail for the AI agent.

## Architecture

```
User (Telegram)
    |  "invest 50 MNT into highest APY pool"
    v
+-----------------------------------------+
|  ClawBot (grammY + DeepSeek API)        |
|  +-----------+  +----------------+      |
|  | NLU       |  | DeFi Scanner   |      |
|  | Parser    |  | (Mantle RPC)   |      |
|  +-----+-----+  +-------+--------+      |
|        |  ParsedIntent  | APY Data      |
|        +--------+-------+               |
|                 v                       |
|          Strategy Selector              |
+------------------+----------------------+
                   | ethers.js tx
                   v
+-----------------------------------------+
|  Mantle Network (Sepolia Testnet)        |
|  +----------------+  +----------------+  |
|  | AgentVault     |  | AgentIdentity  |  |
|  | · deposit()    |  | · createAgent  |  |
|  | · executeStr   |  | · logAction    |  |
|  | · withdraw()   |  | · getActions   |  |
|  +----------------+  +----------------+  |
+-----------------------------------------+
                   |
                   v
+-----------------------------------------+
|  Dashboard (Next.js · Static Export)    |
|  · Vault TVL & Weighted APY             |
|  · Strategy comparison cards            |
|  · Agent on-chain action feed           |
+-----------------------------------------+
```

## Smart Contracts (9/9 deployed on Mantle Sepolia)

### Identity & Reputation
| 合约 | 用途 |
|------|------|
| `AgentIdentity` | AI Agent 链上身份 NFT，不可转让。记录行为日志、动态信誉评分、Agent 间背书 |
| `ReputationCalculator` | 去中心化信誉算法：APY 表现、执行时效、时间衰减。Bot 提交数据、守护者投票仲裁 |

### Execution & Security
| 合约 | 用途 |
|------|------|
| `AgentVault` | AI 管理收益金库。身份门控执行策略，支持意图发布 + 挑战窗口流程 |
| `StrategyArbiter` | 策略意图发布、Bot 质押、守护者挑战。执行前强制挑战窗口 |
| `ChallengeMechanism` | Pandora's Box 多轮递增挑战博弈。挑战者与 Bot 轮流加注，上限后守护者仲裁 |
| `ZKPVerifier` | Commit-Reveal 验证器，Binding Bot 到具体执行参数，执行后揭示并验证 |

### Registries & Economics
| 合约 | 用途 |
|------|------|
| `GuardianRegistry` | 去中心化守护者身份注册与质押。守护者参与挑战投票和仲裁 |
| `BotRegistry` | 去中心化 Bot 身份注册与质押。Bot 发布策略、执行交易、获取激励 |
| `EconomicModel` | 协议收费模型：注册费 + 查询费 + 匹配费 → 国库/守护者/Agent 三方分配 |

> 完整部署地址见 [DEPLOYED_ADDRESSES.md](./DEPLOYED_ADDRESSES.md)

## Project Structure

```
clawbot/
├── contracts/              # Solidity (Hardhat)
│   ├── contracts/
│   │   ├── AgentIdentity.sol
│   │   ├── AgentVault.sol
│   │   ├── StrategyArbiter.sol
│   │   ├── ChallengeMechanism.sol
│   │   ├── ReputationCalculator.sol
│   │   ├── EconomicModel.sol
│   │   ├── GuardianRegistry.sol
│   │   ├── BotRegistry.sol
│   │   └── ZKPVerifier.sol
│   ├── scripts/deploy_all.ts
│   └── test/   (166/166 passing)
├── bot/                    # Telegram Bot (Node.js)
│   └── src/
│       ├── index.ts        # Bot entry, message routing
│       ├── ai-nlu.ts       # DeepSeek intent parser
│       ├── defi-queries.ts # Mantle pool APY data
│       └── contract.ts     # ethers.js on-chain interaction
└── frontend/               # Dashboard (Next.js 14)
    └── src/
        ├── app/page.tsx    # Main dashboard
        └── lib/contracts.ts # Read-only chain queries
```

## Quick Start

**Prerequisites:** Node.js 18+, Mantle Sepolia wallet with testnet MNT, Telegram Bot Token, DeepSeek API Key

### 1. Deploy Contracts

```bash
cd contracts
cp .env.example .env   # Add PRIVATE_KEY
npm install
npx hardhat compile
npx hardhat test        # 166/166 passing
npx hardhat run scripts/deploy_all.ts --network mantleSepolia  # 部署全部 9 个合约
```

Note the deployed AgentIdentity and AgentVault addresses for the next steps.

### 2. Run Bot

```bash
cd bot
cp .env.example .env   # Add TELEGRAM_BOT_TOKEN, DEEPSEEK_API_KEY, PRIVATE_KEY, contract addresses
npm install
npm run dev
```

### 3. Build Dashboard

```bash
cd frontend
npm install
cp .env.example .env   # Add NEXT_PUBLIC_VAULT_ADDRESS, NEXT_PUBLIC_IDENTITY_ADDRESS
npm run dev             # http://localhost:3000
npm run build           # Static export → out/
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Blockchain | Mantle Network (Sepolia Testnet, Chain ID 5003) |
| Smart Contracts | Solidity 0.8.20, Hardhat, ethers.js v6 |
| AI / NLU | DeepSeek API (deepseek-chat) |
| Bot Framework | grammY |
| Frontend | Next.js 14, Tailwind CSS, static export |
| Identity | ERC-8004 inspired on-chain agent reputation |

## Track Submission

- **Hackathon:** Mantle Turing Test Hackathon 2026 (Phase 2: AI Awakening)
- **Track:** Agentic Economy
- **Network:** Mantle Sepolia Testnet

### Qualification Checklist
- [x] 9 smart contracts deployed on Mantle Sepolia Testnet
- [x] 166 tests passing, zero compilation warnings
- [x] AI-powered on-chain execution (`executeStrategyWithIntent`)
- [x] Agent identity with on-chain reputation + endorsements
- [x] Open source (MIT)
- [x] 8 on-chain test transactions verified (see DEPLOYED_ADDRESSES.md)

## Why This Wins

1. **Natural language is the killer UX for DeFi.** ClawBot makes yield management as simple as texting.
2. **On-chain agent reputation.** Every AI decision is logged on-chain — this solves the "black box AI" trust problem for autonomous agents.
3. **Working end-to-end.** Contracts deployed, bot running, dashboard live. Not a mockup.
4. **Mantle-native.** Built for Mantle's DeFi ecosystem (Agni, Merchant Moe, Lendle, FusionX, Minterest).

## Challenges

- **AI intent parsing:** DeepSeek occasionally misclassifies compound intents. Mitigated with structured system prompts and inline keyboard fallbacks.
- **Mantle RPC rate limiting:** Configured multiple backup RPC providers for reliable pool data queries.
- **Agent ownership model:** The vault contract creates and owns the agent identity, while a human vault owner authorizes strategy execution — clean separation of concerns.

## Demo

▶ **[Watch Demo Video](demo/demo-video.mp4)** (2 min, 125s — English narration)

Walkthrough: Split-screen Telegram + Mantle explorer → staking → strategies → challenge mechanism → multi-agent endorsements → 9-contract deployment summary.

*Click to watch in-browser, or right-click to download.*

## Pitch (200-500 words for hackathon submission)

ClawBot is an AI-powered DeFi butler that turns natural language into verifiable on-chain execution — all from a Telegram chat.

**The problem:** On-chain AI agents are multiplying, but there's no standard mechanism to verify whether an address is controlled by a human or an AI. This enables Sybil attacks in DAO voting, fake social engagement, and unaccountable autonomous agents that can drain user funds without recourse.

**Our solution:** A four-layer architecture where every AI action is identity-gated, reputation-weighted, and permanently auditable.

1. **Bot Layer** — Users interact via Telegram. Natural language commands like "invest 50 MNT into the highest APY pool" are parsed by DeepSeek into multi-step execution plans (balance check → APY scan → strategy comparison → authorization → execution).
2. **Identity Layer** (AgentIdentity.sol) — Every AI agent gets a non-transferable on-chain NFT recording its creation time, model version, Telegram ID hash, and dynamically updated behavior log with reputation score.
3. **Execution Layer** (AgentVault + StrategyArbiter + ChallengeMechanism) — The vault holds user funds. Before any strategy executes, the arbiter enforces an intent-publication window where guardians can challenge the decision. The Pandora's Box mechanism creates escalating stakes: challenger and bot trade increasing deposits until a cap triggers guardian arbitration.
4. **Verification Layer** — All 9 smart contracts operate on Mantle Sepolia, creating a complete trust chain: User → Telegram → AI reasoning → on-chain identity → permission check → asset execution. Every step is logged on-chain.

**Why this wins:** Natural language is the killer UX for DeFi. On-chain agent reputation solves the "black box AI" trust problem. Working end-to-end — not a mockup — with 166 tests, zero compilation warnings, and 8 verified on-chain transactions.

## Team

Solo builder, powered by Claude Code.

## License

MIT
