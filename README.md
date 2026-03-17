# Evo-anything Plugin — Git-Based Evolutionary Code Optimizer

Evo-anything 是基于论文 **"From Understanding to Excelling: Template-Free Algorithm Design through Structural-Functional Co-Evolution"**（arXiv:2503.10721）的工程实现。它通过 LLM 驱动的**结构-功能协同演化**，在任意 git 仓库上自动演化代码，追求更优的 benchmark 表现。

> **论文引用：** Zhe Zhao, Haibin Wen, Pengkun Wang, Ye Wei, Zaixi Zhang, Xi Lin, Fei Liu, Bo An, Hui Xiong, Yang Wang, Qingfu Zhang. *From Understanding to Excelling: Template-Free Algorithm Design through Structural-Functional Co-Evolution.* arXiv:2503.10721 [cs.SE], 2025.

## 安装

### 前置条件

**必需：**
- Python >= 3.11
- Git
- GitHub CLI (`gh`) — 用于 `/hunt` 搜索仓库和自动开 PR

**可选（安装后自动启用增强能力）：**
- `oracle` CLI — MapAgent 整仓库上下文分析（`npm install -g oracle`）
- `claude` CLI — WorkerAgent 复杂变体生成，用 Claude Code 代替直接 edit
- `codex` CLI — WorkerAgent 复杂变体生成的备选
- `lobster` CLI — 原子化 setup 工作流 + PR approval gate
- `tmux` — 长时间 benchmark 非阻塞后台执行
- `pyflakes` — 变体提交前 import/name 静态检查（`pip install pyflakes`）
- OpenClaw skills: `oracle`、`arxiv-watcher`、`summarize`、`session-logs`（通过 `clawhub install <slug>` 安装）

### 方式一：npm 一键安装（推荐）

```bash
npm install -g evo-anything
```

安装过程中会自动调用 `pip install` 完成 Python MCP server 的安装。

安装完成后，运行 setup 配置你的 AI IDE：

```bash
# 配置所有支持的平台（Claude Code、Cursor、Windsurf、OpenClaw）
npx evo-anything setup

# 或只配置指定平台
npx evo-anything setup --platform claude
npx evo-anything setup --platform cursor
npx evo-anything setup --platform windsurf
npx evo-anything setup --platform openclaw
```

---

### 方式二：手动安装

#### 通用步骤：安装 evo-engine

无论使用哪个平台，都需要先安装 MCP server：

```bash
git clone https://github.com/DataLab-atom/Evo-anything.git
cd Evo-anything/plugin/evo-engine
pip install .
```

---

### OpenClaw

<details>
<summary>CLI 一键安装（推荐）</summary>

```bash
openclaw plugins install openclaw-evo
openclaw gateway restart
openclaw plugins doctor   # 验证
```

</details>

<details>
<summary>本地开发模式</summary>

```bash
openclaw plugins install -l ./plugin
openclaw gateway restart
```

</details>

<details>
<summary>手动安装</summary>

将插件复制到扩展目录，并在 `~/.openclaw/openclaw.json` 中注册：

```bash
cp -r plugin/ ~/.openclaw/extensions/openclaw-evo/
```

```json
{
  "plugins": {
    "entries": {
      "openclaw-evo": {
        "enabled": true,
        "config": {}
      }
    }
  },
  "mcpServers": {
    "evo-engine": {
      "command": "evo-engine",
      "args": [],
      "env": {}
    }
  }
}
```

```bash
openclaw gateway restart
```

</details>

**验证：** 对话中输入 `/status`，看到 "Evolution not initialized" 即安装成功。

---

### Claude Code

在项目根目录或全局 `.claude/settings.json` 中添加 MCP server：

```json
{
  "mcpServers": {
    "evo-engine": {
      "command": "evo-engine",
      "type": "stdio"
    }
  }
}
```

将 skills 链接到 Claude Code：

```bash
ln -s $(pwd)/plugin/skills/* ~/.claude/skills/
```

重启 Claude Code 即可使用。

---

### Cursor

在项目根目录的 `.cursor/mcp.json` 中添加：

```json
{
  "mcpServers": {
    "evo-engine": {
      "command": "evo-engine",
      "type": "stdio"
    }
  }
}
```

Cursor 会自动发现 MCP tools（`evo_init`、`evo_next_batch` 等）。Skills 需要作为 Cursor Rules 手动导入：

```bash
cp plugin/AGENTS.md .cursor/rules/evo-agents.md
```

---

### Windsurf

在全局 `~/.codeium/windsurf/mcp_config.json` 中添加：

```json
{
  "mcpServers": {
    "evo-engine": {
      "command": "evo-engine",
      "type": "stdio"
    }
  }
}
```

---

### 其它 MCP 兼容客户端

