# ClawBot — Mantle Sepolia 部署地址

> 部署时间: 2026-05-26T06:25 UTC
> 部署者: `0xE3D68E3674B58F55282C1bCc37f240dFf87918e4`
> 网络: Mantle Sepolia Testnet (Chain ID 5003)

## 已部署合约 (9/9)

| # | 合约 | 地址 | 用途 |
|---|------|------|------|
| 1 | AgentIdentity | `0x68E64D3f8c91984FD260ef7C6e405d52460a3bB9` | AI Agent 链上身份 NFT + 信誉 + 背书 |
| 2 | StrategyArbiter | `0x0Cec6cBC116CB2f5d6955187605d25684FEFF089` | 策略意图发布 + 挑战窗口 + 仲裁 |
| 3 | ChallengeMechanism | `0x58EF9F759f7Dbc601eBBfFFA02a15042d3Deb4ab` | Pandora's Box 多轮递增挑战博弈 |
| 4 | CommitmentVerifier | `0x053f4b4DD913745378293aC0d3205020021c5C99` | Commit-Reveal 验证器 (ZKP 轻量方案) |
| 5 | GuardianRegistry | `0xBC719a685c92c384d60bEaA3283EFD36933FaE8D` | 去中心化守护者身份与质押注册 |
| 6 | BotRegistry | `0xb73F770064f5939637AE3Ba9019F7f2728836897` | 去中心化 Bot 身份与质押注册 |
| 7 | ReputationCalculator | `0x8B6A3D352ceCF054A40E7E763B78d96A0023cEA3` | 去中心化信誉算法 (APY + 时效 + 衰减) |
| 8 | AgentVault | `0xc6178059f510930550e76D7A76E7BF9BFd5daB3d` | AI 管理收益金库 (身份门控 + 意图执行) |
| 9 | EconomicModel | `0xff05175d3E4cB49CD5B7a3b345C5D418b5fBB134` | 协议收费 + 分配 (国库/守护者/Agent) |

## 合约依赖关系

```
AgentIdentity  ←── ReputationCalculator
              ←── AgentVault

StrategyArbiter ←── AgentVault (setArbiter)

GuardianRegistry ←── EconomicModel (setGuardianRegistry)
BotRegistry      ←── EconomicModel (setBotRegistry)

ChallengeMechanism — 独立 (通过 intentId 关联 StrategyArbiter)
CommitmentVerifier — 独立 (ZKP 接口)
```

## 验证交易 (链上交互测试)

| 操作 | TX Hash |
|------|---------|
| Agent 注册 | `0xbee380338038151e9f1baccfbe94d2fea118d25c785bc53f92dd3498cf93fdc8` |
| Vault 存款 | `0xb9fedfe878ef2da73b97fcf050dd14ad1fa4838d163d500df18b9558e76a9e1a` |
| 策略添加 | `0xba501b4b61a9b4c1043ff558e5dc6a45906d58b9a2eb37710701030c655fb124` |
| Bot 质押 | `0x9220c12e4c8348025a2d6d3c06e1a6afefc4dc8a5d328c01aecd4d73f8cd50ad` |
| 意图发布 | `0xf820a201d368ac6339456a7d4b850557f38e3a10f55c2906477cc2bd4cefae74` |
| 守护者注册 | `0xae5780bb8ef8ecc32f7be3c3da257dbbfacbe7a4258da1d60940363691334e0d` |
| Bot 注册 | `0x7a1f7e19f812bde697bc429b4cef42a9d8d3424471a23e18ad2d73dd278188b5` |
| Agent 背书 | `0x386c745b84fa246eaa9f343cf102c55d32fd88161049527f8ea9d39d6c63ec4c` |

## .env 更新

```
AGENT_IDENTITY_ADDRESS=0x68E64D3f8c91984FD260ef7C6e405d52460a3bB9
AGENT_VAULT_ADDRESS=0xc6178059f510930550e76D7A76E7BF9BFd5daB3d
REPUTATION_CALCULATOR_ADDRESS=0x8B6A3D352ceCF054A40E7E763B78d96A0023cEA3
STRATEGY_ARBITER_ADDRESS=0x0Cec6cBC116CB2f5d6955187605d25684FEFF089
CHALLENGE_MECHANISM_ADDRESS=0x58EF9F759f7Dbc601eBBfFFA02a15042d3Deb4ab
ZKP_VERIFIER_ADDRESS=0x053f4b4DD913745378293aC0d3205020021c5C99
GUARDIAN_REGISTRY_ADDRESS=0xBC719a685c92c384d60bEaA3283EFD36933FaE8D
BOT_REGISTRY_ADDRESS=0xb73F770064f5939637AE3Ba9019F7f2728836897
ECONOMIC_MODEL_ADDRESS=0xff05175d3E4cB49CD5B7a3b345C5D418b5fBB134
```
