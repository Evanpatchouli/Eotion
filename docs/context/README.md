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
| Web 主 UI | `apps/web/src/` | `architecture/architecture.md`、`p5-product-shell.md`、`p5-page-tree.md`、`p5-real-sync.md`、`p5-settings.md`、`p5-ui-ux-foundation.md`、`design/*` | Vue、router、ProductShell、auth、productWorkspaces、productPages、productSync、PageTree、PageView、Settings、Theme、preferences、UI/UX audit、design system、visual baseline、runtime、layout、input |
| Public site | `apps/site/` | `runbooks/public-site.md`、`runbooks/versioning.md` | VitePress、release metadata、changelog、download URL、site origin、Docker |
| Editor（P2 / P5.3～P5.5） | `apps/web/src/components/editor/`、`apps/web/src/editor/`、`apps/web/src/views/PageView.vue` | `roadmap.md`、`p2-editor-demo.md`、`p5-real-page-editor.md`、`p5-real-sync.md`、`p5-attachments.md`、architecture §6 | Tiptap、BlockIdentity、blockCodec、PagePersistence、LocalStore、sync、IME、slash command、eotionImage、eotionFile、attachmentCleanup、Morphicons |
| Editor foundation (P5.8.2) | `apps/web/src/components/editor/DocumentEditor.vue`、`apps/web/src/components/editor/EotionEditor.vue`、`apps/web/src/editor/useDocumentEditor.ts`、`apps/web/src/editor/editorDocument.ts`、`apps/web/src/editor/blockCodec.ts` | `design/editor-architecture-spike.md` | useDocumentEditor、EditorDocument、JSONContent、Block 映射、editable、aria、focus、lifecycle |
| Desktop Shell | `apps/desktop/src/` | architecture §2、`runbooks/desktop-production.md`、`runbooks/desktop-packaging.md` | Electron、preload、renderer、IPC、production-protocol、Windows packaging、EOTION_DESKTOP_API_ORIGIN、Cookie Session |
| Mobile Shell / Native Hosts | `apps/mobile/src/`、`apps/mobile-hosts/`、`scripts/package-mobile.mjs` | `p1-mobile-demo.md`、architecture §3、`runbooks/mobile-native-hosts.md` | Lynx、webview、Android、HarmonyOS、Gradle、Hvigor、signing、lifecycle |
| API | `apps/api/src/` | architecture §4、`p4-server-domain.md`、`p4-auth-session.md`、`p4-http-api.md`、`p4-sync.md`、`p4-file-storage.md`、`architecture/agent-integration.md` | NestJS、Fastify、health、Mongo、User、Auth、Session、WorkspacePermission、HTTP、repository、sync receipt、FileObjectStorage、MCP |
| MCP（P6.1 / P6.2） | `apps/api/src/modules/mcp/`、`apps/api/src/modules/server-domain/services/mcp-token.service.ts` | `p6-mcp.md`、`architecture/agent-integration.md` | /mcp、Streamable HTTP、McpToken、mcp_credentials、Bearer、eotion_list_workspaces、eotion_list_pages、eotion_search_pages、eotion_get_page、MCP read DTO |
| Contracts | `packages/contracts/src/` | `p4-http-api.md`、`p4-sync.md` | DTO、runtime schema、contract、protocol、sync operation |
| Domain | `packages/domain/src/` | `p4-server-domain.md`、architecture / specs | domain model、workspace、page、block、file metadata |
| SDK | `packages/sdk/src/` | `p4-http-api.md`、`p4-sync.md` | typed client、Cookie credentials、API error、OperationTransport |
| Local storage / product sync (P3 / P5.4) | `packages/storage/src/`、`apps/web/src/storage/`、`apps/web/src/stores/productSync.ts`、`apps/desktop/src/main/sqlite-store.ts` | `p3-local-first.md`、`p4-sync.md`、`p5-real-sync.md`、`verification/device/p3-local-first.md` | LocalStore、snapshot hydrate、Push-before-Pull、page.move、Web/Mobile WebView IndexedDB、Electron SQLite、offline auth、oplog、reconnect |
| Roadmap / Phase | `docs/roadmap.md` | 本页 | P0…P7、exit criteria、scope |

随着稳定模块增加再维护索引。只记录入口和关键词，不复制源码实现。

P5.6 Settings 已完成：`apps/web/src/layouts/SettingsLayout.vue`、`views/settings/`、`settingsNavigation.ts`、`theme.ts`、`stores/preferences.ts`；验收入口 `tests/product-settings.spec.ts`、`tests/theme.spec.ts`、`tests/theme-production.spec.ts`，完整状态见 `docs/p5-settings.md`。账号资料链路检索 `ProfileUpdateRequestSchema`、`ChangePasswordRequestSchema`、`updateProfile`、`changePassword`、`credentialVersion`、`revokeAllByUserId`；P5 Final Acceptance 与移动宿主真机边界单独保留。

## Eotion 特有的检索约束

P5.7.5.3 共享交互入口：`components/ui/EotionNavItem.vue`、`components/product/SyncStatus.vue`、`components/ui/EotionCommandOverlay.vue`；契约与验证见 `docs/design/interaction-foundation-implementation.md`，Playwright 入口 `tests/interaction-foundation.spec.ts`。Command 本阶段只提供容器，后续 Search / Command 消费。

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


P5.7 已进入 closeout：Quiet Studio 方向与正式 Product UI 已通过迭代实现和 review 收敛；P5 已存在能力的 Design System v1、六个核心 Screen Spec 与 visual regression 见 `docs/design/design-system-v1.md`、`docs/design/core-screen-spec.md`、`docs/design/visual-acceptance.md`。原计划的预实施 Gate A 顺序没有完整执行，最终用户视觉签字仍待完成；不要按旧文档重复实现 Quiet Studio。
