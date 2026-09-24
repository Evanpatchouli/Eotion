# Eotion Agent 项目规范

> 本文件是 Agent 的**地图（map）**，不是项目百科全书。
> 项目知识、架构、决策、路线图和运行说明请按需读取 `docs/` 中的对应文档。

- 项目：Eotion
- 定位：Web-first 的 Notion 类工作空间
- 主要使用：Codex
- 辅助使用：Claude Code
- 主语言：TypeScript

## 1. 开始前先读

按当前任务需要读取，不要无目的加载全部文档：

1. `README.md`
2. `docs/architecture/architecture.md`
3. `docs/roadmap.md`
4. `docs/codex-bootstrap.md`（首次跑通或环境初始化时）

代码、测试、配置、日志和实际运行结果优先于过时文档。发现文档与真实行为不一致时，以可验证的当前行为为准，并在合适的位置同步修正文档。

## 2. 不可违背的架构约束

- `apps/web` 是 Eotion **唯一的主 UI 实现**。
- `apps/desktop` 仅作为 Electron 壳，必须复用 `apps/web` 作为 renderer；不要创建第二套桌面 Vue 应用。
- `apps/mobile` 使用 Vue Lynx，定位为移动端 Shell + `<webview>`，主要内容继续复用同一个 Web App。
- 不要默认用 Lynx 重写完整移动端 UI；只有存在明确、可测量的性能或原生能力需求时，才允许针对具体页面原生化。
- Web 应用负责 Desktop / Tablet / Mobile 三种布局与交互模式；不要拆成三套前端项目。
- 主语言为 TypeScript。
- 服务端从 NestJS + Fastify 的**模块化单体**开始。
- MongoDB 是服务端主数据库。
- Aliyun OSS 存放二进制资源，MongoDB 保存资源元数据。
- Web 本地持久化后续使用 IndexedDB。
- Desktop / Mobile 本地持久化后续使用 SQLite 或平台本地存储适配器。
- Redis、Kafka 属于后续扩展能力，不是 v0.1 的硬依赖。
- 在没有明确的扩展、隔离或部署需求前，不引入微服务。

## 3. 沟通与决策

- 全程使用中文回复。
- 先调查事实，再做判断；不要猜测未读取的代码、配置或运行行为。
- 优先完成用户目标，不为流程本身增加流程。
- 发现更优路径可以主动提出，但不要擅自扩大任务范围。
- 如果改动会改变需求、整体架构、公共 API、数据模型、同步协议或业务语义，先说明影响并请求确认。
- 低风险、可逆、目标明确的任务可自主完成，不需要逐步请求批准。
- 高风险、不可逆、生产环境操作或存在关键歧义时，暂停并请求确认。

## 4. 上下文与知识管理

- `AGENTS.md` 只保存长期稳定、跨任务有价值的规则、架构硬约束和项目入口。
- `docs/` 是项目知识的主要记录系统（source of truth）。
- 只读取与当前任务直接相关的 README、架构文档、路线图、运行说明、测试和现有实现。
- 历史经验只有与当前问题相关时才检索。
- 不要为了“完善文档”把大量实现细节重新塞回 `AGENTS.md`。
- 需要跨会话、跨 Agent 或暂停后继续时，优先更新 `.agents/handoff.md`；若目录不存在，可在首次需要时创建。

## 5. 任务执行

- 简单、局部、低风险任务可直接执行。
- 非平凡任务先形成简短计划；计划用于保持方向，不写成流水账。
- 按完整逻辑变更单元组织工作，不按文件数量机械拆分。
- 只有存在明确独立工作单元且并行确有收益时才使用子 Agent。
- 子 Agent 的输出只是协作结果，主 Agent 必须复核关键结论、代码改动和验证证据。
- 不向子 Agent 传递凭据，也不授权未明确要求的破坏性操作。
- 严格控制范围：不要顺手重构、升级依赖、格式化整个项目或修复无关问题。
- 发现无关问题时，除非直接阻塞当前任务，否则记录后继续。

## 6. 实现原则

