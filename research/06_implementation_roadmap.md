# A-F 分层架构实施路线图

> 起草日期：2026-03-20
> 前置文档：`05_a_layer_knowledge_qa.md`（架构定义）、`03_evo_anything_analysis.md`（现有能力分析）

---

## 零、总体定位

**现有系统**是一个代码演化引擎：`/hunt` → `/evolve` → 推最优分支。

**A-F 层**是一条"从演化结果到论文"的流水线。两者的衔接点是 **C 层**——它的输入正好是 `evo_get_lineage()` / `evo_get_status()` 的输出。

```
现有系统（代码演化）                 新增层（研究验证→论文）
─────────────────                   ─────────────────────
/hunt → /evolve                     C 层（推导森林回环）
  ↓                                   ↑ 输入          ↓ 输出
evo_get_lineage()  ───────────────→ 演化结果        → D/E 层（论文）
evo_get_status()                    代码+性能
                                      ↕ 调用
                                    A 层（文献）  B 层（实验）
                                      ↓
                                    F 层（向量检索 + BibTeX）
```

---

## 一、实施顺序与理由

```
阶段 1: F 层（基础设施）     ← A 层的底层依赖
阶段 2: A 层（知识检索）     ← C 层的工具包
阶段 3: B 层 + C 层（并行）  ← B 大量复用现有演化引擎；C 是主控
阶段 4: D/E 层（论文产出）   ← 纯下游消费者，最后做
```

---

## 二、各阶段任务明细

### 阶段 1：F 层（基础设施）

#### F2 向量检索

| 项 | 说明 |
|-----|------|
| **目标** | A2 本地文献检索的底层引擎 |
| **方案** | 接入 `memory-lancedb` extension（生态已有） |
| **需要做的** | 1. 在 `package.json` 添加 lancedb 依赖<br>2. 新建 `plugin/src/vectordb.ts`：封装 embedding + 检索接口<br>3. schema 设计：`{id, title, abstract, authors, year, bibtex, embedding, source_url, ingested_at}` |
| **输入/输出** | 输入：查询文本 → 输出：top-k 匹配文献记录 |
| **对现有系统的影响** | 无——纯新增模块，不修改现有代码 |

#### F3 BibTeX 管理

| 项 | 说明 |
|-----|------|
| **目标** | A4 输出标准引用格式的底层支撑 |
| **需要做的** | 1. 新建 `plugin/src/bibtex.ts`：解析、去重、格式化 BibTeX 条目<br>2. 约定存储路径：`research/refs/references.bib`<br>3. 导出函数：`parseBib()`, `dedupBib()`, `formatBib()`, `appendBib()` |
| **对现有系统的影响** | 无——纯新增 |

---

### 阶段 2：A 层（知识检索与问答）

#### A1 在线文献检索

| 项 | 说明 |
|-----|------|
| **目标** | 从互联网检索相关文献 |
| **复用** | `arxiv-watcher` skill（已有）+ `web_search` + `summarize` |
| **需要做的** | 1. 新建 `plugin/skills/search-lit/SKILL.md`（内部 skill，非用户直接调用）<br>2. 编排：arXiv API → Papers With Code → Google Scholar（降级策略）<br>3. 输出标准化：`{title, authors, year, abstract, url, bibtex}` |
| **对现有系统的影响** | 无——新增 skill |

#### A2 本地文献检索

| 项 | 说明 |
|-----|------|
| **目标** | 从本地向量库检索匹配文献 |
| **依赖** | F2 向量检索 |
| **需要做的** | 1. 新建 MCP 工具 `lit_search_local`：查询向量库，返回 top-k<br>2. 在 `server.ts` 中注册工具 |
| **对现有系统的影响** | `server.ts` 增加一个工具注册，不影响现有 `evo_*` 工具 |

#### A3 代码问答

