# OpenClaw 生态能力全景图

> 调研日期：2026-03-17
> 来源：openclaw/openclaw 源码、clawhub 文档、VoltAgent/awesome-openclaw-skills（5,366 skills / 13,729 total）
> 目的：**搞清楚整个生态已经提供了什么**，哪些 Evo-anything 用到了，哪些还没用到

---

## 核心认知

Evo-anything 能做到"自己去搜文献、自己操作 git、自己运行代码、自己读代码分析日志"，**不是它自己实现的**。这些能力来自整个生态的基础设施，分三层：

```
┌─────────────────────────────────────────────────────────┐
│   Layer 3: 社区 Skills / 社区 MCP Servers               │
│   5,366+ curated skills on ClawHub（13,729 raw）         │
├─────────────────────────────────────────────────────────┤
│   Layer 2: 官方 Skills（53个）+ 官方 Extensions（74个）  │
│   gh-issues / coding-agent / oracle / tmux / summarize  │
├─────────────────────────────────────────────────────────┤
│   Layer 1: OpenClaw 平台内置工具                         │
│   exec / browser / read·write·edit / memory / canvas    │
│   web_search / cron / webhooks / sessions_spawn         │
└─────────────────────────────────────────────────────────┘
          ↑
    Evo-anything 站在这三层上面
```

---

## 一、Layer 1：平台内置工具（无需安装，开箱即用）

### `exec` — Shell 命令执行器
**Evo-anything 重度依赖**

| 能力 | 具体说明 |
|------|---------|
| 任意 shell 命令 | 等价于用户在终端直接输入 |
| 沙箱代码执行 | 内置 Python + JavaScript 沙箱 |
| 包管理 | pip install / npm install / brew install |
| PTY 支持 | `pty:true` — 支持需要交互终端的程序（Codex/OpenCode 等） |
| 后台进程 | `background:true` — 长时任务异步执行，返回 sessionId |
| 进程监控 | `process action:log/poll/submit` — 跟踪后台进程 |
| 批准机制 | `exec.approvals` — 控制哪些命令需要用户确认 |

### `browser` — 真实浏览器自动化
**`/hunt` skill 用到**

| 能力 | 具体说明 |
|------|---------|
| CDP 控制 Chromium | 非 HTTP 爬虫，是真实浏览器 |
| 导航/点击/填表 | 完整用户交互模拟 |
| JavaScript 执行 | 注入并运行任意 JS |
| 截图 → 视觉模型 | 截图后送给 VLM 解析内容 |
| 语义元素引用 | `@ref` 机制，无需 CSS selector |
| SPA 支持 | 完整处理 React/Vue 现代应用 |
| Session/Cookie 管理 | 持久化登录状态 |

### `read` / `write` / `edit` — 文件系统
**Evo-anything 重度依赖（MapAgent / WorkerAgent / ReflectAgent 全用）**

- 读写本地任意文件（无路径限制）
- 语义理解内容（不只是字符串搜索，能理解代码逻辑）
- `edit` 支持精确字符串替换，而非整文件覆写

### `memory` — 跨会话持久记忆

| 能力 | 具体说明 |
|------|---------|
| 会话内完整上下文 | 默认保留本次对话全部内容 |
| MEMORY.md | 跨会话持久化的 key-value/Markdown 记忆 |
| SOUL.md | AI 人格与核心指令文件 |
| 向量语义搜索 | Embedding + 相似度检索历史记忆 |
| ContextEngine 插件接口 | 记忆策略"即插即用"，不需修改核心 |

### `canvas` — 可视化画布
**已接入（OrchestratorAgent）**

- 渲染 HTML/CSS/JS 到连接的 Mac/iOS/Android 节点的 WebView
- 支持图表（折线、柱状、饼图）、架构图、流程图
- 实时更新（文件变化自动刷新）
- JS 交互注入和截图能力
- **→ OrchestratorAgent 在每代结束后更新 `~/clawd/canvas/evo-dashboard.html`，实时展示 fitness 曲线和 per-target 进度**

