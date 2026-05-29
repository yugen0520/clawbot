# SUBMISSION_CHECKLIST.md

# ClawBot — Hackathon Submission Checklist

> Repository stays **Private during development** and becomes **Public before final submission**.

This checklist ensures ClawBot is submission-ready for hackathon judging, open-source review, and technical due diligence.

---

# Final 24-Hour Checklist

## Code & Testing

* [ ] **Smart contracts compile successfully**

```bash
cd contracts
npx hardhat compile
```

* [ ] **All tests pass**

```bash
cd contracts
npx hardhat test
```

Expected result:

```text
79/79 tests passing
0 compilation warnings
```

* [ ] **Bot integration still works**

  * Telegram bot launches successfully
  * DeepSeek intent parsing responds correctly
  * Contract calls execute on Mantle Sepolia
  * Intent publication and challenge flow functional

---

## Security & Secrets

* [ ] **No sensitive files committed**

Verify `.env` files are NOT tracked:

```bash
git ls-files -- '*.env' '.env*'
```

Expected:

```text
(no output)
```

* [ ] **.gitignore covers sensitive files**

Ensure the following are ignored:

```text
.env
.env.*
node_modules/
artifacts/
cache/
coverage/
*.log
dist/
.next/
```

* [ ] **Private key safety**

Confirm:

* No hardcoded private keys
* `hardhat.config.ts` uses:

```ts
process.env.PRIVATE_KEY
```

* No API keys committed

---

# Repository Readiness

* [ ] **README positioning is correct**

The repository should clearly communicate:

> ClawBot is **AI Agent accountability infrastructure**, not an AI DeFi assistant.

README should clearly present:

* Problem statement
* Verifiable AI identity
* Reputation system
* Economic accountability
* Challenge & arbitration
* Deployed contracts
* Local setup instructions
* Architecture overview

---

## Architecture Consistency

Confirm terminology is consistent across all documents.

Preferred wording:

```text
AI Agent Accountability Infrastructure
On-chain Trust Infrastructure
Accountability Layer for AI Agents
```

Avoid outdated positioning:

```text
AI DeFi Butler
AI wallet assistant
Telegram trading bot
```

---

# Deployment Verification

* [ ] **Mantle Sepolia deployment verified**

Confirm deployed addresses are correct and clickable in explorer.

Required contracts:

* AgentIdentity

* AgentVault

* ReputationCalculator

* StrategyArbiter

* EconomicModel

* [ ] **Contract verification complete** (if supported)

---

# Documentation Consistency

* [ ] README updated
* [ ] CHANGELOG updated
* [ ] ECONOMIC_SECURITY.md updated
* [ ] DECENTRALIZATION_ROADMAP.md updated
* [ ] Deployment addresses accurate
* [ ] No contradictory narratives across files

Important:

> Every document should describe ClawBot as **trust infrastructure for autonomous AI agents**, not a DeFi helper.

---

# Demo Readiness

Since no video is included, repository clarity becomes critical.

Ensure judges can understand the product in under 2 minutes:

1. What problem exists?
2. Why existing solutions fail?
3. How ClawBot works?
4. Why blockchain is required?
5. Why this matters for AI agents?

Recommended walkthrough:

```text
User → Telegram command
→ DeepSeek reasoning
→ Agent identity verification
→ Intent publication
→ Challenge window
→ Strategy execution
→ Reputation update
```

---

# GitHub Readiness

* [ ] Repository visibility changed to **Public**
* [ ] README renders correctly on mobile
* [ ] No broken images
* [ ] No broken relative links
* [ ] No placeholder text
* [ ] No unfinished TODOs

---

# Sensitive Information Audit

Scan repository for secrets:

```bash
git grep -n -E '(sk-[a-zA-Z0-9]{20,}|0x[0-9a-fA-F]{64})' -- ':!docs/' ':!node_modules/'
```

Check `.env` history:

```bash
git log --all --full-history -- '*.env' '.env*'
```

Verify staged files:

```bash
git status
```

---

# Post-Hackathon (Optional)

* [ ] Mainnet deployment
* [ ] DAO governance integration
* [ ] zkTLS / verifiable inference
* [ ] Guardian decentralization
* [ ] Security audit
* [ ] Open-source community growth

---

## Final Goal

A judge should be able to understand the following in **under 30 seconds**:

> **ClawBot turns AI agents from anonymous wallet addresses into accountable digital entities with identity, reputation, and economic consequences.**