| 项 | 说明 |
|-----|------|
| **目标** | 基于 baseline + 变体代码 + diff 历史回答问题 |
| **复用** | `oracle` skill（全仓上下文）+ 现有 `read/exec` |
| **需要做的** | 1. 新建 MCP 工具 `code_qa`：接收问题 + optional branch，返回回答<br>2. 内部调用 `evo_get_lineage()` 获取相关 diff 作为上下文 |
| **对现有系统的影响** | 读取 `evo_get_lineage` 返回值，只读不写 |

#### A4 文献问答（统一入口）

| 项 | 说明 |
|-----|------|
| **目标** | 对外统一文献接口：本地优先 → 在线补充 → 自动入库 |
| **需要做的** | 1. 新建用户 skill `/ask-lit`（`plugin/skills/ask-lit/SKILL.md`）<br>2. 编排逻辑：A2 → 数量不足 → A1 → 新文献写入 F2 向量库<br>3. 输出：回答 + BibTeX 引用（调 F3） |
| **对现有系统的影响** | 新增 skill 注册，无副作用 |

---

### 阶段 3a：B 层（实验执行）

#### B-I 可视化分析

##### B1 期望驱动出图

| 项 | 说明 |
|-----|------|
| **需要做的** | 1. 新建 MCP 工具 `viz_generate`：接收期望结论 + 实验数据，生成图表<br>2. 图表输出到 `research/figures/`，用 matplotlib/plotly 生成<br>3. 返回：图路径 + "数据是否支持期望"判定 |
| **复用** | `canvas` 能力（展示图表）、`exec`（运行 Python 绘图脚本） |

##### B2 亮点挖掘

| 项 | 说明 |
|-----|------|
| **需要做的** | 1. 新建 MCP 工具 `viz_highlight`：对比图表与期望，标注亮点<br>2. 输出：亮点标注报告（哪些数据点/区间最能支撑贡献点） |
| **依赖** | B1 输出 |

##### B3 图表精修

| 项 | 说明 |
|-----|------|
| **需要做的** | 1. 新建 MCP 工具 `viz_polish`：调 A4 查目标期刊规范，调整样式<br>2. 输出：出版级图表 |
| **依赖** | B2 + A4 |

#### B-II 基准补充

##### B4 数据集适配

| 项 | 说明 |
|-----|------|
| **复用** | WorkerAgent 的代码适配能力 + `coding-agent` |
| **需要做的** | 1. 新建 MCP 工具 `bench_adapt`：给定数据集名 + 现有代码，生成适配代码<br>2. 内部调 A4 确认标准评测协议 + A3 分析现有数据接口 |

##### B5 执行与结果收集

| 项 | 说明 |
|-----|------|
| **完全复用** | 现有 `exec` + git worktree 隔离执行 + benchmark 结果解析 |
| **需要做的** | 新建 MCP 工具 `bench_run`：封装"worktree 创建 → 执行 → 收集 → 清理"流程 |
| **注意** | 与现有 WorkerAgent 的 benchmark 执行逻辑相同，可抽取共用函数 |

##### B6 结果校验

| 项 | 说明 |
|-----|------|
| **需要做的** | 新建 MCP 工具 `bench_validate`：调 A4 检索 SOTA 数值，对比判断合理性 |
| **依赖** | B5 + A4 |

---

### 阶段 3b：C 层（研究验证回环）— 核心

#### C1 推导森林数据结构

| 项 | 说明 |
|-----|------|
| **需要做的** | 1. 在 `plugin/src/models.ts` 新增类型定义：|

```typescript
// 推导森林节点
interface DerivationNode {
  id: string;
  type: "change" | "hypothesis" | "evidence" | "question";
  content: string;
  parent_ids: string[];       // 森林中的父节点
  child_ids: string[];
  source_branches: string[];  // 关联的 git 分支（来自 evo_get_lineage）
  literature_refs: string[];  // BibTeX keys
  experiment_ids: string[];   // 关联的 B 层实验
  status: "active" | "pruned" | "converged";
  depth: number;
  created_at: number;
  updated_at: number;
}

// 交汇点
interface ConvergencePoint {
  id: string;
  question: string;           // 深层动机 Q
  contributing_branches: string[];  // 交汇的推导分支
  evidence_ids: string[];
  verification_status: "pending" | "verified" | "rejected";
}

// 推导森林状态
interface DerivationForest {
  nodes: Record<string, DerivationNode>;
  convergence_points: ConvergencePoint[];
  iteration_count: number;
  status: "exploring" | "converging" | "done";
}
```