### `web_search` — 网页搜索
**`/hunt` skill 间接依赖（通过 browser 访问 paperswithcode）**

| 引擎 | 说明 |
|------|------|
| Brave Search API | 免费 2,000 次/月，隐私优先 |
| Brave LLMContext | v3.8+ AI 原生格式，直接返回结构化结果 |
| Gemini Google Search | 谷歌搜索索引 |
| Grok（xAI） | X/Twitter 内容索引 |
| Kimi（Moonshot） | 中文搜索优化 |
| Perplexity | 通过 extension 接入 |

### `web_fetch` — 网页内容抓取
- 获取任意 URL 的正文，返回 Markdown 格式
- 支持 PDF 提取

### `cron` — 定时调度
**Evo-anything 目前未使用**

- 心跳调度器：无需用户触发，按间隔主动执行
- 24/7 后台运行
- **→ 可用于：定时运行 evolution loop，每晚自动跑一代**

### `webhooks` — 外部事件接收
**Evo-anything 目前未使用**

- 监听 HTTP POST 事件触发 agent 执行
- **→ 可用于：CI/CD 跑完自动触发 evolve，或 PR merge 后自动执行**

### `sessions_spawn` / `sessions_send` — 多 Agent 并发
**Evo-anything 重度依赖（WorkerAgent 并行执行）**

| 工具 | 说明 |
|------|------|
| `sessions_spawn` | 启动子 Agent 会话（独立上下文，不污染主会话） |
| `sessions_send` | Agent 间消息传递 |
| `sessions_list` | 列出活跃会话 |
| `sessions_history` | 查看会话历史 |
| 并发数 | 实测可并行 8+ 独立 agent |

### `lobster` — 多步工作流引擎
**已接入（evo-setup.lobster / evo-finish.lobster）**

- 声明式多步骤 DAG 流程定义
- `llm_task`：在工作流节点插入 LLM 处理步骤
- **→ `evo-setup.lobster`：原子化 pre-evolution setup（validate → baseline → tag seed → mkdir memory → init canvas）**
- **→ `evo-finish.lobster`：结束流程（tag best → push → 人工 approval gate → open PR），任一步骤失败即报告精确原因**

---

## 二、Layer 2A：官方 Skills（53个）

> 来源：`github.com/openclaw/openclaw/tree/main/skills/`
> 安装：内置或 `clawhub install <slug>`

### 🔥 与 Evo-anything 高度相关

#### `coding-agent` — 派生完整编码代理
**已接入（WorkerAgent）**

```
# Codex / OpenCode — 需要 PTY
exec pty:true workdir:~/project command:"codex exec --full-auto '重写 loss 函数'"

# Claude Code — 不需要 PTY
exec workdir:~/project command:"claude --print --permission-mode bypassPermissions '优化 CUDA kernel'"
```

| 支持的 agent | PTY 需求 |
|-------------|---------|
| Codex | 需要 pty:true |
| Claude Code（cc） | 不需要，用 --print --permission-mode bypassPermissions |
| Pi | 需要 pty:true |
| OpenCode | 需要 pty:true |

背景任务模式：`background:true` → 返回 sessionId → `process action:log/poll/submit` 监控

**→ WorkerAgent 优先调用 coding-agent 处理复杂变体（交叉/大幅重构），不可用时 fallback 到直接 read/edit/write**

---

#### `gh-issues` — 自主 GitHub issue 修复代理
**Evo-anything 目前未使用**

工作流（6个阶段）：
1. 解析参数（repo、label 过滤、watch/cron/dry-run 模式）
2. 通过 GitHub REST API 获取 issues（curl + Bearer token，**不依赖 gh CLI**）
3. 展示 issue 表格，等待确认
4. 预检：验证 git 状态、检测已有 PR/branch、claim 锁防止重复
5. **并发派生子 agent（最多 8 个）**：每个子 agent 创建 branch → 修复代码 → 运行测试 → 开 PR
6. 监控 PR review comments，自动派生修复 agent

