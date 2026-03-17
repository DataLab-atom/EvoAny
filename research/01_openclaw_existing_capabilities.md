# OpenClaw 现有能力清单

> 调研日期：2026-03-17
> 聚焦：OpenClaw 当前**已有**的、**可用**的能力

---

## 一、内置工具（无需安装，开箱即用）

### 1. `browser` — 真实浏览器自动化
- 底层：CDP 控制 Chromium 实例（非无头 HTTP 客户端）
- **已有能力：**
  - 导航 URL、点击元素、填写表单、执行 JavaScript
  - 截图并发给视觉模型解析
  - 提取文本和结构化数据
  - 管理 Session 和 Cookie
  - 处理现代 SPA 页面（React/Vue 等）
  - 语义元素引用（@ref），支持 browser-automation-skill 扩展的 OPEN→SNAPSHOT→INTERACT→VERIFY 工作流

### 2. `exec` — Shell 命令执行
- **已有能力：**
  - 直接调用系统命令（等价于用户在终端输入）
  - 内置沙箱代码执行环境（Python + JavaScript）
  - 安装 Python 包（pip）
  - 运行数据分析脚本
  - 调用外部 API（通过代码）
  - 批准机制：`exec.approvals` 控制是否需要用户确认

### 3. `read` / `write` — 文件系统
- **已有能力：**
  - 读写本地任意文件
  - 语义理解文件内容（不仅是关键词搜索，能理解代码逻辑）
  - 示例：找出"所有未处理异常的函数"（分析代码结构，而非字符串匹配）

### 4. `memory` — 持久化跨会话记忆
- **已有能力：**
  - 会话内记忆（完整上下文）
  - 跨会话持久记忆（存储在 `MEMORY.md`）
  - AI 人格/指令文件（`SOUL.md`）
  - 语义记忆搜索（Embedding API + 向量相似度）
  - 最新版：ContextEngine 插件接口——记忆策略"即插即拔"，无需修改核心代码

### 5. `canvas` — 可视化画布
- **已有能力：**
  - 绘制折线图、饼图
  - 标注关键拐点
  - 输出架构图、流程图
  - 将数据分析结果可视化（非纯文字）

### 6. `web_search` — 网页搜索
- **已有能力：**
  - Brave Search API（免费额度 2,000 次/月）
  - Gemini Google Search
  - Grok（xAI）
  - Kimi（Moonshot）
  - Brave LLMContext（v3.8+，AI 原生格式返回搜索结果）

### 7. `web_fetch` — 网页内容抓取
- 获取并解析网页正文（Markdown 格式）

### 8. `cron` — 定时调度
- 心跳调度器：无需用户触发，按间隔主动执行任务
- 24/7 运行，定时触发任意工作流

### 9. `webhooks` — 外部事件接收
- 监听 HTTP 事件，触发 agent 执行

### 10. `lobster` — 多步工作流引擎
- 定义多步骤流程
- `llm_task`：在工作流中插入 LLM 处理步骤

### 11. `sessions_*` — 多 Agent 会话管理
- `sessions_spawn`：生成子 Agent 会话
- `sessions_send`：Agent 间消息传递
- `sessions_list` / `sessions_history`：查看会话
- 支持多任务并发（互不干扰）

---

## 二、消息渠道（24 个已支持）

| 平台 | 状态 |
|------|------|
| WhatsApp | ✅ 生产可用（Baileys 适配器） |
| Telegram | ✅ 生产可用（grammY 适配器） |
| Slack | ✅ |
| Discord | ✅ |
| Signal | ✅ |
| iMessage / BlueBubbles | ✅ macOS |
| Google Chat | ✅ |
| Microsoft Teams | ✅ |
| Matrix | ✅ |
| IRC | ✅ |
| Feishu（飞书） | ✅ |
| LINE | ✅ |
| Mattermost | ✅ |
| Nextcloud Talk | ✅ |
| Nostr | ✅ |
| Synology Chat | ✅ |
| Tlon | ✅ |
| Twitch | ✅ |
| Zalo / Zalo Personal | ✅ |
| WebChat（浏览器 UI） | ✅ 内置 |
| WeCom（企业微信） | ✅ 社区 PR #13228 已合并 |
| DingTalk | ✅ 社区适配 |
| QQ | ✅ 社区适配 |

---

## 三、LLM 支持（Model-Agnostic）

| 提供商 | 支持模型 |
|--------|---------|
| Anthropic | claude-opus-4-6, claude-sonnet-4-6, claude-haiku-4-5 |
| OpenAI | gpt-4o, gpt-4o-mini, o3-mini, o1, GPT-5.4（新） |
| Google | Gemini 3.1 Flash（新）及系列 |
| 字节跳动 | Doubao-Seed-2.0 |
| Moonshot | Kimi 2.5 |
| 智谱 | GLM 系列 |
| MiniMax | MiniMax 2.5 |
| 本地模型 | Ollama（任意本地模型，零 API 费用） |
| OpenRouter | 所有兼容 OpenAI API 的提供商 |
- **自动降级/重试**：某模型限流时自动切换备用模型

---

## 四、协议层能力

### MCP（Model Context Protocol）
- 支持 1,000+ 社区 MCP Server
- 传输方式：stdio（默认）、Streamable HTTP、SSE
- 官方 Server：filesystem、github、postgres、slack 等

### ACP（Agent Client Protocol）
- 与 Zed 等 IDE 双向通信
- **已知缺口**：`loadSession` 返回空、`mcpServers` 字段被丢弃

---

## 五、系统运维能力

| 能力 | 详情 |
|------|------|
| 常驻后台 | macOS launchd / Linux systemd 守护进程 |
| 热重载配置 | 监视 `~/.openclaw/openclaw.json`，无需重启 |
| 跨平台 | macOS / Linux / Windows WSL2 / 树莓派 |
| Docker 部署 | 官方镜像，挂载配置和工作区 |
| 健康检查 | `openclaw doctor` |
| 安全审计 | `openclaw security audit --deep` |

---

## 六、数据存储

```
~/.openclaw/
├── openclaw.json     ← 主配置（Gateway 热监视）
├── openclaw.db       ← SQLite（会话/记忆）
├── SOUL.md           ← AI 人格/核心指令
├── MEMORY.md         ← 跨会话持久记忆
└── skills/           ← 全局 Skills
```

所有数据本地存储，不外传（除非显式配置外部集成）。
