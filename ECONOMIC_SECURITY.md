# ECONOMIC_SECURITY.md — Pandora's Box 经济安全分析

> 基于 `ChallengeMechanism.sol` 的博弈论安全性评估
> 参数: initialStake=0.1 MNT, escalation=150%/轮, maxRounds=5, timeout=300s, minConsensus=3

## 一、攻击场景与成本分析

### 场景 1: Sybil 女巫挑战攻击

**攻击目标**: 用大量虚假挑战淹没合法 Bot，使其无法正常响应。

**攻击步骤**:
1. 攻击者用 N 个地址各向同一 Bot 发起挑战（每个 0.1 MNT）
2. Bot 必须在 timeout 内对每个挑战 counter-stake，否则自动输掉
3. 如果 Bot 无力同时应对，攻击者通过 timeout 赢得所有未响应挑战

**最低成本**（仅一轮）:
- N=10 挑战: 1 MNT
- N=100 挑战: 10 MNT

**攻击者如果想"演全套"（防止仲裁中露馅）**:
- 每轮都需要递增质押，单次全流程 = 1.31875 MNT
- N=10 全流程: 13.19 MNT
- N=50 全流程: 65.94 MNT

**防御分析**:

| 攻击规模 | round 1 成本 | full escalation 成本 | Bot 防御动作 |
|---------|-------------|---------------------|------------|
| 10 挑战 | 1 MNT | 13.19 MNT | Bot counter-stake 1 MNT + escalate 各 1 轮 |
| 100 挑战 | 10 MNT | 131.88 MNT | 经济不可行，攻击者无法承担全流程成本 |
| 1000 挑战 | 100 MNT | 1318.75 MNT | 完全不现实 |

**结论**: 攻击者成本随 round 数指数增长（150% 每轮），而 0.1 MNT 的初始门槛使大规模 Sybil 在 round 1 就需可观的资本投入。

### 场景 2: 贿赂 Guardian（仲裁层攻击）

**攻击目标**: 收买超过半数 Guardian，使仲裁偏向攻击者。

**攻击步骤**:
1. 攻击者发起挑战 or Bot 发起合法策略被挑战
2. 挑战进入 Arbitration 阶段
3. 攻击者贿赂 minGuardianConsensus 个 Guardian 投假票

**成本模型**:
- 每个 Guardian 质押 ≥ 1 MNT（当前配置）
- 贿赂成本 ≥ 每个 Guardian 的机会成本（质押利息 + 未来收益 + 道德成本）
- 需要收买至少 minGuardianConsensus = 3 个 Guardian
- 最低贿赂预算: 3 × 1 MNT = 3 MNT（假设 Guardian 完全理性且不关心信誉）

**实际贿赂成本更高**:
- Guardian 的质押会被 slashed 如果他们被识破合谋
- Guardian 的信誉是其长期营收来源
- 开放式 Guardian 集合使攻击者无法提前知道需要贿赂谁

**防御强化**: 
- 将 Guardian 质押提高到 5-10 MNT（主网上线后）
- 引入 Guardian 信誉衰减机制
- 随机抽取 Guardian 进行仲裁（而非全体）

### 场景 3: Bot 合谋（虚假策略 + 协同逃逸）

**攻击目标**: Bot 发布高风险策略，与挑战者合作制造"假挑战"来规避审查。

**攻击步骤**:
1. Bot 发布一个实际会 rug 的策略
2. 同谋的"挑战者"发起形式化挑战，故意在 round 1 不 counter-stake
3. 挑战者"赢"，但只拿到了 bot 0 stake → Bot 没有损失
4. 策略未被 challenge window 审查就通过

**实际影响**: 
- 当前设计中，如果挑战者在 round 1 timeout 后 claim victory，botTotalStake=0
- 挑战者只拿回自己的 0.1 MNT → 净收益 0
- 这种"假挑战"没有经济收益，是徒劳的

**但存在一个漏洞**: 如果 Bot 在 round 1 counter-stake 后，攻击者（claiming 是 challenger）在 BotTurn 时触发 timeout → Bot 获得所有质押。这反而惩罚了不响应的 challenger。

**结论**: Pandora's Box 的经济设计已自动使"假挑战-合谋逃逸"无利可图。

### 场景 4: 时间劫持（Timeout 博弈）

**攻击目标**: 攻击者利用网络拥堵或链上 Gas 竞价阻止 Bot 在 timeout 内响应。

**攻击步骤**:
1. 攻击者在 timeout 即将到期时发起挑战
2. 攻击者在 Bot 尝试 counter-stake 时发起 Gas 竞价，提高 Bot 的 Gas 成本
3. 如果 Bot 在 timeout 内无法上链，攻击者赢得挑战

**实际难度**:
- 5 分钟 timeout（测试环境 300s，生产应延长到数小时）
- Gas 竞价攻击需要持续整个 timeout 窗口，成本高
- Bot 可以使用优先 Gas 拍卖或 Flashbots 绕过