支持模式：
- Fork mode：branch 推到 fork，PR 指向源 repo
- Watch mode：持续轮询新 issue
- Cron mode：单 issue 顺序处理后立即退出

**→ 可用于：将 Evo-anything 发现的最佳变体自动提 PR 到上游仓库**

---

#### `github` — gh CLI 封装
**`/hunt` skill 用到（`gh search repos`）**

适用场景：
- ✅ 检查 PR 状态 / CI 状态
- ✅ 创建/评论 issues
- ✅ 列出/过滤 PR 和 issues
- ✅ GitHub API 查询（`gh api`）
- ❌ 不适合本地 git 操作（用 exec 直接跑 git）

要求：`gh` CLI 已安装并 `gh auth login`

---

#### `oracle` — 整仓库上下文代码分析
**已接入（MapAgent）**

```bash
# 预览 payload（不消耗 token）
oracle --dry-run summary -p "<任务>" --file "src/**"

# 用浏览器引擎跑（推荐，支持 GPT-5.2 Pro 长会话）
oracle --engine browser --model gpt-5.2-pro -p "<任务>" --file "src/**"
```

特性：
- 支持 glob 模式选文件：`--file "src/**" --file "!**/*.test.ts"`
- 自动忽略 node_modules / dist / .git
- 长会话支持（最长 1 小时）：自动持久化到 `~/.oracle/sessions`
- 断线重连：`oracle session <id> --render`

**→ MapAgent 在仓库文件数 >10 时优先调用 oracle 整仓库一次性分析，fallback 到逐文件 read + exec grep**

---

#### `tmux` — 远程终端会话控制
**已接入（WorkerAgent 长 benchmark）**

| 操作 | 命令 |
|------|------|
| 捕获输出 | `tmux capture-pane -t [session] -p` |
| 完整历史 | `tmux capture-pane -t [session] -p -S -` |
| 发送按键 | `tmux send-keys -t [session] "text" Enter` |
| 创建/删除会话 | `tmux new-session / kill-session` |

使用场景：监控跑在 tmux 里的 Claude/Codex 会话、给交互程序发指令

**→ WorkerAgent 对预期 >30s 的 benchmark 使用 tmux 非阻塞后台执行，轮询完成后读取输出；不阻断其他 WorkerAgent 并行运行**

---

#### `session-logs` — 会话历史搜索分析

日志位置：`~/.openclaw/agents/<agentId>/sessions/`
格式：JSONL（每行一个 JSON 对象，含 role/timestamp/content/cost）

查询能力：
- 按日期列出会话
- 按关键词跨会话搜索（用 `rg`）
- 提取 tool usage 统计
- 计算 token/cost

**→ 已接入（ReflectAgent）：首代开始前搜索同仓库或相似任务的历史 session，提取经验写入 memory/global/long_term.md**

---

#### `summarize` — URL/PDF/YouTube 内容摘要
**已接入（/hunt skill）**

支持输入：URL、PDF、YouTube 视频、文本文件

**→ /hunt 阶段对找到的论文调用 `/summarize <arxiv_pdf_url>`，快速提取核心方法，辅助决策选哪个候选仓库**

---

#### `skill-creator` — 在 agent 内部创建新 skill

用于从当前对话直接生成和发布新 skill：
- 生成 SKILL.md（含 frontmatter metadata）
- 打包资源文件（scripts/ references/ assets/）
- 调用 `clawhub publish`

---

#### `mcporter` — MCP Server CLI 工具
**Evo-anything 的 MCP server 可通过此调试**

```bash
# 列出 server 工具
mcporter list linear

# 调用工具
mcporter call linear.list_issues team=ENG limit:5

# 生成 TypeScript 类型
mcporter types linear > linear.d.ts
```

