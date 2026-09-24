# Eotion Agent 项目规范 v3

> 本文件是 Agent 的地图，不是项目百科全书。
> 项目事实写入代码、测试和 `docs/`；聊天历史只作为工作缓存。

- 项目：Eotion
- 定位：Web-first 的 Notion 类工作空间
- 主语言：TypeScript
- 默认工作流：Codex 主 Agent + 按难度路由的 SubAgent
- 主要使用：Codex
- 辅助使用：Claude Code

## 1. 开始前：先检索，再加载上下文

非平凡任务不要一次性读取整个仓库。

1. 先读 `docs/README.md` 和 `docs/context/README.md`。
2. 按任务需要读取 `README.md`、`docs/architecture/architecture.md`、`docs/roadmap.md`、相关 spec / ADR / runbook / 测试。
3. 优先用路径、symbol、引用、`rg`、LSP、Git history 和相关测试做精确检索。
4. 项目已接入语义检索、file search、向量库或检索 MCP 时，可作为第二路候选源；不可用时不要阻塞任务。
5. 合并去重并优先当前版本、直接行为证据和与目标最相关的内容，只形成当前工作单元所需的 Context Pack。

普通 feature / bugfix 尽量将有效上下文控制在约 20K–60K token；跨多个子系统时先检索再扩展。大窗口是上限，不是目标。

代码、测试、配置、日志和可重复运行结果优先于说明性文档。发现文档与真实行为不一致时，以可验证的当前行为为准并同步修正文档。

## 2. 不可违背的架构约束

- `apps/web` 是 Eotion **唯一的主 UI 实现**。
- `apps/desktop` 仅作为 Electron 壳，必须复用 `apps/web` 作为 renderer；不要创建第二套桌面 Vue 应用。
- `apps/mobile` 使用 Vue Lynx，定位为移动端 Shell + `<webview>`；主要内容继续复用同一个 Web App。
- 不要默认用 Lynx 重写完整移动端 UI；只有存在明确、可测量的性能或原生能力需求时，才针对具体页面原生化。
- Web 应用负责 Desktop / Tablet / Mobile 三种布局与交互模式；不要拆成三套前端项目。
- 服务端从 NestJS + Fastify 的**模块化单体**开始，不在没有明确需求前引入微服务。
- MongoDB 是服务端主数据库；Aliyun OSS 保存二进制资源，MongoDB 保存元数据。
- Web 本地持久化后续使用 IndexedDB；Desktop / Mobile 使用 SQLite 或平台本地存储适配器。
- Redis、Kafka 属于后续扩展能力，不是 v0.1 硬依赖。
- 编辑器统一使用 Tiptap 3；ProseMirror 只作为其底层引擎，在 Tiptap 抽象不足时通过 `@tiptap/pm/*` 按需使用。
- 不把 ProseMirror 作为第二套编辑器框架，也不要无明确、已验证理由直接添加 `prosemirror-*` 依赖。

## 3. 自动拆解与模型路由

简单、局部、低风险任务由主 Agent 直接完成，不为了“多 Agent”而拆分。

非平凡任务先拆成 1–4 个**可独立验证**的工作单元，并记录到 `.agents/current-task.md`。按行为边界和验证方式拆分，不按文件数量拆分。

| 难度 | 典型任务 | 首选 Agent | 模型 / 强度 |
| --- | --- | --- | --- |
| S0 | 找文件、读代码、总结 diff、定位测试 | `scout` | GPT-6 Luna / High |
| S1 | 机械修改、局部类型修复、简单测试脚手架 | `fast_worker` | GPT-6 Luna / High |
| S2 | 普通 feature、bugfix、API/DB 变更、明确边界的重构 | `worker` | GPT-6 Sol / Medium |
| S3 | 根因不明、跨抽象层、并发/事务/安全、高风险迁移 | `deep_solver` | GPT-6 Astra / Low 起步 |
| Review | 非平凡改动独立复核 | `reviewer` | GPT-6 Sol / High |

升级规则：

- Luna 两次仍无法准确定位，或任务开始需要跨模块权衡 -> Sol Medium。
- Sol 已有明确失败证据且仍无法找到根因 -> Sol High 或 Astra Low。
- Astra 从 Low 起步；只有新的失败证据表明推理仍不足时才升 Medium/High。
- 不把 Max/Ultra 当默认。
- 某模型因套餐、rollout 或工作区策略不可用时，回退到下一可用档位，不反复重试同一不可用配置。

## 4. SubAgent 协作