#### C2 MCP 工具注册

| 工具名 | 输入 | 输出 | 说明 |
|--------|------|------|------|
| `research_init_forest` | `evo_session_id` | `forest_id` | 从演化结果初始化推导森林（读取 lineage + status） |
| `research_add_node` | `forest_id, type, content, parent_ids, ...` | `node_id` | 新增推导节点 |
| `research_update_node` | `node_id, updates` | `ok` | 更新节点状态（如标记为 pruned） |
| `research_merge_nodes` | `node_ids[], merged_content` | `new_node_id` | 合并多个节点（迭代中动态重组） |
| `research_check_convergence` | `forest_id` | `{converged: bool, points: [...]}` | 检查是否有交汇点 |
| `research_get_forest` | `forest_id` | 完整森林结构 | 查询用 |
| `research_record_contribution` | `convergence_point_id, level` | `ok` | 贡献定级（主/辅助） |

#### C3 对接演化结果

| 项 | 说明 |
|-----|------|
| **衔接方式** | `research_init_forest` 内部调用 `evo_get_lineage()` + `evo_get_status()` |
| **数据流** | 演化状态中的 `individuals`（各变体分支 + fitness）→ 森林初始 `change` 节点 |
| **无需改现有代码** | 只读取 `EvolutionState`，不修改 |

#### C4 `/research-loop` Skill

| 项 | 说明 |
|-----|------|
| **需要做的** | 新建 `plugin/skills/research-loop/SKILL.md` |
| **驱动逻辑** | 实现文档中的 5 步迭代回环 |

```
/research-loop 的内部流程：

1. research_init_forest(evo_session)
2. LOOP:
   a. 以当前理解切入代码改动 → research_add_node(type="change")
   b. 反推：为什么有效？ → research_add_node(type="hypothesis")
   c. 调 A4 查文献 → research_add_node(type="evidence", literature_refs=[...])
   d. 调 B 层验证 → bench_adapt + bench_run + bench_validate
      → 支持：标记节点 converged，继续深挖
      → 不支持：research_update_node(status="pruned")，换分支
   e. research_check_convergence()
      → 未交汇：回到 a
      → 交汇：进入收束
3. 收束：
   a. 调 A4 验证交汇点 Q 的领域认知
   b. 调 B 层设计实验直接证明 Q
   c. research_record_contribution() 定级
4. 输出存 git：research/forest/ 目录
```

#### C5 ResearchAgent 定义

| 项 | 说明 |
|-----|------|
| **需要做的** | 新建 `plugin/agents/research_agent.md` |
| **与 ReflectAgent 的区别** | ReflectAgent 回答"这代学到什么"（面向下一代演化）；ResearchAgent 回答"为什么有效"（面向论文） |
| **可用工具** | `research_*` 系列 + A4 (`/ask-lit`) + B 层工具 + `read/exec` |

#### C6 Git 持久化

| 项 | 说明 |
|-----|------|
| **存储路径** | `research/forest/{forest_id}/` |
| **文件** | `forest.json`（完整状态）+ `iterations/iter_{N}.md`（每轮摘要） |
| **提交策略** | 每轮迭代自动 commit（与演化的"每代 commit"对齐） |

---

### 阶段 4：D/E 层（论文产出）

#### D 层：章节写作

| Skill | 输入 | 输出 | 依赖 |
|-------|------|------|------|
| `/write-method` | C 层推导森林（交汇点 + 主贡献分支） | 方法论章节 LaTeX | C 层 |
| `/write-experiment` | B 层实验结果 + 图表 | 实验章节 LaTeX | B + C 层 |
| `/write-related` | A4 文献检索结果 + 森林中的文献关系 | 相关工作 LaTeX | A + C 层 |
| `/write-intro` | C 层交汇点（深层动机 Q）+ 贡献列表 | 引言 LaTeX | C 层 |