支持：HTTP server / stdio server / OAuth 认证 / JSON 输出

---

#### `model-usage` — 模型用量成本分析

```bash
python scripts/model_usage.py --provider claude --mode all
```

分析 CodexBar 本地日志中的 per-model 费用。

---

#### `canvas` — HTML 可视化画布渲染
（见 Layer 1 canvas 条目）

---

### 其他官方 Skills（按类别）

#### 通讯渠道类
| Skill | 功能 |
|-------|------|
| `slack` | Slack 消息、频道管理 |
| `discord` | Discord 消息、服务器管理 |
| `imsg` | iMessage 收发 |
| `bluebubbles` | BlueBubbles iMessage 替代 |
| `wacli` | WhatsApp CLI |
| `himalaya` | 邮件客户端（IMAP/SMTP） |

#### 生产力工具类
| Skill | 功能 |
|-------|------|
| `notion` | Notion 数据库/页面操作 |
| `obsidian` | Obsidian 笔记库读写 |
| `trello` | Trello 看板管理 |
| `things-mac` | macOS Things 任务管理 |
| `apple-notes` | Apple Notes 读写 |
| `apple-reminders` | Apple Reminders 管理 |
| `bear-notes` | Bear 笔记读写 |

#### 多媒体类
| Skill | 功能 |
|-------|------|
| `sag` | ElevenLabs TTS（`eleven_v3` 等模型，支持情绪标签） |
| `openai-whisper` | 本地 Whisper 语音转文字 |
| `openai-whisper-api` | OpenAI Whisper API |
| `sherpa-onnx-tts` | 本地 ONNX 推理 TTS |
| `openai-image-gen` | DALL-E 图像生成 |
| `nano-banana-pro` | Gemini 图像生成/编辑/合成 |
| `video-frames` | 视频帧提取 |
| `camsnap` | 摄像头截图 |
| `gifgrep` | GIF 搜索 |
| `peekaboo` | 视觉内容捕获 |

#### 系统工具类
| Skill | 功能 |
|-------|------|
| `tmux` | 终端会话控制（见上） |
| `healthcheck` | 系统健康检查 |
| `goplaces` | macOS 位置/地图 |
| `openhue` | Philips Hue 灯光控制 |
| `spotify-player` | Spotify 播放控制 |
| `sonoscli` | Sonos 音响控制 |
| `weather` | 天气查询 |
| `xurl` | URL 工具集 |
| `eightctl` | 8Bitdo 手柄控制 |

---

## 二、Layer 2B：官方 Extensions（74个）

> 来源：`github.com/openclaw/openclaw/tree/main/extensions/`
> 这些是与平台深度集成的扩展，不是普通 skill

### AI 模型提供商（model extensions）
| Extension | 提供商/能力 |
|-----------|-----------|
| `anthropic` | Claude 系列（opus/sonnet/haiku） |
| `openai` | GPT-4o, o3-mini, o1 等 |
| `google` | Gemini 系列 |
| `ollama` | 本地模型（任意 Ollama 支持的模型） |
| `mistral` | Mistral 系列 |
| `openrouter` | 200+ 模型统一接口 |
| `huggingface` | HuggingFace 推理 API |
| `amazon-bedrock` | AWS Bedrock（Claude/Titan/Llama） |
| `together` | Together AI |
| `nvidia` | NVIDIA NIM |
| `moonshot` | Kimi 系列 |
| `volcengine` | 字节跳动豆包 |
| `qianfan` | 百度文心 |
| `minimax` | MiniMax 系列 |
| `modelstudio` | 阿里云 ModelScope |
| `xai` | Grok |
| `xiaomi` | MiModel |
| `venice` | Venice AI |
| `byteplus` | BytePlus |
| `vercel-ai-gateway` | Vercel AI Gateway |
| `cloudflare-ai-gateway` | Cloudflare AI Gateway |
| `sglang` | SGLang 推理后端 |
| `vllm` | vLLM 推理后端 |
| `synthetic` | 合成/模拟 LLM（测试用） |
| `copilot-proxy` | GitHub Copilot 代理 |
| `github-copilot` | GitHub Copilot 直接接入 |
| `qwen-portal-auth` | 通义千问 Portal 认证 |
| `kimi-coding` | Kimi 编程专用 |
| `kilocode` | Kilo Code |

