# ZKP_PROPOSAL.md — AI 策略执行的零知识证明路线

> 三种技术路线对比：zkTLS、zkVM、轻量级承诺方案
> 评估维度：工程可行性、Gas 成本、安全性、当前就绪度

## 背景问题

ClawBot 的核心安全假设是：Bot 声称执行的策略（"我把 20 MNT 存入了 Agni 获得 12% APY"）和实际链上行为一致。当前靠 Guardian 事后审计 + ChallengeMechanism 博弈来保证。但随着 Bot 数量增长，Guardian 审计成为瓶颈。

ZKP 的目标：用密码学证明替代人工审计，把"信任 Guardian"变成"验证数学证明"。

## 三条技术路线

### 路线 1: zkTLS（TLS 会话证明）

**原理**: 用 TLS 会话记录证明 AI 模型确实在特定时间产生了特定输出。借助 TLS 的 server-signature 机制，prover 可以向 verifier 证明某个 HTTPS 响应来自特定服务器。

**代表项目**: TLSNotary (ethereum/tlsnotary), Reclaim Protocol, zkPass

**技术流程**:
```
Bot → DeepSeek API: "推荐最佳策略"
Bot ← DeepSeek API: { strategy: "Agni USDC", apy: 12.0%, amount: 20 MNT }
Bot → TLSNotary Prover: 生成 TLS 会话证明
Bot → ZKPVerifier.verifyProof(proof, publicInputs)
```

**优势**:
- 不需要修改 AI 服务端
- 可以对任意 HTTPS API 生成证明
- TLSNotary 已有可用的 Rust/Python 库

**劣势**:
- 证明生成需要与 prover 交互（多轮通信）
- 证明 size 较大（~100KB-1MB）
- 链上验证 Gas 成本高（Groth16 验证 ~230k gas）
- AI 响应可能是概率性的（temperature > 0），同一输入不一定产生同一输出
- DeepSeek API 的 TLS 证书可能轮换

**当前就绪度**: 4/10。TLSNotary 浏览器插件可用，但链上验证器尚未部署到 Mantle。

### 路线 2: zkVM（零知识虚拟机）

**原理**: 把 AI 推理过程编译到 zkVM 中执行，生成执行正确性的 succinct proof。证明包含"给定这个模型权重和输入，输出就是这个"。

**代表项目**: RISC Zero (risc0), Succinct SP1, Axiom

**技术流程**:
```
Bot 在 zkVM 内运行 AI 推理 → 生成 execution proof
Bot → ZKPVerifier.verifyProof(proof, publicInputs)
```

**优势**:
- 最强的安全性保证（数学证明，不依赖信任假设）
- Succinct proof（Groth16/Plonk 验证，~230k gas）
- 可证明完整的 AI 推理 pipeline

**劣势**:
- AI 推理极慢（在 zkVM 中运行神经网络比原生慢 10^6 倍）
- 大模型（7B+ 参数）根本无法在 zkVM 中运行
- 需要量化/剪枝模型到极小（~1M 参数），精度损失大
- RISC Zero/SP1 还不支持 GPU 加速的矩阵运算原语
- 从 zkVM 输出到链上 action 仍有 gap（证明说输出是 X，但实际执行的是 Y）

**当前就绪度**: 2/10。仅 proof-of-concept 阶段，只能处理简单 ML 模型（决策树、小型 NN）。

### 路线 3: 轻量级承诺方案（Commit-Reveal + 博弈验证）

**原理**: Bot 在执行前提交 `commitment = keccak256(agentId, strategyId, amount, apyBps, salt)`。执行后 reveal 参数，任何人可以验证 hash 匹配。不匹配则通过 ChallengeMechanism 惩罚。

**代表项目**: 本项目的 `CommitmentVerifier` + `StrategyArbiter.submitStrategyWithCommitment()`

**技术流程**:
```
Before:  Bot → submitStrategyWithCommitment(intent, commitment)
Execute: Vault → executeStrategyWithIntent(intentId, ...)
After:   Bot → revealCommitment(intentId, salt)
         Anyone → verifyCommitment(commitment, agentId, strategyId, amount, apyBps, salt)
```

**优势**:
- 零 Gas 开销（只是 keccak256 hash 比较，~30 gas）
- 现在就能部署，已通过编译和 12 个测试
- 与现有 ChallengeMechanism 完美互补
- Bot 伪造承诺的成本由经济博弈覆盖

**劣势**:
- 不是真正的 ZKP — 依赖挑战博弈而非密码学保证
- 不能证明 AI 模型的实际输出，只能证明 Bot 前后一致
- 存在 bot 从一开始就提交假承诺的可能（需配合 ChallengeMechanism 惩罚）

**当前就绪度**: 9/10。已实现并测试通过。

## 综合对比

| 维度 | zkTLS | zkVM | 轻量级承诺 |
|------|-------|------|-----------|
| 安全性 | 中高（信任 TLS） | 最高（数学证明） | 中（经济博弈） |
| Gas 成本 | ~230k gas | ~230k gas | ~30 gas + keccak |
| 证明生成时间 | 数秒 | 数小时-不可行 | 毫秒 |
| AI 模型限制 | 无 | 大幅限制（~1M params） | 无 |
| 服务端改动 | 无需 | 无需 | 无需 |
| 链上改动 | 新增 Groth16 verifier | 新增 Groth16 verifier | 已实现 |
| 维护成本 | 中（TLS 证书跟踪） | 低（zkVM 升级） | 极低 |
| **总体就绪度** | 4/10 | 2/10 | **9/10** |

## 推荐路线

**短期（当前 Hackathon）**: 轻量级承诺方案 — 已实现。

**中期（主网上线后 3-6 月）**: zkTLS 集成。TLSNotary 团队预计 2026 Q3 发布 Solidity verifier，届时可以部署到 Mantle。优先场景：
- 验证 Bot 确实调用了 DeepSeek/其他 LLM API
- 验证 AI 输出与链上策略参数一致
- 配合轻量级承诺构成双重验证

**长期（2027+）**: zkVM 成熟后，可以针对小型专用模型（非大语言模型，而是 DeFi 策略模型）生成完整执行证明。当 zkVM 支持 GPU 原语且 AI 推理速度达到实用水平时，直接证明"模型推理 → 策略输出"闭环。

## 当前实现说明

`CommitmentVerifier` 的 `verifyProof()` 已预留 ZK proof 接口。当 zkTLS 或 zkVM verifier 可用时，可以通过以下步骤升级：

1. 部署新的 verifier contract（如 `Groth16Verifier`）
2. 调用 `StrategyArbiter.setZKPVerifier(newVerifierAddress)`
3. Bot 在 `revealCommitment()` 时传入对应的 proof bytes

现有合约无需修改，完全向后兼容。
