# ECONOMY.md

# ClawBot Protocol Incentive Model

> Economic incentives for accountable AI agents on-chain

ClawBot is designed around a simple principle:

> **trust should have economic consequences**

The protocol introduces incentives and penalties so autonomous AI agents are rewarded for reliable behavior and penalized for malicious or low-quality execution.

Rather than relying on trusted operators, ClawBot aims to align incentives across all participants.

---

# Participants

| Participant       | Role                                                  | Incentive                               |
| ----------------- | ----------------------------------------------------- | --------------------------------------- |
| **Users**         | Delegate capital or interact with AI agents           | Better automation with accountability   |
| **AI Agents**     | Autonomous agents with verifiable identity            | Reputation growth and economic rewards  |
| **Bot Operators** | Maintain infrastructure and execute strategies        | Service fees and reputation             |
| **Guardians**     | Monitor, challenge, and arbitrate suspicious activity | Staking rewards and slashing incentives |
| **Protocol**      | Core accountability infrastructure                    | Sustainable ecosystem growth            |

---

# Incentive Design

The protocol introduces **economic accountability** at every critical layer.

## 1. Identity Layer

AI agents receive:

* Verifiable on-chain identity
* Reputation score
* Historical execution records

Reliable behavior improves credibility.

Poor performance or malicious behavior reduces reputation.

This creates:

> **Reputation at Stake**

---

## 2. Execution Layer

Before execution:

1. Strategy intent is published
2. Challenge window begins
3. Guardians may challenge suspicious actions
4. Execution only proceeds if no successful challenge exists

This creates:

> **Economic Accountability**

Malicious strategies become economically risky.

---

## 3. Guardian Layer

Guardians stake capital to participate.

They are incentivized to:

* Identify malicious strategies
* Prevent harmful execution
* Maintain ecosystem trust

Dishonest or malicious participation may lead to:

> **slashing or loss of rewards**

---

# Fee Structure

Current hackathon implementation includes lightweight protocol fees.

| Fee Type         | Purpose                                | Default      |
| ---------------- | -------------------------------------- | ------------ |
| Registration Fee | Prevent identity spam                  | 0.001 MNT    |
| Service Fee      | Bot execution and protocol maintenance | Configurable |
| Challenge Stake  | Prevent challenge spam                 | Dynamic      |

These parameters are governance-adjustable.

The objective is:

> **cheap enough for honest participation, expensive enough for abuse**

---

# Value Flow

```text
User
   ↓
AI Agent Request
   ↓
Strategy Publication
   ↓
Guardian Review
   ↓
Execution
   ↓
Reputation Update
   ↓
Economic Reward / Penalty
```

The system creates a feedback loop:

```text
Good behavior
→ higher reputation
→ more trust
→ more usage

Bad behavior
→ lower reputation
→ challenges
→ slashing risk
→ reduced trust
```

---

# Why Economics Matter

Without economic incentives:

* malicious bots are cheap to create
* fake reputation is easy to farm
* challenge systems become spammed
* accountability collapses

ClawBot introduces:

### Verifiable Identity

Who performed the action?

### Reputation at Stake

What history does this agent have?

### Economic Accountability

What happens if the agent behaves maliciously?

---

# Governance Roadmap

The current version uses native **MNT**.

Future protocol iterations may introduce:

* Stake-weighted governance
* Adjustable protocol parameters
* Guardian reputation systems
* Dynamic fee markets
* Decentralized arbitration upgrades

This is intentionally left lightweight during hackathon stage.

The current focus is:

> **proving accountable AI infrastructure works before optimizing token economics**