#### E 层：论文组装

| Skill | 说明 |
|-------|------|
| `/paper-assemble` | 收集 D 层各章节 → LaTeX 模板合并 → 全文补全 → BibTeX 整合 → 一致性检查 |

> D/E 层细节待 C 层完成后再展开，当前只需预留 skill 占位。

---

## 三、新增文件清单（预估）

```
plugin/
├── src/
│   ├── vectordb.ts          [F2] 向量检索封装
│   ├── bibtex.ts            [F3] BibTeX 管理
│   └── models.ts            [C1] 追加 DerivationNode 等类型（编辑现有文件）
│
├── agents/
│   └── research_agent.md    [C5] ResearchAgent 定义
│
├── skills/
│   ├── search-lit/SKILL.md  [A1] 在线文献检索（内部 skill）
│   ├── ask-lit/SKILL.md     [A4] 文献问答（用户 skill）
│   └── research-loop/SKILL.md [C4] 研究验证回环（用户 skill）
│
├── server.ts                [A2/A3/B/C2] 追加 MCP 工具注册（编辑现有文件）
└── index.ts                 [A4/C4] 追加 skill 注册（编辑现有文件）

research/
├── refs/references.bib      [F3] BibTeX 文献库
└── forest/                  [C6] 推导森林持久化目录
```

---

## 四、对现有代码的修改范围

| 现有文件 | 修改内容 | 风险 |
|---------|---------|------|
| `plugin/src/models.ts` | 追加 `DerivationNode`, `ConvergencePoint`, `DerivationForest` 类型 | 低——纯追加，不改现有类型 |
| `plugin/server.ts` | 追加 `lit_*`, `code_qa`, `viz_*`, `bench_*`, `research_*` 工具注册 | 低——新增工具不影响现有 `evo_*` 工具的注册和逻辑 |
| `plugin/index.ts` | 追加 `/ask-lit`, `/research-loop` skill 注册 | 低——新增 skill 不影响现有 6 个 skill |
| `package.json` | 追加 lancedb 等依赖 | 低 |

**核心原则：只追加，不修改现有逻辑。** 新增模块与演化引擎通过 `evo_get_lineage()` / `evo_get_status()` 只读对接。

---

## 五、验收标准（按阶段）

### 阶段 1 验收
- [ ] `vectordb.ts` 可以 embed + 检索文本，返回 top-k 结果
- [ ] `bibtex.ts` 可以解析、去重、格式化 BibTeX 条目
- [ ] 单元测试通过

### 阶段 2 验收
- [ ] `/ask-lit "attention mechanism"` 能返回相关文献 + BibTeX
- [ ] 首次查询走在线检索，二次相同查询走本地向量库
- [ ] `code_qa` 能基于演化 lineage 回答代码问题

### 阶段 3 验收
- [ ] `research_init_forest` 能从演化结果初始化推导森林
- [ ] `/research-loop` 能完成至少一轮完整迭代（切入→反推→查文献→验证→检查交汇）
- [ ] B 层工具能在新数据集上跑 benchmark 并校验结果
- [ ] 推导森林每轮存 git，可 `git log` 追溯

### 阶段 4 验收
- [ ] `/write-method` 能从推导森林生成方法论章节
- [ ] `/paper-assemble` 能合并各章节为完整 LaTeX

---

## 六、风险与缓解

| 风险 | 缓解 |
|------|------|
| C 层回环不收敛（无限迭代） | 设置最大迭代次数 + 宽松交汇判定阈值 |
| 向量库性能不足 | lancedb 是嵌入式数据库，本地场景足够；大规模时可换 Qdrant |
| 在线文献检索受限（arXiv API 限流） | 本地库作为缓存层，减少重复查询 |
| B 层 benchmark 执行耗时长 | 复用现有 git worktree 隔离 + 支持 `quick_cmd` 快速评估 |
| D/E 层 LaTeX 质量不稳定 | 提供模板 + 多轮 LLM 校对 |
