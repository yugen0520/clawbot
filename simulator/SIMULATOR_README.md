# ClawBot Protocol Stress Simulator

Hackathon demo tool — stress-test ClawBot’s accountability and economic security model under adversarial conditions.

Instead of assuming honest behavior, this simulator explores a harder question:

> **Can autonomous AI agents remain economically accountable under attack?**

The simulator models Guardian incentives, challenge escalation, Bot profitability, and Sybil resistance across different protocol conditions.

---

## Quick Start

```bash
cd simulator/
npx serve .
```

Or simply open:

```text
simulator/index.html
```

Live Demo:

https://yugen0520.github.io/clawbot/simulator/

---

## Why This Exists

ClawBot introduces:

- **On-chain AI identity**
- **Economic accountability**
- **Challenge-and-slashing mechanisms**
- **Guardian-based dispute resolution**

But accountability systems only work if they remain secure under pressure.

This simulator allows hackathon judges and contributors to stress-test protocol assumptions under:

- adversarial behavior
- market downturns
- spam challenges
- reduced Bot performance
- abnormal protocol load

The goal is not token speculation.

The goal is:

> **testing whether the protocol remains incentive-compatible under attack.**

---

## What It Stress-Tests

| Parameter | Range | Default |
|-----------|-------|---------|
| Challenge Stake | 0.01–10 MNT | 0.1 MNT |
| Gas Price | 1–100 Gwei | 10 |
| Malicious Challengers | 1–100 | 10 |
| Bot Success Rate | 50–100% | 80% |
| Daily Strategies | 10–1,000 | 200 |
| Guardian Count | 1–50 | 10 |
| Challenge Escalation | 120%–200% | 150% |

These parameters simulate how protocol incentives behave under different operating conditions.

---

## Security Metrics

The simulator evaluates five core dimensions of protocol resilience.

### 1. Guardian Incentive Coverage

Measures whether Guardian rewards remain sufficient to incentivize active monitoring and dispute participation.

**Question answered:**

> Do honest Guardians still have economic motivation to protect the protocol?

---

### 2. Sybil Attack Cost

Estimates the capital required to overwhelm the protocol through mass malicious challenges.

**Question answered:**

> How expensive does large-scale challenge spam become?

This is especially important for evaluating resistance against:

- DAO manipulation
- challenge flooding
- malicious coordination

---

### 3. Bot Economic Viability

Models whether honest Bots remain profitable after:

- gas costs
- failed strategies
- slashing penalties
- challenge participation

**Question answered:**

> Can honest AI agents sustainably operate long-term?

---

### 4. Protocol Sustainability

Evaluates whether protocol revenue can continue supporting:

- Guardian rewards
- dispute resolution incentives
- long-term ecosystem maintenance

**Question answered:**

> Does the accountability system remain economically stable?

---

### 5. Pandora’s Box Escalation Dynamics

Simulates ClawBot’s escalating challenge mechanism.

Each dispute increases economic commitment between challenger and Bot.

Example:

| Round | Required Stake |
|--------|----------------|
| 1 | 0.10 MNT |
| 2 | 0.15 MNT |
| 3 | 0.225 MNT |
| 4 | 0.3375 MNT |
| 5 | 0.50625 MNT |

This tests whether irrational spam attacks become economically unviable.

**Question answered:**

> Is attacking the protocol more expensive than behaving honestly?

---

## Preset Scenarios

### 1. Healthy Network

Simulates normal ecosystem conditions.

Configuration:

- 80% Bot success rate
- moderate challenge frequency
- healthy Guardian participation
- 200 strategies/day

Goal:

> Validate stable long-term operation.

---

### 2. Mass Challenge Attack

Simulates coordinated challenge spam by malicious actors.

Configuration:

- high malicious challenger count
- elevated gas pressure
- excessive dispute attempts

Goal:

> Measure Sybil resistance and anti-spam economics.

---

### 3. Bear Market Stress

Simulates weak protocol conditions.

Configuration:

- lower strategy profitability
- reduced protocol activity
- lower Bot success rates

Goal:

> Test protocol survivability during downturns.

---

### 4. Guardian Failure Scenario

Simulates weak monitoring participation.

Configuration:

- reduced Guardian count
- low challenge participation
- increased malicious Bot activity

Goal:

> Evaluate decentralization assumptions and minimum safety thresholds.

---

## Design Philosophy

ClawBot intentionally prioritizes:

> **economic accountability over blind trust**

The simulator reflects the protocol’s core assumption:

```text
honest behavior
must be cheaper
than malicious behavior
```

If attacking becomes economically irrational, accountability becomes sustainable.

---

## Tech

- Single HTML file
- No build step required
- Chart.js via CDN
- Dark UI matching ClawBot branding

Theme:

- Accent: `#00d4aa`
- Background: `#0a0e14`

Designed for hackathon judges to quickly explore:

> **how ClawBot behaves under real adversarial conditions.**
