# ClawBot Architecture

> High-level system architecture of ClawBot — the accountability infrastructure for AI Agents on Mantle.

## System Overview

ClawBot transforms AI agents from anonymous wallet addresses into accountable on-chain entities through four layers:

```text
User (Telegram)
        │
        ▼
Bot Layer (DeepSeek NLU)
        │
        ▼
Identity Layer (AgentIdentity)
        │
        ▼
Execution & Arbitration Layer
(Vault + Arbiter + Challenge)
        │
        ▼
Verification Layer
(Reputation + Economic Security)
```

---

## Layer 1 — Bot Interaction Layer

**Purpose:** Natural language → executable intent.

Users interact with ClawBot through Telegram.

Example:

> “Invest 50 MNT into the highest APY strategy”

The bot:

1. Parses intent using DeepSeek
2. Scans supported protocols
3. Generates an execution plan
4. Publishes strategy intent on-chain
5. Waits for challenge window
6. Executes if approved

**Key Components**

* Telegram Bot API
* grammY
* DeepSeek API
* Multi-step reasoning pipeline

---

## Layer 2 — Identity Layer

**Contract:** `AgentIdentity.sol`

Every AI Agent receives a **non-transferable on-chain identity NFT**.

The identity stores:

* Agent ID
* Creation timestamp
* Telegram ID hash
* Model version
* Reputation score
* Endorsements
* Action history

This creates a **persistent identity** instead of disposable wallet addresses.

---

## Layer 3 — Execution & Arbitration Layer

### `AgentVault.sol`

Secure custody layer for agent-controlled assets.

### `StrategyArbiter.sol`

Before execution, every strategy must be:

1. Published on-chain
2. Enter a challenge window (default: 180s)
3. Open to guardian review

### `ChallengeMechanism.sol`

Uses a **Pandora's Box escalating stake game**:

* Challengers stake MNT
* Bot counter-stakes
* Stakes escalate across rounds
* Guardian consensus resolves disputes

This makes malicious behavior economically irrational.

---

## Layer 4 — Verification Layer

### `ReputationCalculator.sol`

Reputation is computed using:

* APY performance
* Execution timeliness
* Time decay
* Historical behavior

### `EconomicModel.sol`

Protocol incentives:

* Registration fees
* Query fees
* Matching fees

Rewards distributed to:

* Guardians
* High reputation agents
* Protocol treasury

---

## Smart Contract Overview

| Contract             | Role                      |
| -------------------- | ------------------------- |
| AgentIdentity        | Verifiable agent identity |
| AgentVault           | Asset custody             |
| StrategyArbiter      | Intent publication        |
| ChallengeMechanism   | Dispute game              |
| ReputationCalculator | Reputation scoring        |
| GuardianRegistry     | Guardian participation    |
| BotRegistry          | Bot staking               |
| EconomicModel        | Incentive design          |

---

## Design Goal

ClawBot answers one core question:

> **Which AI agents can be trusted on-chain — and what happens if they break that trust?**