Evo-anything 的核心是一个标准 [MCP](https://modelcontextprotocol.io) server。任何支持 MCP stdio 传输的客户端都可以接入：

```bash
# 直接启动 server（stdio 模式）
evo-engine

# 或指定 Python 模块
python -m plugin.evo-engine.server
```

提供的 MCP tools：`evo_init`、`evo_register_targets`、`evo_report_seed`、`evo_step`、`evo_next_batch`、`evo_report_fitness`、`evo_select_survivors`、`evo_get_status`、`evo_get_lineage`、`evo_freeze_target`、`evo_boost_target`、`evo_record_synergy`、`evo_check_cache`。

---

### 可选配置

演化状态默认存储在 `~/.openclaw/u2e-state/`，可通过环境变量自定义（`U2E` 即论文名 *Understanding to Excelling* 缩写）：

```bash
export U2E_STATE_DIR=/path/to/your/state
```

或在 OpenClaw 中通过 `openclaw.json` 配置：

```json
{
  "plugins": {
    "entries": {
      "openclaw-evo": {
        "enabled": true,
        "config": {
          "statePath": "/path/to/your/state"
        }
      }
    }
  }
}
```

## Quick Start

```
你在 Telegram 发：我要 CIFAR-100-LT 上 SOTA
         ↓
  /hunt 自动触发
         ↓
  搜 GitHub → 找到 3 个候选 → 问你选哪个
         ↓
  你说：用第 1 个
         ↓
  clone → pip install → 下载数据 → 跑基线确认能跑
         ↓
  自动调用 /evolve → 进化循环
         ↓
  每代给你发进度
         ↓
  结束后推最优分支 + 发报告
```

## 工作原理

Evo-anything 实现了论文提出的 **U2E（Understanding to Excelling）协议**——一种无模板的两维协同演化框架，区别于 EoH、FunSearch 等依赖预定义模板、仅做局部函数优化的方法，U2E 同时在**功能维**（算法逻辑）和**结构维**（代码架构）上做全局联合优化。

所有实验以 git 分支记录，演化循环包含六个阶段：

1. **分析** — 自动识别关键算法模块（哪些代码值得优化）
2. **规划** — 决定变异/交叉策略和每轮变体数量，按温度自适应分配预算
3. **生成** — LLM 生成代码变体（变异：单亲改进；交叉：双亲融合）
4. **评估** — 在隔离的 git worktree 中运行 benchmark
5. **选择** — 保留最优，淘汰其余；每 N 代做跨目标协同（Synergy）检验
6. **反思** — 提取经验教训，写入结构化记忆，指导后续演化

每一代的最优结果打 tag（`best-gen-{N}`），最终推送 `best-overall` 分支。

### 与现有方法对比

| 方法 | 模板依赖 | 优化范围 | 结构演化 |
|------|---------|---------|---------|
| EoH / FunSearch | 需要预定义模板 | 局部函数 | 无 |
| **Evo-anything (U2E)** | **无需模板** | **全局多目标** | **功能 + 结构协同** |

## Skills

| 命令 | 说明 |
|------|------|
| `/hunt <任务描述>` | 搜索 GitHub 找到合适的仓库，自动 clone、安装、跑基线，然后启动演化 |
| `/evolve <repo> <benchmark_cmd>` | 对指定仓库启动演化优化循环 |
| `/status` | 查看当前演化进度 |
| `/report` | 生成完整的演化报告 |
| `/boost <target_id>` | 提升某个优化目标的优先级 |
| `/freeze <target_id>` | 冻结某个目标，停止对它的演化 |

## 目录结构

```
Evo-anything/
├── LICENSE
├── README.md
├── research/                  # 生态调研文档
│   ├── 01_openclaw_existing_capabilities.md
│   ├── 02_compatible_products_capabilities.md
│   ├── 03_evo_anything_analysis.md
│   └── 04_ecosystem_capability_map.md  # 生态能力全景图
└── plugin/
    ├── openclaw.plugin.json   # 插件定义
    ├── AGENTS.md              # 演化协议（核心循环）
    ├── SOUL.md                # Agent 人格设定
    ├── TOOLS.md               # 工具使用约定
    ├── agents/                # 各 Agent 行为说明
    │   ├── orchestrator.md    # OrchestratorAgent（含 canvas 可视化）
    │   ├── worker.md          # WorkerAgent（含静态检查、tmux、coding-agent）
    │   ├── policy_agent.md    # PolicyAgent
    │   ├── reflect_agent.md   # ReflectAgent（含跨-run 元学习）
    │   └── map_agent.md       # MapAgent（含 oracle 整仓库分析）
    ├── evo-engine/            # 演化引擎（MCP server）
    │   ├── server.py          # MCP 工具接口
    │   ├── models.py          # 数据模型
    │   └── selection.py       # 选择算法
    ├── skills/                # 用户可调用的技能
    │   ├── hunt/              # 搜索并部署代码库（含 arxiv-watcher）
    │   ├── evolve/            # 启动演化循环（含 lobster 工作流）
    │   ├── status/            # 查看进度
    │   ├── report/            # 生成报告
    │   ├── boost/             # 提升目标优先级
    │   └── freeze/            # 冻结目标
    └── workflows/             # Lobster 声明式工作流
        ├── evo-setup.lobster  # 原子化 setup（validate→baseline→tag→mkdir）
        └── evo-finish.lobster # 结束流程（tag→push→approval gate→PR）
```

## 演化记忆

Evo-anything 在目标仓库中维护结构化记忆，避免重复失败的尝试：

```
memory/
├── global/long_term.md           # 跨目标的通用经验
├── targets/{id}/
│   ├── short_term/gen_{N}.md     # 每代反思
│   ├── long_term.md              # 该目标的累积智慧
│   └── failures.md               # 失败记录（不要再试的方向）
└── synergy/records.md            # 跨函数组合实验结果
```

## 分支命名

```
gen-{N}/{target_id}/{op}-{V}          # 单目标变体
gen-{N}/synergy/{targetA}+{targetB}-{V}  # 跨目标组合
```

Tags: `seed-baseline`, `best-gen-{N}`, `best-overall`