- 优先解决根因，不做掩盖问题的临时补丁。
- 优先最小、清晰、可维护的实现，避免过度设计。
- 遵循现有架构、命名、依赖和编码习惯，除非任务明确要求改变。
- 局部修改优先，避免无必要的整文件重写。
- 不修改与当前任务无关的文件。
- 平台特有能力必须放在 adapter / bridge 后面，不让业务层直接依赖 Electron、Lynx 或浏览器专有 API。
- 客户端共享的领域模型、协议、SDK、同步逻辑优先放入 `packages/*`。
- `packages/*` 尽量保持 framework-light，避免无必要绑定 Vue、Electron、NestJS 或 Lynx。
- 不在多个客户端重复维护可以共享的 domain model、contract 或 API 类型。
- 添加新依赖前，先确认现有 workspace package 或现有依赖是否已提供该能力。
- 不添加当前需求并不需要的兼容性代码或抽象层。

## 7. 客户端约束

- `apps/web` 是产品 UI 的唯一来源。
- Desktop / Tablet / Mobile 通过布局与交互模式适配，而不是复制页面实现。
- Electron 侧仅承载窗口、生命周期、系统集成、IPC、本地数据库等桌面能力。
- Electron 特有 API 必须通过 preload / typed bridge 暴露，不允许 Web UI 随处判断 `window.electron`。
- Lynx 侧优先保持轻量，只承担 App Shell、WebView、生命周期、原生桥接和必须的本地能力。
- 编辑器、页面树、数据库视图等核心产品能力优先在 Web 层实现并三端复用。
- 编辑器统一使用 Tiptap 3；ProseMirror 仅作为其底层引擎，在 Tiptap 抽象不足时通过 `@tiptap/pm/*` 按需使用。不要把 ProseMirror 作为第二套编辑器框架，也不要无明确理由直接添加 `prosemirror-*` 依赖。

## 8. 服务端约束

- `apps/api` 使用 NestJS + Fastify。
- 初期保持模块化单体，按业务模块拆分代码，而不是按服务拆部署单元。
- MongoDB 为主数据源。
- Redis 只在缓存、会话、Presence、分布式协调等存在明确需求时引入。
- Kafka 只在存在明确异步事件流、解耦消费方或吞吐需求时引入。
- 文件上传优先采用客户端直传 Aliyun OSS + 服务端签名/授权模式，避免无必要经 API 中转大文件。
- 离线同步应围绕领域操作、同步协议或 CRDT 设计，不做 MongoDB 与 SQLite 的数据库级逐表复制。

## 9. 验证

- 完成前必须验证本次修改。
- 优先执行与改动直接相关的最小验证集：测试、类型检查、lint、构建、集成测试、smoke/E2E 等。
- Bug 修复优先建立可重复的复现和验证方式；适合自动化时补充回归测试。
- 测试或验证失败时，优先调查并修复根因，不绕过失败。
- 无法完成某项验证时，明确说明原因、已完成的替代验证和剩余风险。

## 10. 完成标准

任务完成至少满足：

- 用户需求已实现，没有主动扩大范围。
- 相关验证已执行并通过，或明确记录未完成项及原因。
- 修改范围符合预期，没有明显回归。
- 用户可见行为、配置、API、运行方式或重要架构发生变化时，相关文档已同步。
- 如任务需要跨会话继续，已更新 `.agents/handoff.md`。

## 11. 当前基础运行目标

以下命令应能独立运行：

```bash
pnpm dev:web
pnpm dev:desktop
pnpm dev:mobile
pnpm dev:api
```

首次跑通后，后续开发按 `docs/roadmap.md` 推进。

## 12. 环境与文件

- 所有文本文件使用 UTF-8 无 BOM。
- Windows / PowerShell 环境优先使用 PowerShell 7（`pwsh`）。
- 修改文本文件时避免改变原有编码或换行风格；存在编码风险时在完成前验证。

## 13. 代码提交

每完成一个独立的逻辑变更单元，必须提交一次 commit。每次 commit 格式：

```text
<type>(<scope>): <subject>

- item 1
- item 2

<Note: 可选，说明本次变更的背景、原因、影响或注意事项>
```

示例：

```text
feat(api): add user registration endpoint

- Implemented user registration API with email verification
- Added unit tests for the new endpoint
- Updated API documentation to include the new endpoint

Note: This change introduces a new feature for user registration, which is part of the upcoming release. Please review the API documentation for any necessary updates to client applications.
```
