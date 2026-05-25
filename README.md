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

## Smart Contracts

### AgentIdentity
ERC-8004 inspired agent identity. Each AI agent gets an on-chain identity with immutable action log — every strategy execution, rebalance, and yield claim is permanently recorded.

### AgentVault
AI-managed yield vault. Users deposit MNT, the agent allocates capital across Mantle DeFi protocols. Multiple strategies with live APY tracking.

| Function | Access | Description |
|----------|--------|-------------|
| `deposit()` | Public | Deposit MNT into the vault |
| `addStrategy(...)` | Vault Owner | Register a new DeFi strategy |
| `executeStrategy(id, amount, apy, reason)` | Vault Owner | AI agent executes allocation — **on-chain AI action** |
| `withdraw(shares)` | Public | Withdraw MNT + accrued yield |
| `getAllStrategies()` | Public | List all active strategies with APY |

## Project Structure

```
clawbot/
├── contracts/              # Solidity (Hardhat)
│   ├── contracts/
│   │   ├── AgentIdentity.sol
│   │   └── AgentVault.sol
│   ├── scripts/deploy.ts
│   └── test/ClawBot.test.ts   (5/5 passing)
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
npx hardhat test        # 5/5 passing
npx hardhat run scripts/deploy.ts --network mantleSepolia
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
- [x] Smart contract deployed on Mantle Testnet
- [x] Contract verified on Mantle Explorer
- [x] AI-powered function callable on-chain (`executeStrategy`)
- [x] Agent identity with on-chain action logging
- [x] Open source (MIT)

## Why This Wins

1. **Natural language is the killer UX for DeFi.** ClawBot makes yield management as simple as texting.
2. **On-chain agent reputation.** Every AI decision is logged on-chain — this solves the "black box AI" trust problem for autonomous agents.
3. **Working end-to-end.** Contracts deployed, bot running, dashboard live. Not a mockup.
4. **Mantle-native.** Built for Mantle's DeFi ecosystem (Agni, Merchant Moe, Lendle, FusionX, Minterest).

## Challenges

- **AI intent parsing:** DeepSeek occasionally misclassifies compound intents. Mitigated with structured system prompts and inline keyboard fallbacks.
- **Mantle RPC rate limiting:** Configured multiple backup RPC providers for reliable pool data queries.
- **Agent ownership model:** The vault contract creates and owns the agent identity, while a human vault owner authorizes strategy execution — clean separation of concerns.

## Team

Solo builder, powered by Claude Code.

## License

MIT
