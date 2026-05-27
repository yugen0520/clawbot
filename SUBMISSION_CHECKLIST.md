# ClawBot — 黑客松提交前检查清单

> 比赛期间仓库保持 **Private**，提交前再改为 Public。

## 提交前 24 小时检查清单

- [ ] **合约编译通过** — `cd contracts && npx hardhat compile`
- [ ] **全部测试通过** — `cd contracts && npx hardhat test`（当前 166 个）
- [ ] **无敏感信息残留** — 确认 `.env` 文件未被 Git 追踪
  ```bash
  git ls-files -- '*.env' '.env*'  # 应返回空
  ```
- [ ] **`.gitignore` 完整性** — 确认包含：`.env`、`.env.*`、`node_modules/`、`artifacts/`、`cache/`、`coverage/`、`*.log`
- [ ] **私钥安全** — `hardhat.config.ts` 使用 `process.env.PRIVATE_KEY`，无硬编码真实私钥
- [ ] **更新 `README.md`** — 补充：
  - 项目介绍与解决的问题
  - 架构图（4 层：Telegram → NLU → 链上身份 → 权限判决）
  - Mantle Sepolia 部署地址
  - 本地开发与部署说明
  - 技术栈：Solidity + Hardhat + DeepSeek API + Telegram Bot API
- [ ] **仓库改为 Public**
  - GitHub → Settings → Danger Zone → Change repository visibility → Public
- [ ] **GitHub Pages 可用**（如启用）— 访问 `https://yugen0520.github.io/clawbot/`

## 敏感信息排查命令

```bash
# 扫描所有被追踪文件中的密钥模式
git grep -n -E '(sk-[a-zA-Z0-9]{20,}|0x[0-9a-fA-F]{64})' -- ':!docs/' ':!node_modules/'

# 确认 .env 不在暂存区
git status | grep -i env

# 查看最近提交中是否有敏感信息
git log --all --full-history -- '*.env' '.env*'
```

## 比赛结束后可选操作

- [ ] 仓库恢复 Private（如比赛规则允许）
- [ ] 申请软件著作权
- [ ] 在 README 中添加开源许可证（MIT / GPL-3.0）
- [ ] 清理测试网部署的合约（如不再使用）