### 消息渠道（channel extensions）
| Extension | 渠道 |
|-----------|------|
| `whatsapp` | WhatsApp（Baileys） |
| `telegram` | Telegram（grammY） |
| `discord` | Discord |
| `slack` | Slack |
| `signal` | Signal |
| `imessage` | iMessage（macOS） |
| `bluebubbles` | BlueBubbles |
| `googlechat` | Google Chat |
| `msteams` | Microsoft Teams |
| `matrix` | Matrix |
| `irc` | IRC |
| `feishu` | 飞书 |
| `line` | LINE |
| `mattermost` | Mattermost |
| `nextcloud-talk` | Nextcloud Talk |
| `nostr` | Nostr |
| `synology-chat` | Synology Chat |
| `tlon` | Tlon/Urbit |
| `twitch` | Twitch |
| `zalo` | Zalo（越南） |
| `zalouser` | Zalo Personal |

### 系统能力（system extensions）
| Extension | 能力 |
|-----------|------|
| `memory-core` | 核心记忆系统（MEMORY.md + SQLite） |
| `memory-lancedb` | **向量记忆：LanceDB 语义搜索** |
| `lobster` | 多步工作流引擎 |
| `llm-task` | 工作流中的 LLM 节点 |
| `openshell` | Shell 执行（exec 底层） |
| `diffs` | Diff 查看和渲染 |
| `thread-ownership` | 线程所有权管理 |
| `firecrawl` | Firecrawl 网页抓取服务 |
| `perplexity` | Perplexity Search API |
| `brave` | Brave Search API |
| `device-pair` | 设备配对管理 |
| `phone-control` | 手机控制（iOS/Android） |
| `voice-call` | 语音通话 |
| `talk-voice` | 语音对话 |
| `diagnostics-otel` | OpenTelemetry 诊断 |
| `open-prose` | 文档/文章处理 |
| `opencode` | OpenCode 编程助手 |
| `opencode-go` | OpenCode Go 版本 |
| `lobster` | 工作流引擎（见上） |
| `shared` | 共享工具库 |
| `acpx` | ACP 协议扩展 |

---

## 三、Layer 3：社区 Skill 生态（5,366 精选 / 13,729 总量）

> 来源：VoltAgent/awesome-openclaw-skills（2026-02 数据）
> 注册表：clawhub.dev（官方 skill registry）
> 安装：`clawhub install <slug>`

### 总量分布

| 品类 | 精选数量 | 代表 Skill |
|------|---------|-----------|
| Coding Agents & IDEs | 1,222 | agent-commons, agent-swarm, agentdo |
| Web & Frontend | 938 | actionbook, agent-analytics, agentpay |
| DevOps & Cloud | 392 | agentic-devops, agent-sovereign-stack, log-dive |
| Search & Research | 353 | arxiv-watcher, academic-deep-research, pubmed-edirect |
| Browser & Automation | 335 | Agent Browser, agent-device |
| Git & GitHub | 166 | git-essentials, super-github, conventional-commits |
| Image & Video | 169 | （各种 AI 图像/视频生成） |
| 其他专业领域 | ~1,800+ | 金融/医疗/法律/旅游/电商等 |

---

### A. Search & Research 品类（353个 skills）— Evo-anything 最相关

#### 学术文献调研

