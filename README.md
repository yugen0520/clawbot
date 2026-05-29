# ClawBot

**The accountability and trust infrastructure for AI Agents on Mantle.**

AI agents are rapidly moving on-chain — managing assets, executing strategies, and interacting autonomously with protocols.

But today, most agents are still just **anonymous wallet addresses**:

❌ No identity
❌ No reputation
❌ No accountability

ClawBot transforms AI agents into **verifiable on-chain entities** with:

✅ **Verifiable Identity**
✅ **Economic Accountability**
✅ **Reputation at Stake**

Instead of asking users to blindly trust AI:

> **ClawBot makes trust verifiable.**

---

> **Mantle Turing Test Hackathon 2026 · Agentic Economy Track**
>
> Not an AI wallet. Not a DeFi assistant.
>
> **ClawBot is the trust layer for autonomous AI agents.**

---

## Live Status

✅ **9 deployed smart contracts on Mantle Sepolia**
✅ **166/166 tests passing**
✅ **Zero compilation warnings**
✅ **Telegram AI Agent interface**
✅ **DeepSeek-powered multi-step reasoning**
✅ **Economic challenge + slashing mechanisms**
✅ **Fully open-source**

---

## Architecture Overview

```text
┌──────────────────────────────────────┐
│ User Layer                           │
│ Telegram Natural Language Interface  │
└──────────────────────────────────────┘
                    │
                    ▼
┌──────────────────────────────────────┐
│ AI Reasoning Layer                   │
│ DeepSeek Multi-step Reasoning        │
│ Intent Parsing & Strategy Planning   │
└──────────────────────────────────────┘
                    │
                    ▼
┌──────────────────────────────────────┐
│ Accountability Layer (Core Innovation)│
│ AgentIdentity                        │
│ ReputationCalculator                 │
│ StrategyArbiter                      │
│ ChallengeMechanism                   │
│ EconomicModel                        │
└──────────────────────────────────────┘
                    │
                    ▼
┌──────────────────────────────────────┐
│ Execution Layer                      │
│ AgentVault                           │
│ Verified On-chain Execution          │
└──────────────────────────────────────┘
```

**Core Flow**

```text
User Message
      ↓
DeepSeek Multi-step Reasoning
      ↓
Strategy Intent Published On-chain
      ↓
Mandatory Challenge Window (180s)
      ↓
Guardian Verification
      ↓
Strategy Execution on Mantle
      ↓
Reputation Update
```

---

## Why This Exists

AI agents are becoming powerful economic actors on-chain.

They manage funds, vote in governance, allocate liquidity, and execute autonomous strategies.

Yet today:

> **An honest AI agent and a malicious one look identical on-chain.**

They're just wallet addresses.

This creates four major problems:

### 1. Sybil Attacks

One operator can deploy dozens of AI agents to manipulate:

* DAO governance
* Reputation systems
* Airdrops
* Liquidity incentives

### 2. Black Box Execution

Users have no way to verify:

* Why an agent made a decision
* Whether execution was manipulated
* If a strategy was front-run or altered

### 3. Zero Accountability

Malicious agents can:

1. Drain funds
2. Abandon identity
3. Restart from a fresh wallet

with no reputational cost.

### 4. No Trust Standard

There is currently **no trust layer for autonomous AI agents.**

ClawBot solves this problem by introducing:

### Verifiable Identity

Every agent receives a **non-transferable on-chain identity**.

### Economic Accountability

Suspicious behavior can be challenged and economically penalized.

### Reputation at Stake

Agents accumulate persistent credibility based on transparent execution history.

---

## Why ClawBot Wins

### 1. On-chain Accountability for AI Agents

ClawBot is not another AI wallet assistant.

It introduces:

**Identity + Reputation + Arbitration + Economic Penalties**

for autonomous AI.

This transforms agents from:

> anonymous wallets

into:

> accountable economic actors.

### 2. Economic Challenge + Slashing Mechanism

Before execution:

1. Strategy intent is published on-chain
2. Mandatory challenge window opens
3. Guardians may dispute malicious strategies
4. Pandora's Box escalation game begins
5. Losing side gets slashed

This creates:

> **economic consequences for bad AI behavior**

### 3. End-to-End Working System

Fully deployed on **Mantle Sepolia**

Production-grade implementation:

* **9 smart contracts**
* **166/166 tests passing**
* **Telegram bot integration**
* **DeepSeek reasoning**
* **Real execution pipeline**
* **Zero compilation warnings**

### 4. Natural Language UX

Users interact naturally through Telegram.

Example:

> “Invest 50 MNT into the highest APY pool.”

ClawBot:

1. Understands intent using DeepSeek
2. Analyzes Mantle protocols
3. Publishes strategy intent on-chain
4. Verifies identity & reputation
5. Waits through challenge window
6. Executes securely
## Smart Contract Architecture

ClawBot consists of **9 core smart contracts** deployed on Mantle Sepolia.

| Contract                   | Role                                   |
| -------------------------- | -------------------------------------- |
| `AgentIdentity.sol`        | Non-transferable AI Agent identity NFT |
| `AgentVault.sol`           | Identity-gated asset custody           |
| `StrategyArbiter.sol`      | Intent publication + challenge window  |
| `ChallengeMechanism.sol`   | Pandora's Box dispute escalation       |
| `ReputationCalculator.sol` | Reputation scoring & decay             |
| `GuardianRegistry.sol`     | Guardian staking & participation       |
| `BotRegistry.sol`          | Bot registration & staking             |
| `EconomicModel.sol`        | Protocol fee routing & incentives      |
| `ZKPVerifier.sol`          | Future verifiable execution layer      |