- 给每个 SubAgent 自包含的目标、范围、相关上下文、禁止事项、期望输出和验证要求。
- 读重任务优先给 `scout`；不要让 Astra 做大范围 grep。
- `deep_solver` 优先用于困难诊断和权衡；诊断后边界清楚时，把实现交回 `worker`。
- 只有相互独立、不会频繁修改同一批文件且并行确有收益的工作才并行。
- 多个写 Agent 不得同时修改同一组文件；存在冲突风险时改为串行。
- SubAgent 输出只是协作结果，主 Agent 负责最终决策、整合、验证与提交。
- 不向 SubAgent 传递凭据、token 或不必要的敏感信息。

## 5. 实现原则

- 先调查事实，再做判断；不要猜测未读取的代码、配置或运行行为。
- 优先解决根因，不做掩盖问题的临时补丁。
- 优先最小、清晰、可维护的修改，避免过度设计。
- 严格控制范围：不要顺手重构、升级依赖、格式化整个项目或修复无关问题。
- 平台特有能力必须放在 adapter / bridge 后面，不让业务层直接依赖 Electron、Lynx 或浏览器专有 API。
- 客户端共享的领域模型、协议、SDK、同步逻辑优先放入 `packages/*`。
- `packages/*` 尽量 framework-light，不无必要绑定 Vue、Electron、NestJS 或 Lynx。
- 不在多个客户端重复维护可以共享的 domain model、contract 或 API 类型。
- 添加新依赖前先确认 workspace 和现有依赖是否已提供能力。
- 不添加当前需求不需要的兼容层或抽象。

## 6. 验证与 Review

- 完成前必须执行与修改直接相关的最小充分验证：测试、typecheck、lint、build、integration/smoke/E2E 中适用项。
- Bugfix 优先建立最小复现或回归测试；新 feature 优先明确行为契约与 Done 条件。
- 验证失败时调查真实根因，不通过削弱断言、跳过测试或隐藏错误来“通过”。
- 非平凡改动完成后优先交给独立 `reviewer` 复核真实 blocker；纯风格意见不应阻塞。
- 无法完成某项验证时，明确说明原因、替代验证与剩余风险。

## 7. 项目记忆与文档写回

长期记忆只保存稳定、未来会复用的知识：

- 架构事实 -> `docs/architecture/`
- 技术/架构决策及替代方案 -> `docs/decisions/`
- 产品或行为契约 -> `docs/specs/`
- 开发、测试、部署、排障 -> `docs/runbooks/`
- 长期经验 -> `docs/knowledge/`
- 复杂执行计划 -> `docs/exec-plans/`
- 检索入口和模块索引 -> `docs/context/README.md`
- 当前短期任务 -> `.agents/current-task.md`
- 跨会话/跨 Agent 交接 -> `.agents/handoff.md`

任务过程、临时猜测和一次性日志不要污染长期文档。能由自动化测试稳定表达的行为优先写成测试，而不是只写自然语言记忆。

## 8. 沟通与风险

- 全程使用中文回复。
- 发现更优路径可以主动提出，但不要擅自扩大需求。
- 改动会改变需求、整体架构、公共 API、数据模型、同步协议或业务语义时，先说明影响并请求确认。
- 低风险、可逆、目标明确的任务可以自主完成。
- 高风险、不可逆、生产环境操作或存在关键歧义时暂停并请求确认。

## 9. 完成标准

任务完成至少满足：

- 用户目标已实现且没有主动扩大范围。
- 相关验证已执行并通过，或明确记录未完成项及原因。
- 最终 diff 已复核，没有明显无关修改或回归。
- 公共行为、配置、API、数据模型、运行方式或重要架构变化已同步到对应正式文档。
- 需要跨会话继续时已更新 `.agents/handoff.md`。

## 10. 文档入口

- 文档地图：`docs/README.md`
- RAG / 上下文检索：`docs/context/README.md`
- 架构：`docs/architecture/architecture.md`
- 架构决策：`docs/decisions/README.md`
- 行为规范：`docs/specs/README.md`
- Roadmap：`docs/roadmap.md`
- 开发与测试：`docs/runbooks/README.md`
- 长期知识：`docs/knowledge/README.md`
- 执行计划：`docs/exec-plans/README.md`
- 当前任务：`.agents/current-task.md`
- 跨会话交接：`.agents/handoff.md`

## 11. 当前基础运行目标

以下命令应能独立运行：

```bash
pnpm dev:web
pnpm dev:desktop
pnpm dev:mobile
pnpm dev:api
```

开发阶段按 `docs/roadmap.md` 推进，不提前实现后续 Phase。

## 12. 环境与提交

- 所有文本文件使用 UTF-8 无 BOM。
- Windows / PowerShell 环境优先使用 PowerShell 7（`pwsh`）。
- 避免无必要改变原文件编码或换行风格。
- 每完成一个独立逻辑变更单元必须提交一次 commit。

Commit 格式：

```text
<type>(<scope>): <subject>

- item 1
- item 2

<Note: 可选，说明背景、原因、影响或注意事项>
```