| Skill | 功能描述 |
|-------|---------|
| `arxiv-watcher` | **搜索 arXiv 论文并生成摘要** |
| `academic-deep-research` | 深度学术调研工作流 |
| `aclawdemy` | 学术写作和文献管理 |
| `literature-manager` | 文献库组织管理 |
| `swiftscholar-skill` | 学术文献快速检索 |
| `pubmed-edirect` | PubMed 医学文献搜索 |
| `clarity-research` | 综合研究工具 |
| `dizest-summarize` | 长文内容摘要（文章/播客/**研究论文**/PDF） |

#### 通用 Web 搜索

| Skill | 功能描述 |
|-------|---------|
| `openclaw-free-web-search` | 自托管 SearXNG，免费私有搜索 |
| `bing-search` | Bing 搜索 API |
| `meyhem-search` | 无需 API key 的搜索 |

#### 知识管理与记忆增强

| Skill | 功能描述 |
|-------|---------|
| `agent-brain` | Agent 持久记忆系统 |
| `muninn` | 跨会话记忆管理 |
| `trust-memory` | 可信记忆存储 |
| `surrealdb-knowledge-graph-memory` | **SurrealDB 知识图谱记忆** |

---

### B. Git & GitHub 品类（166个 skills）

| Skill | 功能描述 |
|-------|---------|
| `git-essentials` | **Git 核心命令和工作流** |
| `doro-git-essentials` | 另一版本的 Git 工作流 |
| `super-github` | **终极 GitHub 自动化框架** |
| `conventional-commits` | Conventional Commits 规范提交 |
| `git-changelog` | **从 git history 自动生成 changelog** |
| `gh-action-gen` | 用自然语言生成 GitHub Actions |
| `auto-pr-merger` | **自动化 PR 合并工作流** |
| `pr-risk-analyzer` | **PR 安全风险分析** |

---

### C. Coding Agents & IDEs 品类（1,222个 skills）

代表性子类：

#### Agent 基础设施
| Skill | 功能描述 |
|-------|---------|
| `agent-commons` | Consult / commit / 扩展推理链 |
| `agent-swarm` | **多 agent 编排（需 OpenRouter）** |
| `agentdo` | 向其他 agent 发布任务的任务队列 |

#### 安全与审计
| Skill | 功能描述 |
|-------|---------|
| `pr-risk-analyzer` | PR 安全风险扫描 |
| 各种 prompt-injection 防护 skill | 检测注入攻击 |
| 凭据管理 skill | 安全密钥存储 |
| 防篡改审计日志 skill | 操作记录不可篡改 |

#### IDE 集成
| Skill | 功能描述 |
|-------|---------|
| `cursor-integration` | Cursor IDE 集成 |
| `claude-code-integration` | Claude Code 双向集成 |
| `lsp-integration` | Language Server Protocol（函数跳转/类型推断） |
| 测试框架集成 | pytest / jest / vitest 等 |

#### 专业领域
- 学术研究自动化 agent
- 金融分析 agent
- 医疗健康 agent（需声明合规）

---

### D. DevOps & Cloud 品类（392个 skills）

#### 云平台管理
| Skill | 功能描述 |
|-------|---------|
| AWS 系列 | EC2/ECS/S3/Lambda 管理，包含 CloudWatch 监控 |
| GCP 系列 | 计算实例、存储、BigQuery |
| Azure 系列 | 容器应用、Functions |
| Kubernetes | 集群管理、pod 操作 |

#### 监控与可观测性
| Skill | 功能描述 |
|-------|---------|
| `grafana-lens` | Grafana dashboard 查询 |
| `log-dive` | **统一跨 Loki/Elasticsearch/CloudWatch 日志搜索** |
| `aws-ecs-monitor` | ECS + CloudWatch 监控 |

#### AI 基础设施
| Skill | 功能描述 |
|-------|---------|
| `agent-sovereign-stack` | "一条命令给 AI agent 完整主权基础设施" |
| `agentic-devops` | Docker + 进程管理 + 健康监控（生产级） |

---

### E. Browser & Automation 品类（335个 skills）

