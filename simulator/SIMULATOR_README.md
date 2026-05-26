# ClawBot Economic Simulator

Hackathon demo tool — stress-test the ClawBot economic model against Sybil attacks, market downturns, and extreme protocol usage.

## Quick Start

```bash
cd simulator/
npx serve .        # or just open index.html in a browser
```

Deployed at: `https://yugen0520.github.io/clawbot/simulator/`

## What It Models

| Parameter | Range | Default |
|-----------|-------|---------|
| Challenge Stake | 100-10,000 CLAW | 1,000 |
| Gas Price | 1-100 Gwei | 10 |
| Sybil Attackers | 1-100 | 10 |
| Bot Success Rate | 50-100% | 80% |
| Daily Strategies | 10-1,000 | 200 |

## Calculations

- **Protocol Fee Revenue** = daily strategies x avg fee (20 CLAW) x CLAW price ($0.50)
- **Guardian Rewards** = 30% of protocol fees
- **Bot Net Profit** = gross profit - failed strategy costs - gas costs
- **Malicious Challenger Loss** = Sybils x challenges/day x net stake P&L
- **Annual Surplus** = (fee revenue - payouts) x 365

## Preset Scenarios

1. **Normal Operation** — healthy ecosystem, 80% success rate, 200 strategies/day
2. **Sybil Attack** — 80 malicious challengers flood the protocol; shows whether economic defenses hold
3. **Bear Market** — bot success drops to 50%, volume dries up; stress-tests sustainability

## Tech

Single HTML file, no build step. Uses Chart.js from CDN. Dark theme matching ClawBot brand (`#00d4aa` accent on `#0a0e14` background).
