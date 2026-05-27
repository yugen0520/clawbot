# DECENTRALIZATION_ROADMAP.md — ClawBot 去中心化路线图

> GuardianRegistry + BotRegistry 驱动的渐进式去中心化方案

## 当前状态（Phase 0 — Hackathon）

| 组件 | 当前模式 | 集中化风险 |
|------|---------|-----------|
| Agent 身份 | `AgentIdentity.sol` — 自注册，不可转让 NFT | 低 |
| 策略仲裁 | `StrategyArbiter` — Guardian 自质押，单一 Guardian 可裁决 | 中 |
| 挑战机制 | `ChallengeMechanism` — 开放挑战，Guardian 多签仲裁 | 低 |
| Guardian 管理 | 合约内 `guardianStakes` mapping，无独立注册表 | 高 |
| Bot 管理 | 合约内 `botStakes` mapping，无追踪/信誉 | 高 |
| 费用分配 | `EconomicModel` — governance 单点控制分配 | 高 |
| 参数治理 | 各合约 `onlyGuardian` 修饰符，无 DAO | 高 |

关键集中化风险：Guardian 和 Bot 的质押、行为、信誉分散在多个合约的 mapping 中，难以迁移和互操作。

## 已实现组件（Phase 0 交付）

### GuardianRegistry.sol

独立的 Guardian 身份和质押注册表：

```
register() / deregister()      — 自注册，质押 ≥ minStake
addStake() / withdrawStake()   — 质押管理
slash(guardian, amount, reason) — 惩罚恶意 Guardian
recordParticipation() / recordVote() — 行为追踪
addRewards() / claimRewards()  — 费用分配
getAllGuardians()              — 全量查询
```

### BotRegistry.sol

独立的 Bot 身份和质押注册表：

```
register(agentId) / deregister() — 自注册，关联 AgentIdentity
addStake() / withdrawStake()    — 质押管理
slash(bot, amount, reason)      — 惩罚恶意 Bot
recordStrategyPublished/Executed — 策略追踪
recordChallengeSurvived          — 挑战结果记录
getTopBots(n)                    — 按交易量排名
addRewards() / claimRewards()    — 激励分配
```

### EconomicModel 集成

- `setGuardianRegistry(address)` — 关联 GuardianRegistry
- `setBotRegistry(address)` — 关联 BotRegistry
- `distributeGuardianRewards()` — 通过注册表向 Guardian 分配奖励
- `allocateAgentIncentivesFromRegistry()` — 向 Top N Bot 分配激励

## 去中心化路线

### Phase 1: 主网上线（1-2 月）

**目标**: 注册表驱动现有功能，消除合约内散落 mapping。

- [ ] 将 `StrategyArbiter.challengeIntent()` 的门禁从 `guardianStakes[msg.sender]` 迁移到 `guardianRegistry.isGuardian(msg.sender)`
- [ ] 将 `ChallengeMechanism.voteOnArbitration()` 的 `onlyGuardian` 门禁迁移到 GuardianRegistry
- [ ] 将 `StrategyArbiter.publishIntent()` 的 bot 门禁迁移到 BotRegistry
- [ ] 实现 `slash()` 的调用者授权（只允许 StrategyArbiter、ChallengeMechanism 调用）
- [ ] Guardian 奖励从固定均分改为按质押量 + 参与度加权分配

### Phase 2: Guardian 网络去中心化（3-6 月）

**目标**: Guardian 从"信任角色"升级为"密码经济安全角色"。

- [ ] **Guardian 信誉系统**: 基于投票准确率 + 参与度计算 on-chain reputation
- [ ] **随机 Guardian 选择**: 从 GuardianRegistry 中随机抽取仲裁小组成员（Chainlink VRF）
- [ ] **Guardian 轮换**: 每个 epoch 自动轮换活跃 Guardian 集合，防长尾合谋
- [ ] **匿名投票**: 提交→reveal 两阶段投票，防止 Guardian 间串通
- [ ] **经济激励对齐**: Guardian 收益 = 基础质押利息 + 挑战成功分成 - 错误投票惩罚
- [ ] **跨链 Guardian**: 通过 LayerZero/Wormhole 支持其他链的 Guardian 参与 Mantle 仲裁

### Phase 3: Bot 网络去中心化（6-12 月）

**目标**: Bot 从"需要信任的 AI"升级为"可验证的经济节点"。

- [ ] **Bot 信誉市场**: BotRegistry 中的执行数据驱动链上信誉分
- [ ] **自动激励分配**: 每个 epoch 自动向 Top 10% Bot 分配 agent 激励池
- [ ] **Bot 发现协议**: 用户通过 BotRegistry 发现和比较 Bot（按 APY、风控、信誉）
- [ ] **MEV 保护**: Bot 执行策略时使用 Flashbots/SUAVE 防抢跑
- [ ] **Bot 保险池**: Bot 质押的一部分进入共享保险池，赔付受害用户
- [ ] **zkTLS 验证**: 集成 ZKPVerifier，Bot 必须证明其 AI 推理的真实性

### Phase 4: 治理去中心化（12+ 月）

**目标**: 从"开发团队治理"过渡到"DAO + 协议政治"。

- [ ] **治理代币**: Guardian 和 Bot 根据贡献获得不可转让的投票权
- [ ] **参数提案**: Guardian 可通过 GuardianRegistry 发起参数修改提案
- [ ] **时间锁**: 所有参数修改经过 48h 时间锁，Guardian 可否决
- [ ] **协议费分配**: DAO 投票决定 treasuryShare / guardianShare / agentIncentiveShare
- [ ] **协议升级**: 通过 DAO 投票 + 时间锁触发合约升级（UUPS proxy 模式）

## 攻击面与防御

| 攻击 | Phase 0 防御 | Phase 2-4 防御 |
|------|-------------|---------------|
| Guardian Sybil | minStake 门槛 | 信誉 + 随机选择 + 轮换 |
| Bot Sybil | minStake 门槛 | 执行历史证明 + zkTLS |
| Guardian 合谋 | 多签仲裁 | 匿名投票 + 随机抽取 |
| Bot 虚假执行 | ChallengeMechanism | zkVM 执行证明 |
| 费用劫持 | onlyGovernance | DAO 投票 + 时间锁 |
| 注册表投毒 | 经济门槛 | 信誉门槛 + 白名单期 |

## 监控指标

上线后需持续监控的链上指标：

1. **Guardian 集中度**: Top 3 Guardian 质押占总质押的比例（目标 < 50%）
2. **Bot 多样性**: 活跃 Bot 的 Agent 身份多样化程度
3. **挑战胜率分布**: 不同 Guardian/Bot 的挑战获胜率是否均衡
4. **费用分配效率**: guardianShare 和 agentIncentiveShare 的实际领取率
5. **slash 事件频率**: 恶意行为的发生频率和金额

---

> 当前完成度：Phase 0 — 合约已部署，注册表已实现，152 测试通过。Phase 1 可在主网上线前完成。
