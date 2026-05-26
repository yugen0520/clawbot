# CHANGELOG — 评委反馈迭代 (2026-05-26)

## 反馈来源

Mantle Turing Test Hackathon 2026 评委评分：82/100（强烈推荐获奖）

## TOP 3 改进及对应变更

### 1. 信誉分计算去中心化（反馈：执行端过于中心化，信誉分更新完全依赖单一 Bot 裁决）

**新增合约**：`ReputationCalculator.sol`
- 信誉算法从 Bot 主观判定 → 链上合约基于客观数据自动计算
- 计算因子：策略 APY vs 基准线、执行及时性、时间衰减权重、违约自动扣分
- Bot 角色从"唯一评判者"降级为"数据提交者"
- 引入质押机制：Bot 需质押 MNT 才能提交数据
- 引入挑战机制：守护者可挑战错误数据，多数投票通过后罚没 Bot 质押

**修改合约**：`AgentIdentity.sol`
- 新增 `authorizedReputationUpdaters` 映射 + `onlyAuthorizedUpdater` 修饰器
- 新增 `setAuthorizedUpdater()` 和 `updateReputationByUpdater()` 函数
- 外部合约（如 ReputationCalculator）经授权后可更新信誉

**新增测试**：`ReputationCalculator.test.ts` — 20 个测试用例
- 质押/提款、策略结果提交、APY/及时性/衰减/违约计算、挑战投票、罚没、授权更新

### 2. 链上策略验证与争议仲裁（反馈：DeepSeek 策略是黑盒，用户资金安全完全依赖 Bot 诚实执行）

**新增合约**：`StrategyArbiter.sol`
- 策略意图公示：Bot 必须在执行前将策略步骤（JSON）提交上链
- 挑战窗口机制：公示后启动可配置窗口（默认 180s），期间守护者可挑战
- 守护节点网络：社区成员质押 MNT 成为守护者，监控策略合理性
- 挑战成功 → 罚没 Bot 质押 + 阻止执行；挑战失败 → 解锁执行
- 代码中标注了 zkTLS / 可验证推理的扩展点

**修改合约**：`AgentVault.sol`
- 新增 `setArbiter()` 和 `executeStrategyWithIntent()` 函数
- 集成 StrategyArbiter：执行前检查意图是否通过挑战窗口
- 原有 `executeStrategy()` 保持不变，向后兼容

**新增测试**：`StrategyArbiter.test.ts` — 14 个测试用例
- 意图发布、挑战窗口、守护者挑战、罚没/解锁、完整执行流程、向后兼容

### 3. 协议经济模型设计（反馈：缺少清晰的协议经济模型）

**新增合约**：`EconomicModel.sol`
- 接口 `IEconomicModel` + 实现合约
- 三种费用：注册费（一次性）、查询费（按次）、撮合费（按比例）
- 费用分配：国库 50% / 守护者 30% / Agent 激励 20%，治理可调整
- 守护者奖励领取、Agent 激励分配、参数治理接口

**新增文档**：`ECONOMY.md`
- 参与方定义、价值流转图、费用结构、代币预留、防博弈机制

**新增测试**：`EconomicModel.test.ts` — 11 个测试用例
- 三种费用收取、费用分配、比率更新、参数治理、监护人/AI 奖励领取

---

## 文件变更清单

| 文件 | 变更类型 | 说明 |
|------|---------|------|
| `contracts/contracts/AgentIdentity.sol` | 修改 | +authorizedReputationUpdaters 映射、修饰器、函数 |
| `contracts/contracts/AgentVault.sol` | 修改 | +StrategyArbiter 集成、executeStrategyWithIntent |
| `contracts/contracts/ReputationCalculator.sol` | 新增 | 去中心化信誉算法 + 质押 + 挑战 + 衰减 |
| `contracts/contracts/StrategyArbiter.sol` | 新增 | 策略意图公示 + 挑战窗口 + 守护者网络 |
| `contracts/contracts/EconomicModel.sol` | 新增 | 费用结构 + 分配逻辑 + 治理接口 |
| `contracts/test/ReputationCalculator.test.ts` | 新增 | 20 个测试用例 |
| `contracts/test/StrategyArbiter.test.ts` | 新增 | 14 个测试用例 |
| `contracts/test/EconomicModel.test.ts` | 新增 | 11 个测试用例 |
| `ECONOMY.md` | 新增 | 经济模型文档 |
| `CHANGELOG.md` | 新增 | 本文件 |

## 测试结果

- 原有测试：32/32 通过（零回归）
- 新增测试：47/47 通过
- 总计：79/79 通过

---

## Bot 端集成 (2026-05-26)

### contract.ts

- 新增 ReputationCalculator、StrategyArbiter、EconomicModel 三份 ABI
- `initContracts()` 扩展为接收 5 个合约地址（向后兼容，新地址可选）
- 新增 20+ 函数：`publishIntent`、`challengeIntent`、`canExecute`、`getIntent`、`stakeAsBot`、`stakeAsSubmitter`、`submitStrategyResult`、`getEffectiveReputation`、`getFeeParams`、`getPendingPools` 等
- 从交易 receipt 解析事件获取 intentId / resultId

### ai-nlu.ts

- `ParsedIntent` 新增字段 `intentId`
- 新增 4 个 action：`publish_intent`、`challenge_intent`、`check_reputation`、`stake`
- COMBINED_SYSTEM prompt 更新：映射新意图、提及策略公示和挑战窗口

### index.ts

- 新增 6 个命令：`/publish`、`/challenge`、`/reputation`、`/stake`、`/guardians`、`/resolve_challenge`
- 新增 2 个 callback：`reputation_check`、`protocol_fees`
- `/start` 键盘新增 Reputation 和 Protocol Fees 按钮
- 新增 4 个 NLU intent handler：`publish_intent`、`challenge_intent`、`check_reputation`、`stake`

### 部署

- Mantle Sepolia 部署全部 5 个合约
- AgentIdentity: `0xeb0A26aA083B7D4548e266189FE0F84d360dB0A1`
- AgentVault: `0xC0f12519B1cd8F483Ef4B9C637092852Ce64D00f`
- ReputationCalculator: `0xD591B100F2eAc43819C5c71f367fA17d1fC90801`
- StrategyArbiter: `0x74DD23a520867a87725bCc3cae800eFb68455EBe`
- EconomicModel: `0x225EBe5ee16749436d85f3DCa120ffCA7946f5a0`
- ReputationCalculator 已授权为 AgentIdentity 的 updater
- StrategyArbiter 已链接到 AgentVault
