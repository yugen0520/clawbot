# ClawBot Demo 视频脚本

> 125s | English narration (GLM-5V-Turbo + edge-tts) | Left: Telegram Bot / Right: Mantle Block Explorer

---

## 前置准备（录视频前完成，不占 demo 时间）

打开 Telegram ClawBot，依次发送：

```
/stake bot 0.1
/stake guardian_a 1
```

确认两笔交易都确认。这给 bot 质押了发布意图和挑战所需的保证金。

---

## 操作步骤

| 步骤 | 你在 Telegram 做什么 | 会发生什么 | 右边浏览器 |
|------|---------------------|-----------|-----------|
| 1 | 输入 `/start` | Bot 显示主菜单按钮 | — |
| 2 | 点 **Best Strategy / 最佳策略** 按钮 | AI 推荐当前最高收益池 | — |
| 3 | 打字：`Help me deposit 5 MNT into the highest yield pool` | DeepSeek 长链推理：查余额→查 APY→排序→推荐策略，返回 Execute 按钮 | — |
| 4 | 点 **Execute** 按钮 | 链上执行存款 + 策略 | 浏览器刷新，确认 TX 上链 |
| 5 | `/publish AGNI_USDC 5 850 '[{"action":"deposit","protocol":"Agni","amount":"5 MNT"}]'` | 策略意图上链公示，进入 180s 挑战窗口。**记下 bot 回复的 Intent ID** | IntentPublished 事件出现在 MantleScan |
| 6 | `/challenge 刚才记下的ID "Suspicious APY claim"` （例：`/challenge 2 "Suspicious APY claim"`，**不要加尖括号**）| 守护者发起挑战，质押 0.001 MNT | ChallengeOpened 事件 |
| 7 | `/resolve_challenge 同上ID false` （例：`/resolve_challenge 2 false`）| 挑战被驳回（bot 策略合法），bot 获胜 | ChallengeResolved 事件 |
| 8 | 打字：`rate agent 1 five stars great performance` | NLU 解析为 rate_agent → 链上背书 Agent #1，信誉 +100 | AgentEndorsed 事件 |
| 9 | `/agents` | 列出所有已注册 Agent 及信誉、背书数 | — |
| 10 | `/reputation` | 查看当前 Agent 信誉评分、操作历史 | — |

**重点**：第 5-7 步必须在 3 分钟内完成（挑战窗口 180 秒）。第 5 步 publish 后 bot 会告诉你 intent ID，**不要写死数字**，用 bot 回复里的 ID 填到第 6、7 步。

---

## 自然语言彩蛋（步骤 3 的替代方案）

不用按钮，直接打字聊天。以下都能触发 NLU 意图解析：

```
"Which pool on Mantle has the highest yield right now?"
"Show me my portfolio"
"Recommend a low-risk strategy"
"rate agent 1 four stars solid execution"
"show me all registered agents"
"what's agent 0's reputation"
"I want to stake 1 MNT as a guardian"
"Help me deposit 5 MNT into the best yield pool"
```

---

## 中文旁白稿

> 录完画面再单独录音，不用同期录。

**0:00-0:15** — 问题

> 链上 AI Agent 越来越多，但没有任何机制能验证一个地址背后是人还是 AI。DeFi 治理里，一个人可以开一百个 Agent 刷票。空投被批量领走。你们根本不知道自己在跟谁打交道。

**0:15-0:35** — 身份层

> ClawBot 解决了这件事。每个 AI Agent 有一个不可转让的链上身份 NFT。Telegram 账号、AI 模型、链上行为，全部绑定。你在 Telegram 里说话，合约验证你 Agent 的身份，通过之后才能执行操作。

**0:35-1:00** — 推理 + 执行

> 用户用自然语言说"帮我把钱存到收益最高的地方"，DeepSeek 做多步推理：查余额、查各池子 APY、排序、授权、执行。每一步都有链上记录，每一步都要身份校验。

**1:00-1:25** — 挑战窗口

> 但策略不能直接执行。它必须先上链公示，进入一个 180 秒的强制挑战窗口。任何人都可以质疑。挑战者质押 0.001 MNT，bot 必须应战。如果策略有问题，bot 保证金被罚没，挑战者得奖励。没问题，挑战费没收。

**1:25-1:45** — 多 Agent 协作

> 这不是单 Agent 系统。Agent 之间可以互相背书、打分，信誉动态更新。APY 表现好的加分，承诺了做不到的扣分。九份可审计合约，九个模块各司其职。

**1:45-2:00** — 收尾

> ClawBot——链上 AI 的信任基础设施。身份可验证，策略可挑战，Agent 可互评。在 Mantle Sepolia 上运行，面向未来百万 AI Agent 同时在线。

---

## 录屏设置

- 左边 Telegram ClawBot（占画面 55%）
- 右边 Mantle Sepolia 区块浏览器（占画面 45%）
- 分辨率 1920×1080，30fps
- 旁白用 Audacity 单独录制后混入

---

## 备用方案

| 出问题 | 怎么处理 |
|--------|---------|
| 交易 pending 太久 | 切到之前已确认的 TX 页面，看不出区别 |
| Bot 不响应 | 展示 `npx hardhat test` 全通过的截图 |
| publish 后 Markdown 炸了 | 已经修了 mdEscape，不会再炸。万一遇到，截图 bot.log 里的 `[PUBLISH] intentId=X` 那一行 |
| challenge 报 Already challenged | 你发了两次 /challenge，第一次已经成功，直接进步骤 7 |
| resolve 报 Not a guardian | 回到前置准备，补 `/stake guardian_a 1` |
| challenge 报 Challenge window closed | publish 之后超过 3 分钟了，重新 publish |
| 代理断了 | 重启 sing-box：看 proxy-config.json 里的命令 |
| 不想做 challenge 流程 | 跳过 5-7，走 1→2→3→4→8→9→10 |

---

## 关键合约地址

```
AgentIdentity         0xCB37…0104
StrategyArbiter       0x4DB9…C23a
ChallengeMechanism    0xf977…4686
AgentVault            0xdb6a…73e0
ReputationCalculator  0xa78E…ed60
```
