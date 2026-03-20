# 调研文件夹

> 调研日期：2026-03-17

## 文件说明

| 文件 | 内容 |
|------|------|
| `01_openclaw_existing_capabilities.md` | OpenClaw 当前**已有**的全部能力（内置工具、渠道、LLM 支持、协议层、系统运维） |
| `02_compatible_products_capabilities.md` | 兼容产品现有能力对比（QClaw、WorkBuddy、ArkClaw、ClawWork、PicoClaw 等） |
| `03_evo_anything_analysis.md` | 本仓库分析：干什么、依赖哪些 OpenClaw 现有能力、增加了哪些新能力、当前没有什么 |
| `04_ecosystem_capability_map.md` | **生态能力全景图**：三层基础设施（平台内置工具 / 官方 Skills 53个 + Extensions 74个 / 社区 5,366+ skills）的完整能力清单，以及 Evo-anything 当前用到了哪些、还有哪些高价值能力尚未接入 |
| `05_a_layer_knowledge_qa.md` | **能力分层架构**：A-F 六层架构定义（知识检索 / 实验执行 / 研究验证回环 / 章节写作 / 论文组装 / 基础设施） |
| `06_implementation_roadmap.md` | **A-F 分层架构实施路线图**：将分层架构映射到现有系统的具体实施计划，含任务明细、文件清单、验收标准 |

## 核心结论

**Evo-anything 是什么：**
OpenClaw 的 Plugin + MCP Server 组合，实现"LLM 驱动的代码自动演化"——通过消息（WhatsApp/Telegram 等）一句话触发，全自动搜索/克隆/跑基线/演化/推最优分支/发报告。

**它怎么依赖 OpenClaw 现有能力：**
- 用 `exec` 跑 git 命令和 benchmark
- 用 `read/write` 读写代码变体
- 用 `browser` 搜索 SOTA 方法
- 用消息渠道推送进度报告
- 完全站在现有能力上，不重造轮子

**它升华了什么（OpenClaw 原来没有的）：**
1. 有状态的演化状态机（evo-engine MCP Server）
2. 结构-功能协同演化协议（U2E，无需模板、全局多目标）
3. 多 Agent 分工框架（5 类专职 Agent + PolicyAgent 安全审查）
4. 结构化演化记忆（防重复失败、跨代经验积累）
5. git 分支作为实验单元（完整可追溯）
