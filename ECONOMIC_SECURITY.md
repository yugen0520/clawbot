# ECONOMIC_SECURITY.md

# ClawBot Economic Security Analysis

> Economic threat model and security assumptions for `ChallengeMechanism.sol`

This document analyzes how ClawBot's **Pandora's Box challenge mechanism** increases the economic cost of malicious behavior.

Rather than assuming trusted actors, the protocol is designed around a simple principle:

> **If attacking the system becomes economically irrational, honest behavior becomes the dominant strategy.**

Current reference configuration:

| Parameter                  | Value          |
| -------------------------- | -------------- |
| Initial Stake              | 0.1 MNT        |
| Escalation Rate            | 150% per round |
| Max Rounds                 | 5              |
| Round Timeout              | 300s (testnet) |
| Minimum Guardian Consensus | 3              |

---

# Design Goal

ClawBot does not attempt to eliminate all malicious behavior.

Instead, it aims to:

1. **Increase the cost of attacks**
2. **Reduce incentives for manipulation**
3. **Reward honest participation**
4. **Make abuse economically expensive**

The protocol assumes rational actors operating under economic constraints.

---

# Threat Model

The following attack vectors are considered in the current protocol design:

1. **Sybil challenge spam**
2. **Guardian bribery**
3. **Bot collusion**
4. **Timeout exploitation**
5. **Economic griefing**

Each scenario is analyzed below.

---

# 1. Sybil Challenge Attack

## Attack Goal

Flood a legitimate Bot with many simultaneous challenges to force response failures.

## Attack Flow

An attacker:

1. Creates multiple wallets
2. Opens many parallel challenges
3. Forces the Bot to counter-stake repeatedly
4. Attempts to exploit timeout windows

## Economic Cost

### First-Round Cost

| Number of Challenges | Attacker Cost |
| -------------------- | ------------- |
| 10                   | 1 MNT         |
| 100                  | 10 MNT        |
| 1000                 | 100 MNT       |

### Full Escalation Cost

Assuming all rounds escalate:

| Number of Challenges | Approximate Cost |
| -------------------- | ---------------- |
| 10                   | 13.19 MNT        |
| 50                   | 65.94 MNT        |
| 100                  | 131.88 MNT       |

Escalating stake requirements significantly increase capital requirements for large-scale spam.

## Security Observation

Because challenge cost compounds each round:

> **large-scale challenge spam becomes increasingly expensive**

This does not make Sybil attacks impossible.

However, it raises attack cost enough to discourage low-cost abuse.

---

# 2. Guardian Bribery Attack

## Attack Goal

Manipulate arbitration outcomes through bribing Guardians.

## Attack Flow

An attacker:

1. Triggers arbitration
2. Attempts to influence Guardian votes
3. Seeks favorable outcomes

## Current Constraints

Guardians must:

* Register
* Stake capital
* Risk future rewards
* Maintain reputation

Minimum consensus:

```text
3 Guardians
```

At minimum, attackers must influence a majority.

## Security Observation

Bribery becomes less attractive when:

* Guardian stake increases
* Reputation becomes valuable
* Slashing penalties exist
* Guardian selection expands

Current design raises bribery cost, but does not fully eliminate collusion risk.

## Future Hardening

Planned improvements include:

* Higher Guardian stake requirements
* Reputation-weighted voting
* Random Guardian selection
* Slashing for dishonest arbitration
* Anonymous voting mechanisms

---

# 3. Bot Collusion Attack

## Attack Goal

A malicious Bot attempts to bypass scrutiny using fake challenges or coordinated actors.

## Example Scenario

A Bot:

1. Publishes a harmful strategy
2. Coordinates with a fake challenger
3. Simulates legitimacy
4. Attempts to avoid real scrutiny

## Economic Observation

In the current mechanism:

* Fake challengers still lock capital
* Failed escalation loses stake
* Timeout rules punish inactive actors

This significantly reduces the incentive for low-cost collusion.

## Security Observation

The protocol does not assume Bots are honest.

Instead:

> **dishonest behavior should become increasingly expensive**

The system is designed so malicious actors risk losing more than they gain.

---

# 4. Timeout Exploitation

## Attack Goal

Prevent a Bot from responding before timeout expires.

Possible methods:

* Network congestion
* Gas price manipulation
* Delayed inclusion attacks

## Current Risk

The current timeout setting:

```text
300 seconds
```

is intentionally optimized for testnet iteration speed.

This would likely be too short for production environments.

## Future Hardening

Mainnet deployment is expected to use:

```text
1–6 hour timeout windows
```

Additional mitigations:

* Priority gas strategies
* MEV-resistant transaction routing
* Better timeout dispute verification

---

# Parameter Rationale

## Initial Stake = 0.1 MNT

Chosen to balance:

| Goal             | Rationale                              |
| ---------------- | -------------------------------------- |
| Accessibility    | Legitimate users can challenge cheaply |
| Spam resistance  | Large-scale abuse becomes expensive    |
| Sybil resistance | Mass challenge attacks require capital |

The objective:

> **cheap enough for honest use, expensive enough for abuse**

---

## Escalation Rate = 150%

Stake increases by:

| Round | Stake (MNT) | Cumulative |
| ----- | ----------- | ---------- |
| 1     | 0.1000      | 0.1000     |
| 2     | 0.1500      | 0.2500     |
| 3     | 0.2250      | 0.4750     |
| 4     | 0.3375      | 0.8125     |
| 5     | 0.5063      | 1.3188     |

### Why 150%?

Lower rates:

> insufficient deterrence

Higher rates:

> discourage legitimate challengers

150% was selected as a practical middle ground.

---

## Max Rounds = 5

Designed to balance:

* Economic pressure
* Capital efficiency
* User experience
* Transaction overhead

Too few rounds:

> weak dispute depth

Too many rounds:

> excessive capital lock-up

---

## Minimum Guardian Consensus = 3

A minimum threshold prevents:

* Single-actor arbitration
* Immediate manipulation
* Centralized resolution

Future protocol versions may support:

* Dynamic consensus thresholds
* Stake-weighted voting
* Reputation-aware arbitration

---

# Known Limitations

ClawBot does not claim perfect economic security.

Current limitations include:

| Risk                    | Current Status | Future Direction         |
| ----------------------- | -------------- | ------------------------ |
| Guardian centralization | Partial        | Open participation       |
| Short timeout           | Testnet only   | Longer production window |
| Low Guardian stake      | Conservative   | Higher stake requirement |
| Limited slashing        | Partial        | Expanded penalties       |
| Off-chain collusion     | Possible       | Randomized arbitration   |

These tradeoffs are intentional for a hackathon-stage deployment.

---

# Security Assumption

ClawBot's challenge system assumes:

> **malicious actors behave rationally under economic constraints**

Under this assumption, the protocol is designed to make abuse:

> **progressively more expensive than honest participation**

The objective is not absolute prevention.

The objective is:

> **economic accountability for autonomous AI systems**