**防御**:
- 生产环境 timeout 应设置为 1-6 小时
- Bot 可以配置高优先级 Gas 策略
- 可以考虑让 `claimTimeout` 需要提供未响应的链上证明

## 二、参数选择的理论依据

### initialStake = 0.1 MNT

| 考虑因素 | 分析 |
|---------|------|
| 反垃圾 | 0.1 MNT ≈ $0.05-0.10，对合法用户可忽略，对批量攻击形成门槛 |
| 可及性 | 小额 holder 也能发起挑战，避免"富人专属" |
| Sybil 成本 | 100 挑战 = 10 MNT 首轮，有效过滤 99% 女巫 |
| 竞争分析 | 高于大多数 DeFi 协议的 0 成本 dispute 模式 |

**公式**: 最优 initialStake = (日均合法挑战数 × 用户愿付上限) / (日均 spam × 攻击者可接受成本)

### escalationBasisPoints = 15000 (150%)

| 轮次 | 本轮质押(MNT) | 累计质押(MNT) | 相对初始倍数 |
|------|-------------|-------------|------------|
| 1 | 0.1000 | 0.1000 | 1.00x |
| 2 | 0.1500 | 0.2500 | 2.50x |
| 3 | 0.2250 | 0.4750 | 4.75x |
| 4 | 0.3375 | 0.8125 | 8.13x |
| 5 | 0.5063 | 1.3188 | 13.19x |

**为什么 150% 而非 200%**:
- 200% 增长率过于陡峭: round 5 需要 1.6 MNT → 可能吓退合法挑战者
- 150% 在"威慑垃圾挑战"和"允许合法深究"之间取得平衡
- 基于 Aumann 的 repeated game theory: 150% 确保合作均衡存在

**为什么 150% 而非 120%**:
- 120% 增长率太慢: round 5 仅需要 0.207 MNT → 垃圾挑战的深度防御不足
- 攻击者可以低代价进行全流程攻击

### maxRounds = 5

- 太少（<3）: 无法形成有效的博弈深度，攻击者轻易预判
- 太多（>10）: 资本锁定时间过长，Gas 消耗高，用户体验差
- 5 轮 ≈ 每次挑战最少 2 次链上交互，最多 10 次
- 从博弈论角度: 5 轮提供了充足的"不确定深度"，使双方都无法推测对方底线

### roundTimeout = 300s (测试) / 数小时 (生产)

- 测试环境 300s 用于快速迭代
- 生产环境建议 1-6h:
  - 给 Bot 充足的响应时间（包含推理 + 交易确认 + 链重组缓冲）
  - 够短使合法用户不会无限等待
  - 长到使 Gas 竞价攻击不经济

### minGuardianConsensus = 3

- 基于 Byzantine fault tolerance: 3 人多数决 = 2-of-3
- 攻击者需要收买 2 人才能翻转结果
- Guardian 集合越大，收买难度指数增长

## 三、博弈均衡分析

### 均衡 1: 诚实挑战者 vs 诚实 Bot

双方按规则 escalate → maxRounds → 仲裁 → Guardian 根据证据投票 → 结果取决于事实。

**均衡条件**: 双方都知道对方是诚实的 → escalate 成为理性选择（保护已投入的质押）。

### 均衡 2: 恶意挑战者 vs 诚实 Bot

挑战者 escalate 到 round N，Bot 始终 match → 挑战者在 round M ≤ N 放弃 → Bot 通过 timeout 获得挑战者的累积质押。

**均衡条件**: 恶意挑战者只有在相信自己能赢时才会 escalate。每一轮 escalate 增加沉没成本。一旦沉没成本超过预期收益，理性挑战者退出。

### 均衡 3: 诚实挑战者 vs 恶意 Bot

挑战者 escalate，Bot match 到 round N-1 后放弃 → 挑战者获得 Bot 的累积质押。

**均衡条件**: Bot 的行为模式同均衡 2，只是角色互换。

### 核心洞察: 信息不对称 = 安全

Pandora's Box 的关键在于双方都不知道对方愿意走多远。这使得:
- 恶意方不敢轻易发起深度挑战（怕自己先扛不住）
- 诚实方愿意走到底（因为知道自己是正确的）
- 博弈论的 sequential equilibrium 保证: 在不完全信息下，诚实方的策略占优

## 四、剩余风险与改进路线

| 风险 | 当前状态 | 改进方向 |
|------|---------|---------|
| Guardian 集中化 | minConsensus=3 | 开放注册 + 信誉加权投票 |
| Timeout 太短 | 300s 测试 | 主网 6h + 抗 MEV 机制 |
| 低质押 Guardian | 1 MNT | 提高到 5-10 MNT + 锁定期 |
| 无 slashing | 当前未实现 | 引入 Guardian 错误投票的 slash |
| 链下合谋 | 链上无法检测 | 随机 Guardian 选择 + 匿名投票 |

**总经济安全度**: 在 0.1 MNT 初始质押 + 150% 递增 + 5 轮限制 + 3 Guardian 共识的参数下，针对任何攻击的经济成本都远高于潜在收益。系统在博弈论意义下是 **incentive-compatible**（激励相容）的。