| Skill | 功能描述 |
|-------|---------|
| `Agent Browser` | **快速 Rust 无头浏览器 CLI** |
| `agent-device` | **iOS/Android 模拟器/真机自动化** |
| `actionbook` | 网页抓取和表单填写自动化 |

---

## 四、Evo-anything 当前实际使用的生态能力

```
Layer 1 (平台内置):
  ✅ exec          → git 操作 / benchmark 执行 / pip install / 静态分析（py_compile / pyflakes）
  ✅ read/write/edit → 代码读取（MapAgent）/ 变体生成（WorkerAgent）/ 记忆 R/W（ReflectAgent）
  ✅ browser       → /hunt 中访问 paperswithcode.com
  ✅ sessions_spawn → WorkerAgent 并发执行（最多 8 个）
  ✅ canvas        → OrchestratorAgent 实时 fitness 仪表板（每代更新）
  ✅ lobster       → evo-setup.lobster（原子 setup）/ evo-finish.lobster（approval gate + PR）

Layer 2 (官方 Skills):
  ✅ github        → /hunt 候选仓库搜索（gh search repos）
  ✅ oracle        → MapAgent 整仓库上下文分析（>10 个源文件时优先使用）
  ✅ coding-agent  → WorkerAgent 复杂变体生成（交叉 / 大幅重构，可用时优先）
  ✅ tmux          → WorkerAgent 长 benchmark 非阻塞后台执行（>30s 时）
  ✅ session-logs  → ReflectAgent 跨 run 元学习（首代触发）
  ✅ summarize     → /hunt 论文 PDF 快速摘要
  ✅ arxiv-watcher → /hunt 并行 arXiv 文献搜索

Layer 3 (社区 Skills):
  ✅ 无（零个社区 skill 被直接集成）

MCP (自研):
  ✅ evo_step / evo_get_status / evo_get_lineage / evo_register_targets
  ✅ evo_check_cache / evo_record_synergy / evo_freeze_target / evo_boost_target
```

---

## 五、生态已有、Evo-anything 尚未使用的高价值能力

### 5.1 文献调研增强（/hunt 阶段）

| 现在做法 | 生态里已有的替代/增强 | 状态 |
|---------|-------------------|------|
| `browser` 手动访问 paperswithcode.com | `arxiv-watcher` skill：直接搜索 arXiv 返回结构化论文列表 | ✅ 已接入 |
| 手动读 README | `summarize`：快速提取 arXiv PDF 核心方法 | ✅ 已接入 |
| 手动提取 repo 链接 | `academic-deep-research` skill：完整学术调研工作流 | 待接入 |
| — | `dizest-summarize`：自动提取 PDF 论文核心方法 | 待接入 |
| — | `pubmed-edirect`：生医领域论文搜索 | 待接入 |

---

### 5.2 代码深度分析（MapAgent 阶段）

| 现在做法 | 生态里已有的替代/增强 | 状态 |
|---------|-------------------|------|
| 逐文件 `read` + `exec grep` | `oracle` skill：整仓库上下文一次性送给 LLM 分析 | ✅ 已接入 |
| 手动追踪调用链 | LSP integration skill：Language Server 函数跳转/引用图 | 待接入 |

---

### 5.3 实验追踪（WorkerAgent / ReflectAgent 阶段）

| 现在做法 | 生态里已有的替代/增强 |
|---------|-------------------|
| 自定义 memory/ Markdown 文件 | `surrealdb-knowledge-graph-memory`：图结构的跨 target 关系记忆 |
| 无 experiment tracking | wandb/MLflow skills（在 DevOps 类）：自动 log metrics, 比较 runs |
| — | `memory-lancedb` extension：语义向量搜索历史 evolution 结果 |

---

### 5.4 可视化（进化过程展示）

| 现在做法 | 生态里已有的替代/增强 | 状态 |
|---------|-------------------|------|
| 纯文字 /report | `canvas` tool：实时渲染 fitness 曲线、进化族谱图 | ✅ 已接入 |
| — | `grafana-lens`：将 evolution metrics 推送到 Grafana | 待接入 |