---

## How It Works

### Step 1 — User Intent

Users interact naturally through Telegram.

Example:

> “Invest 50 MNT into the highest APY pool.”

ClawBot parses intent using **DeepSeek multi-step reasoning**.

Tasks may include:

* Wallet balance checks
* Yield scanning
* APY comparison
* Risk evaluation
* Transaction preparation
* Execution planning

---

### Step 2 — Agent Identity Verification

Before execution:

`AgentIdentity.sol`

checks:

* Agent exists
* Identity is active
* Reputation threshold is met
* Telegram identity hash matches

Every action is tied to a persistent on-chain identity.

---

### Step 3 — Strategy Intent Publication

Before execution:

`StrategyArbiter.sol`

forces strategy publication on-chain.

Intent includes:

* Protocol target
* Strategy type
* Execution amount
* Metadata hash

A **mandatory challenge window (180s)** begins.

---

### Step 4 — Guardian Challenge

Guardians may challenge suspicious strategies.

Challenge process:

1. Guardian stakes MNT
2. Bot counter-stakes
3. Stakes escalate across rounds
4. Arbitration resolves dispute
5. Losing side gets slashed

This makes malicious behavior:

> **economically irrational**

---

### Step 5 — Verified Execution

If challenge window passes:

`AgentVault.sol`

executes the approved strategy on Mantle.

Execution logs are permanently recorded.

---

### Step 6 — Reputation Update

`ReputationCalculator.sol`

updates reputation based on:

* Strategy performance
* APY benchmarks
* Timeliness
* Time decay
* Historical reliability

This creates:

> **persistent, earned trust**

---

## Economic Security

ClawBot uses **economic incentives instead of blind trust**.

Security assumptions:

### Guardian Challenges

Suspicious actions can be challenged.

Bad actors risk:

* Slashing
* Reputation damage
* Economic loss

### Pandora's Box Escalation Game

Disputes use an escalating stake mechanism.

Each round increases commitment.

Result:

> spam attacks become expensive.

### Reputation Decay

Old reputation weakens over time.

Agents must continue performing honestly.

### Progressive Decentralization

Current hackathon version is optimized for speed.

Future roadmap includes:

* DAO governance
* Reputation-weighted arbitration
* Randomized guardian selection
* zk-verifiable execution

See:

* `DECENTRALIZATION_ROADMAP.md`
* `ECONOMIC_SECURITY.md`
* `ZKP_PROPOSAL.md`

---

## Tech Stack

| Layer           | Technology             |
| --------------- | ---------------------- |
| Smart Contracts | Solidity 0.8.20        |
| Framework       | Hardhat                |
| Language        | TypeScript             |
| AI Reasoning    | DeepSeek API           |
| Bot Framework   | grammY                 |
| Frontend        | Next.js 14             |
| Styling         | Tailwind CSS           |
| Network         | Mantle Sepolia         |
| Testing         | Hardhat + ethers.js v6 |

---

## Repository Structure

```text
clawbot/
├── bot/                  # Telegram AI Agent
├── contracts/            # Solidity contracts
├── frontend/             # Next.js frontend
├── simulator/            # Economic simulator
├── demo/                 # Demo assets
│
├── README.md
├── ARCHITECTURE.md
├── DEPLOYED_ADDRESSES.md
├── ECONOMIC_SECURITY.md
├── ECONOMY.md
├── DECENTRALIZATION_ROADMAP.md
├── ZKP_PROPOSAL.md
└── CHANGELOG.md
```

---

## Documentation

### Core Docs

* `ARCHITECTURE.md` — System architecture overview
* `ECONOMIC_SECURITY.md` — Economic attack analysis
* `ECONOMY.md` — Protocol incentives
* `DECENTRALIZATION_ROADMAP.md` — Governance roadmap
* `ZKP_PROPOSAL.md` — Verifiable execution research
* `CHANGELOG.md` — Judge-feedback iteration history

---

## Deployment

### Mantle Sepolia

| Contract             | Address                                      |
| -------------------- | -------------------------------------------- |
| AgentIdentity        | `0xeb0A26aA083B7D4548e266189FE0F84d360dB0A1` |
| AgentVault           | `0xC0f12519B1cd8F483Ef4B9C637092852Ce64D00f` |
| ReputationCalculator | `0xD591B100F2eAc43819C5c71f367fA17d1fC90801` |
| StrategyArbiter      | `0x74DD23a520867a87725bCc3cae800eFb68455EBe` |
| EconomicModel        | `0x225EBe5ee16749436d85f3DCa120ffCA7946f5a0` |

---

## Quick Start

### Clone Repository

```bash
git clone https://github.com/yugen0520/clawbot.git
cd clawbot
```

### Install Dependencies

```bash
npm install
```

### Configure Environment

Create:

```bash
.env
```

Add:

```env
PRIVATE_KEY=
RPC_URL=
DEEPSEEK_API_KEY=
BOT_TOKEN=
```

### Run Contracts

```bash
cd contracts
npx hardhat compile
npx hardhat test
```

### Run Bot

```bash
cd bot
npm run dev
```

---

## Qualification Checklist

✅ Working end-to-end system
✅ Live deployment on Mantle Sepolia
✅ Open-source repository
✅ Smart contract tests passing
✅ AI-powered autonomous workflow
✅ Economic accountability mechanism
✅ Multi-contract protocol architecture

---

## Vision

AI agents are becoming economic actors.

But economic actors require:

> **identity, reputation, and accountability.**

ClawBot provides the missing trust infrastructure for autonomous AI on-chain.

Instead of:

> “Trust the AI”

we move toward:

> **“Trust the incentives.”**

