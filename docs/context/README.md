# Eotion Context Retrieval / RAG

本目录是 Agent 的检索入口，不是第二份代码仓库。目标是先召回少量高价值上下文，再让模型推理和实现。

## 默认检索流水线

1. **Query rewrite**：把任务改写成行为、模块、symbol、错误文本、测试名、runtime 和当前 Roadmap Phase 等检索线索。
2. **Exact retrieval**：优先路径、symbol/LSP、`rg`、引用关系、相关测试和 Git history。
3. **Document retrieval**：从本页索引进入直接相关的 roadmap / architecture / spec / ADR / runbook。
4. **Semantic retrieval（可选）**：项目已有 file search、向量库或检索 MCP 时，再追加语义召回；没有就跳过。
5. **Rerank**：优先当前 branch/commit、真实运行或测试证据、与当前工作单元直接相关的候选；去除重复和过期内容。
6. **Context Pack**：只装载解决当前工作单元需要的少量上下文，再交给对应 Agent。

## 模块索引

| 领域 / 模块 | 代码入口 | 关键文档 | 常用检索线索 |
| --- | --- | --- | --- |
| Web 主 UI | `apps/web/src/` | `architecture/architecture.md` | Vue、router、WorkspaceView、runtime、layout、input |
| Editor（P2 起） | `apps/web/src/` | `roadmap.md`、architecture §6 | Tiptap、@tiptap/pm、selection、transaction、IME、slash command |
| Desktop Shell | `apps/desktop/src/` | architecture §2 | Electron、preload、renderer、IPC |
| Mobile Shell | `apps/mobile/src/` | `p1-mobile-demo.md`、architecture §3 | Lynx、webview、HarmonyOS、bridge、lifecycle |
| API | `apps/api/src/` | architecture §4、`architecture/agent-integration.md` | NestJS、Fastify、health、module、MCP |
| Contracts | `packages/contracts/src/` | architecture / specs | DTO、contract、protocol、shared type |
| Domain | `packages/domain/src/` | architecture / specs | domain model、workspace、page、block |
| SDK | `packages/sdk/src/` | architecture / specs | typed client、API |
| Local storage (P3) | `packages/storage/src/`、`apps/web/src/storage/`、`apps/desktop/src/main/sqlite-store.ts` | `p3-local-first.md` | LocalStore、IndexedDB、SQLite、oplog、reconnect |
| Roadmap / Phase | `docs/roadmap.md` | 本页 | P0…P7、exit criteria、scope |

随着稳定模块增加再维护索引。只记录入口和关键词，不复制源码实现。

## Eotion 特有的检索约束

- 先确认任务属于哪个 Roadmap Phase；除非用户明确要求，不跨 Phase 提前实现。
- UI 问题首先从 `apps/web` 查起，因为 Browser / Electron / Mobile WebView 共用同一套主 UI。
- 平台差异再沿 Desktop preload/IPC 或 Mobile WebView/bridge 向外检索，不先复制业务逻辑到平台壳。
- 编辑器问题先查 Tiptap 上层 Extension / Command；只有具体证据表明抽象不足时才检索 `@tiptap/pm` 底层能力。
- 历史讨论、旧 PR 或向量召回只能作为背景，不能覆盖当前代码和测试。

## Context Pack 建议

普通 feature / bugfix 尽量约 20K–60K token；跨 Web/Desktop/Mobile/API 时先按工作单元拆分，再按需扩展到约 60K–120K。

一个高质量 Context Pack 通常只包含：

- 当前目标和 Done 条件；
- 直接相关的少量代码与 symbol；
- 相关测试；
- 1–3 份直接相关正式文档；
- 已观察到的失败证据或运行结果；
- 必须遵守的架构/兼容性约束。

不要因为模型支持大窗口就把整个 monorepo 塞入上下文。