---

### 5.5 代码变体生成（WorkerAgent 阶段）

| 现在做法 | 生态里已有的替代/增强 | 状态 |
|---------|-------------------|------|
| LLM 直接生成变体（单模型） | `coding-agent` skill：调用 Claude Code / Codex 等专业编程 agent | ✅ 已接入 |
| — | `agent-swarm` skill：多模型并行尝试，取最佳 | 待接入 |
| — | `lsp-integration` skill：变体生成前先做类型检查，减少低质量变体 | 待接入 |

---

### 5.6 结果分发（Evolution 完成后）

| 现在做法 | 生态里已有的替代/增强 |
|---------|-------------------|
| 无（结果仅在本地 git） | `gh-issues` skill：自动从最佳变体开 PR 到上游 |
| — | `conventional-commits` skill：规范化 commit message 格式 |
| — | `git-changelog` skill：从 evolution history 生成 changelog |

---

### 5.7 自动化调度（长时间 evolution）

| 现在做法 | 生态里已有的替代/增强 | 状态 |
|---------|-------------------|------|
| 手动触发 /evolve | `cron` tool：定时触发每日 evolution run | 待接入 |
| — | `webhooks` tool：CI 跑完自动触发 evolution | 待接入 |
| — | `lobster` extension：将 evolution setup/finish 定义为声明式工作流 | ✅ 已接入 |

---

### 5.8 监控与日志分析

| 现在做法 | 生态里已有的替代/增强 | 状态 |
|---------|-------------------|------|
| exec 读 stdout/stderr | `tmux` skill：长 benchmark 非阻塞后台执行 | ✅ 已接入 |
| — | `session-logs` skill：回溯历次 evolution run 的决策过程 | ✅ 已接入 |
| — | `log-dive` skill：跨多个 log 源的统一搜索 | 待接入 |

---

### 5.9 云 GPU 计算（Benchmark 需要 GPU 时）

| 现在做法 | 生态里已有的替代/增强 |
|---------|-------------------|
| 假设本地有 GPU | DevOps AWS 系列 skill：启动 EC2 GPU 实例运行 benchmark |
| — | `agentic-devops` skill：Docker 容器化 benchmark 环境 |
| — | Kubernetes skill：K8s Job 提交 GPU 训练 |

---

## 六、总结

### 已接入（本轮集成完成）

| 能力 | 接入位置 |
|------|---------|
| `oracle` | MapAgent：整仓库上下文分析，>10 文件时优先 |
| `coding-agent` | WorkerAgent：复杂变体生成（交叉/大幅重构） |
| `tmux` | WorkerAgent：>30s benchmark 非阻塞后台执行 |
| `canvas` | OrchestratorAgent：每代更新实时 fitness 仪表板 |
| `session-logs` | ReflectAgent：首代触发跨 run 元学习 |
| `arxiv-watcher` | /hunt：并行 arXiv 文献搜索 |
| `summarize` | /hunt：论文 PDF 快速摘要辅助决策 |
| `lobster` | /evolve：原子化 setup + PR approval gate |
| `pyflakes` / `py_compile` | WorkerAgent：变体提交前静态检查 |

### 仍待接入（后续高价值方向）

- **`cron` / `webhooks`**：定时/CI 触发自动 evolution，实现 24/7 无人值守运行
- **`memory-lancedb`**：语义向量搜索历史 evolution，替代线性读 Markdown
- **`agent-swarm`**：多模型并行变体生成，提升多样性
- **`lsp-integration`**：变体生成前类型检查，减少低质量变体消耗 benchmark 预算
- **`gh-issues` / `git-changelog`**：自动从最优变体开 PR + 生成 changelog
- **DevOps GPU skills**：自动申请云 GPU 实例运行大规模 benchmark

**原则：优先集成生态里已有的能力，而不是重新造轮子。**
