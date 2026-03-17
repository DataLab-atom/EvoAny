# Evo-anything：依赖现有能力的升华路径分析

> 调研日期：2026-03-17
> 核心问题：这个仓库干什么？怎么在 OpenClaw 已有能力上扩展？扩展了哪些现在没有的能力？

---

## 一、这个仓库是什么

**Evo-anything** 是论文 [arXiv:2503.10721](https://arxiv.org/abs/2503.10721) 的工程实现：

> *"From Understanding to Excelling: Template-Free Algorithm Design through Structural-Functional Co-Evolution"*

它是一个 **OpenClaw 插件（Plugin）+ MCP Server 的组合**，让 OpenClaw 具备**自动演化任意 git 仓库代码**的能力——用户只需说"我要在 CIFAR-100-LT 上 SOTA"，剩下的全自动：搜索、克隆、安装、跑基线、演化代码、推最优分支、发报告。

---

## 二、它依赖 OpenClaw 哪些现有能力

Evo-anything 是一个**纯粹的能力组合器**，自身不重造轮子，完全站在 OpenClaw 已有能力上。

### 依赖关系图

```
Evo-anything 用户指令（如 /hunt CIFAR-100-LT SOTA）
         │
         ▼
┌─────────────────────────────────────────────────────┐
│                  Evo-anything 插件层                  │
│  SOUL.md / AGENTS.md / TOOLS.md / Skills            │
└──────┬──────────────┬─────────────────┬─────────────┘
       │              │                 │
       ▼              ▼                 ▼
  OpenClaw          OpenClaw          evo-engine
  exec 工具         browser 工具      (MCP Server)
  ├ git 操作        └ paperswithcode  ├ evo_step 状态机
  ├ pip install       检索 SOTA 方法  ├ evo_register_targets
  ├ benchmark 执行                    ├ evo_select_survivors
  └ git worktree                      └ evo_record_synergy

       │
       ▼
  OpenClaw          OpenClaw
  read/write 工具   memory 工具
  ├ 读目标函数代码  └ MEMORY.md 写经验
  └ 写变体代码        防止重复失败
```

### 逐条依赖明细

| Evo-anything 需要做的事 | 依赖 OpenClaw 哪个能力 |
|------------------------|----------------------|
| 搜索 GitHub 找候选仓库 | `exec`（调用 `gh search repos`）|
| 在 paperswithcode 查 SOTA | `browser`（网页抓取 + 视觉理解）|
| clone 仓库、pip install | `exec` |
| 运行 benchmark，获取 fitness | `exec`（在 git worktree 中隔离执行）|
| 读取目标函数代码 | `read` |
| 写入 LLM 生成的代码变体 | `write` / `edit` |
| git checkout -b、git tag、git diff | `exec` |
| git worktree add/remove（隔离评估） | `exec` |
| 写演化记忆（防重复失败）| `write` + OpenClaw 本地文件系统 |
| 推最优分支 | `exec`（`git push`）|
| 向用户汇报每代进度 | OpenClaw 消息渠道（WhatsApp/Telegram 等）|
| 演化状态持久化 | OpenClaw 本地存储（`~/.openclaw/u2e-state/`）|

---

## 三、Evo-anything 添加了哪些 OpenClaw 现在没有的能力

### 3.1 OpenClaw 原本没有的：**代码演化状态机**

OpenClaw 的 `exec` 和 `read/write` 工具是**无状态**的——它执行命令，但不跨轮次管理"哪些代码变体评估过了""哪个分支最优""下一代该怎么变异"。

Evo-anything 通过 **evo-engine MCP Server** 注入了一个有状态的演化控制器：

```
evo_init               → 初始化演化会话
evo_register_targets   → 注册优化目标（哪些函数值得演化）
evo_report_seed        → 记录基线 fitness
evo_step               → 推进状态机（begin_generation → dispatch_workers → select → reflect → ...）
evo_next_batch         → 获取下一批变体任务
evo_report_fitness     → 上报变体评估结果
evo_select_survivors   → 执行选择（保留 top-k，淘汰其余）
evo_get_status         → 查询当前进度
evo_get_lineage        → 追踪分支演化谱系
evo_freeze_target      → 冻结某目标（停止演化）
evo_boost_target       → 提升某目标优先级（温度调节）
evo_record_synergy     → 记录跨函数协同实验结果
evo_check_cache        → 跳过重复代码评估
```

这些 MCP 工具提供的是**演化算法的"骨骼"**——OpenClaw 的 LLM 是"肌肉"，状态机负责驱动和记账。

---

### 3.2 OpenClaw 原本没有的：**结构-功能协同演化（U2E）**

OpenClaw 的 LLM 能生成代码，但没有机制做**系统性的多轮代码优化**（不是单次改写，而是跨代持续进化）。

Evo-anything 实现了论文提出的 **U2E 协议**：

| 维度 | EoH / FunSearch（前人工作） | Evo-anything（U2E） |
|------|--------------------------|-------------------|
| 模板依赖 | 需要预定义模板 | **无需模板** |
| 优化范围 | 局部单函数 | **全局多目标** |
| 结构演化 | 无（只改函数逻辑） | **功能维 + 结构维协同** |
| 记忆机制 | 无 | **失败记录 + 经验积累** |
| 跨目标协同 | 无 | **Synergy 检验**（每 N 代） |

具体来说，每代演化包含六个阶段：

```
1. Analysis   → MapAgent 自动识别哪些模块值得优化
2. Planning   → 按温度（explore/exploit）分配变异/交叉预算
3. Generation → WorkerAgent 并行生成变体（单亲变异 or 双亲交叉）
4. Evaluation → PolicyAgent 审查 diff → git worktree 隔离跑 benchmark
5. Selection  → 保留 top-k，每 N 代做跨目标 Synergy 检验
6. Reflection → ReflectAgent 提取教训，写入结构化记忆
```

---

### 3.3 OpenClaw 原本没有的：**多 Agent 分工协作框架（针对代码优化场景）**

OpenClaw 支持 `sessions_spawn`，但没有针对代码优化场景的**角色分工协议**。

Evo-anything 定义了 5 类专职 Agent：

| Agent | 职责 | 使用的 OpenClaw 工具 |
|-------|------|-------------------|
| **OrchestratorAgent** | 驱动主循环、分发任务、触发选择 | `evo_step`, `exec git tag/branch` |
| **MapAgent** | 分析代码、识别优化目标 | `read`, `exec`（静态分析/grep 调用链）|
| **WorkerAgent** | 生成变体代码 + 在 worktree 中评估 | `read/edit/write`, `exec git worktree`, `evo_step` |
| **PolicyAgent** | 审查 git diff，拒绝非法修改（不得改 benchmark 脚本） | `evo_step` |
| **ReflectAgent** | 写记忆文件、提取教训、做 Synergy | `read/write`, `exec git diff/cherry-pick` |

PolicyAgent 是关键的**安全约束层**：确保演化只改目标函数体，绝不修改 benchmark 脚本（否则 fitness 数值没有意义）。

---

### 3.4 OpenClaw 原本没有的：**演化记忆系统**

OpenClaw 的 `MEMORY.md` 是通用对话记忆。Evo-anything 在此之上构建了**结构化的演化专用记忆**：

```
memory/
├── global/long_term.md            ← 跨目标通用经验（"L2 正则化在这类问题无效"）
├── targets/{id}/
│   ├── short_term/gen_{N}.md      ← 每代反思（fitness 变化 + 原因）
│   ├── long_term.md               ← 该目标累积智慧
│   └── failures.md                ← 禁止列表（不要再试的方向）
└── synergy/records.md             ← 跨函数组合实验结果
```

这解决了 OpenClaw 在长时间代码优化场景下的**"失忆"**问题——不会重复尝试已失败的方向。

---

### 3.5 OpenClaw 原本没有的：**git 分支作为实验单元**

OpenClaw 可以执行 git 命令，但没有**将 git 分支与实验结果绑定**的约定。

Evo-anything 定义了严格的分支命名规范：

```
gen-{N}/{target_id}/{op}-{V}             ← 单目标变体
gen-{N}/synergy/{targetA}+{targetB}-{V}  ← 跨目标组合

Tags:
  seed-baseline    ← 起始基线
  best-gen-{N}     ← 每代最优
  best-overall     ← 最终推送
```

这让演化过程**完全可追溯、可回滚、可审计**——每个 fitness 对应一个 git commit，可以 `git diff` 看到改了什么。

---

## 四、升华路径总结

```
OpenClaw 已有能力                Evo-anything 升华为
─────────────────────────────────────────────────────
exec（跑命令）          →   受控的代码变体 benchmark 执行
                             + git worktree 隔离
                             + PolicyAgent 安全审查

read/write（读写文件）  →   LLM 驱动的代码变体生成
                             + 结构化演化记忆系统
                             + 失败禁止列表

browser（浏览网页）     →   自动发现 SOTA 方法
                             + 对应 GitHub 仓库搜索

memory（持久化记忆）    →   跨代经验积累
                             + 跨目标 Synergy 记录

sessions_spawn（多会话）→   多 Agent 分工协作
                             + 并行 WorkerAgent 批量评估

消息渠道（WhatsApp 等）→   演化进度实时推送
                             + 最终报告发送

git（通过 exec）        →   分支即实验单元
                             + 完整演化谱系追踪
```

---

## 五、Evo-anything 当前**没有**的能力（推断）

| 缺失 | 说明 |
|------|------|
| 自动超参搜索 | 只演化代码逻辑，不做贝叶斯/网格超参优化 |
| 多机并行评估 | WorkerAgent 在本机并行，无分布式集群支持 |
| 数据增强演化 | 只优化算法代码，不触碰数据集/数据管道 |
| 神经网络架构搜索（NAS）| 变异粒度是函数体，不是网络结构 |
| 跨仓库知识迁移 | 记忆系统是每个目标仓库独立的 |
| 在线学习（运行时自适应）| 演化是离线的 benchmark-driven，不支持实时部署后的在线优化 |
| GUI 可视化 | 无演化树/fitness 曲线可视化界面 |
