# DECENTRALIZATION_ROADMAP.md

# ClawBot Decentralization Roadmap

> A gradual path from hackathon prototype → autonomous AI accountability protocol

ClawBot is intentionally designed with **progressive decentralization**.

Rather than pretending to be fully decentralized on day one, the protocol separates:

1. **What is already decentralized today**
2. **What remains partially trusted**
3. **How trust assumptions are systematically removed over time**

The long-term goal:

> **AI Agents should not depend on a single trusted operator to establish identity, reputation, or accountability.**

Instead, trust should emerge from:

* **Economic incentives**
* **Public verification**
* **Guardian oversight**
* **Open challenge mechanisms**
* **Community governance**

---

# Phase 0 — Hackathon Deployment (Current State)

The current implementation prioritizes **working infrastructure and security** while acknowledging remaining trust assumptions.

| Component            | Current Design                                                    | Centralization Risk |
| -------------------- | ----------------------------------------------------------------- | ------------------- |
| Agent Identity       | `AgentIdentity.sol` — self-registration + non-transferable NFT    | Low                 |
| Strategy Arbitration | `StrategyArbiter.sol` — Guardian staking + challenge window       | Medium              |
| Challenge Mechanism  | `ChallengeMechanism.sol` — open challenges + Guardian arbitration | Low                 |
| Guardian Management  | Local `guardianStakes` mappings across contracts                  | High                |
| Bot Management       | Local `botStakes` mappings without unified registry               | High                |
| Economic Parameters  | Governance-controlled fee allocation                              | High                |
| Protocol Governance  | `onlyGuardian` admin permissions                                  | High                |

### Key Limitation

Guardian and Bot identity, stake, and behavior tracking are currently fragmented across multiple contracts.

This creates:

* Limited composability
* Difficult migration paths
* Reduced interoperability
* Higher governance complexity

While functional for a hackathon environment, this architecture does not yet represent the final decentralized state.

---

# Phase 0 Deliverables (Already Implemented)

## GuardianRegistry.sol

A dedicated registry for Guardian identity and staking.

### Purpose

Move Guardian participation from isolated contract mappings into a reusable protocol layer.

### Core Features

```solidity
register() / deregister()
```

Self-registration with minimum stake requirement.

```solidity
stake() / unstake()
```

Stake management for participation and slashing eligibility.

```solidity
isGuardian()
```

Universal Guardian verification across protocol modules.

### Why It Matters

This transforms Guardians from:

> **contract-local participants → reusable protocol actors**

enabling:

* Shared reputation
* Cross-module permissions
* Unified slashing
* Future governance participation

---

## BotRegistry.sol

A dedicated registry for autonomous AI Agents and execution Bots.

### Purpose

Separate Bot trust assumptions from individual contract state.

Bots become persistent protocol entities with:

* Registration
* Staking
* Reputation
* Historical execution tracking
* Slashing eligibility

### Why It Matters

Instead of:

> **unknown execution addresses**

the protocol evolves toward:

> **accountable execution actors**

This enables future:

* Bot reputation markets
* Execution competition
* Delegated strategy execution
* Permissionless participation

---

# Phase 1 — Unified Reputation Layer

### Goal

Remove fragmented trust assumptions around Bot and Guardian credibility.

### Planned Changes

* Shared reputation scoring
* Cross-contract identity persistence
* Historical challenge tracking
* Stake-weighted trust

### Result

A Guardian or Bot builds reputation once and carries it across the ecosystem.

---

# Phase 2 — Governance Decentralization

### Goal

Replace protocol admin permissions with community governance.

### Planned Changes

Current:

```solidity
onlyGuardian
```

Future:

```solidity
DAO governance
```

Governance scope:

* Fee parameters
* Challenge thresholds
* Slashing ratios
* Reputation formulas
* Guardian requirements

### Result

No single maintainer controls protocol behavior.

---

# Phase 3 — Verifiable AI Execution

### Goal

Reduce trust in off-chain AI reasoning.

### Planned Integrations

* zkTLS
* Verifiable inference
* Commit-reveal execution proofs
* Model attestation

### Result

Users no longer trust:

> **what the Bot claims it decided**

They verify:

> **what the Bot provably computed**

---

# End State Vision

The end-state of ClawBot is not:

> an AI wallet assistant

It is:

> **trust infrastructure for autonomous AI systems**

Where every agent has:

* **Verifiable identity**
* **Persistent reputation**
* **Economic accountability**
* **Challengeable behavior**
* **Decentralized governance**

The goal is simple:

> **Turn autonomous AI from anonymous addresses into accountable digital entities.**
