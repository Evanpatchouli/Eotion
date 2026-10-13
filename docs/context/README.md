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

P8.1 Database 检索入口：`packages/domain/src/database.ts`、`packages/contracts/src/index.ts`、`apps/api/src/modules/server-domain/services/database.service.ts`、`repositories/database.repository.ts`、`schemas/database*.schema.ts`、`apps/web/src/editor/databaseNodes.ts` 与 MCP read contract。核心行为与边界见 `docs/p8-database.md`；Database 数据独立于 Page/Block snapshot，仅引用继续既有 sync。

P8.2 Inline Database / Table View 检索入口：`apps/api/src/modules/http-api/database.controller.ts`（最小 HTTP 入口）、`apps/web/src/services/productDatabases.ts`（应用服务）、`apps/web/src/components/editor/DatabaseNodeView.vue`（Table 与 Record/Page 导航）、`apps/web/src/views/PageView.vue`（原子插入与结果恢复）、`apps/web/tests/product-database.spec.ts`（产品回归）。P8.2 交付时 Table 只读取基础属性，P8.3 编辑能力见下文；linked view 绑定已有 View，不复制数据，未知提交结果的防重复状态仅保留在客户端会话中。

P8.3 Properties / Record Editing 沿用以上入口；新增检索 `updateProperty`、`deleteProperty`、`updateRecordCell`、`DatabaseTableRecord`、`validateStoredDatabaseRecordValues`、`expectedDatabaseVersion`、`expectedPageUpdatedAt`、`refreshLoadedWindow`。`packages/domain/src/database.ts` 区分无 title 副本的持久化 Record 与 Page.title 读投影；Database/Property/Record 条件更新和事务清理在既有 service/repository，真实 HTTP 回归见 `apps/api/src/modules/http-api/database-http.test.ts`。Web application service 只做在线 typed mutation，Database 数据不进入 LocalStore/oplog；已加载 linked Table 刷新保留分页深度。正式类型/空值/标题/并发边界见 `docs/p8-database.md`。

P8.4 Views / Filter / Sort 沿用以上入口；按 `DatabaseViewConfig`、`validateDatabaseViewConfig`、`createView`、`updateView`、`deleteView`、`queryTableWindow`、`touchReferenceFence` 检索独立配置、事务生命周期和服务端查询。默认无筛选/排序走 `listWindow` 索引分页与批量 Page 投影；动态查询走受校验的 Mongo 映射，游标绑定作用域、配置和版本。六类型 operator、empty/tie-break、Property/option 清理与 online-only 边界见 `docs/p8-database.md`；真实查询成本/权限/并发回归在 `server-domain/database.test.ts` 与 `http-api/http-api.test.ts`，linked/列配置/失败恢复/390px 回归在 `product-database.spec.ts`。

P8.5 Advanced Properties 沿用相同入口；检索 `FormulaExpression`、`validateDatabasePropertyDependencies`、`evaluateDatabaseFormula`、`evaluateDatabaseRollup`、`projectDerived`、`touchAdvancedReferenceFence`、`deleteRecord`、`record-options`。Relation 保存有界 Record ID 数组；Rollup/Formula 只在服务端读取时计算，schema 生命周期验证依赖图与类型，跨库引用/删除共用事务 fence。派生 Filter/Sort 明确拒绝，Page.title、Database online-only 与 MCP 边界不变。正式 AST、aggregation 矩阵、成本上限和删除语义见 `docs/p8-database.md`。

P8 Database UX 收敛沿用同一数据域与 Table View；新增检索 `DatabaseNavigationItem`、`Page.role`、`listNavigationPagesByWorkspace`、`DatabasePageView`、`DatabaseRecordHost`、`EotionProductOverlay`、`productOverlay`、`databaseContent`。普通 Page Tree 只读取 navigation projection，Record Page 仍留在完整 snapshot 并可按 pageId 直接打开；Database navigation 由独立只读 HTTP/SDK 查询投影旧 Block 引用，不复制 Record body。Record/Property 打开方式按 desktop/tablet/mobile 分别持久化，正式行为和兼容边界见 `docs/p8-database.md` 的「Database UX 收敛」。

P9.1A Generic View Records 沿用同一 API service / controller；检索 `getViewRecords`、`DatabaseViewRecordsQuery`、`DatabaseViewRecordsResponse`、SDK `getDatabaseViewRecords`。Legacy `getTable` 委托 generic seam，table query/response 保留为兼容别名。P9.2 检索 `DATABASE_VIEW_TYPES`、`DatabaseViewType`、`DatabaseViewConfig.options`；Domain/Contracts/Mongo 支持 table/list/board，Property repair 保留扩展字段。P9.4A 检索 `DatabaseBoardViewOptions`、`DatabaseBoardViewConfig`、`validateDatabaseViewConfig` 的 viewType 参数与 `groupByPropertyId`；Board grouping 可缺省，存在时只引用本库 select 与 options 数组，未知 options 保留。P9.4B 检索 `hasBoardGroupingProperty`、`deleteProperty`、`changePropertyType`：同库 Board grouping dependency 禁止 Property 删除与 select → 非 select，返回 409，不自动清空 grouping；select option cleanup 与 Table/List repair 保持。P9.5A Web 已支持 Table / List / 只读 Board；检索 DatabaseBoardView、DatabaseNodeView renderer routing 与 product-database.spec.ts 的 board renderer 定向测试。Board 复用 generic records / product loading / record opening；P9.5B-1 显式分组 picker 经 changeBoardGroup 复用 updateProductDatabaseRecordCell 与成功 records refresh，失败保持状态并提供显式刷新；P9.5B-2 原生 drag/drop 与 picker 共用 string|null grouping mutation，未分组列保持可用，同列 no-op，Board savingCell 期间通知延后合并。P9.5C-2 检索 `groupingProperties`、`saveGrouping`、`saveViewConfig` 与 `updateProductDatabaseView`：Board settings 只允许当前库 select Property，复用 View PATCH/CAS，保留未知 options，清除只删除 `groupByPropertyId`；Table/List 不显示，Phone 沿用既有 bottom drawer。P9.6B 继续检索 `loadedViewIdentity`、`viewReady`、`viewIdentityEpoch`、`saveViewConfig` 与 `data-view-id` / `data-view-ready`，重点查看旧 View PATCH 返回后的 identity fence、View tuple watch/卸载失效顺序、Editor/NodeView identity 回归和 product-database.spec.ts 的 delayed success/409、A→B→A、Table/List/Board matrix。正式契约见 `docs/p9-multi-view.md`，定向回归见 `product-database.spec.ts` 的 Board grouping settings 与 P9.6B verification tests。

P9 Final Acceptance（2026-10-13）：**P9 FINAL PASS**。完整 Web Product 367/367（workers=1/retries=0）、P9 三尺寸/Light-Dark 矩阵与 lifecycle 补验 65/65、既有 visual 7/7；真实 Mongo Database/API 与 P6 MCP 回归、Domain/Contracts/SDK、全部相关 typecheck/build 通过。正式证据入口为 [P9 Final Acceptance](../p9-final-acceptance.md)，行为契约仍见 [P9 Multi-View](../p9-multi-view.md)。P8 保持 SEALED，模型/generic records/storage/MCP/identity fence 边界不变；本次只有验收测试适配与文档收口，结束后停止。


P10–P15 Roadmap（2026-10-13）：0.0.1 已发布；后续固定映射为 P10 Database MCP Extension → 0.0.2、P11 Timeline → 0.0.3、P12 Gallery → 0.0.4、P13 Calendar → 0.0.5、P14 Chart → 0.0.6、P15 MCP Full Adaptation → 0.1.0。检索 P10 时重点关注 MCP Database DTO / scope / pagination / CAS / idempotency / generic records；P11 检索 Timeline/date range/view options；P12 检索 Gallery/card projection/cover；P13 检索 Calendar/date mutation/month view；P14 检索 Chart/aggregation/server-side aggregation；P15 检索 MCP full adaptation/view config/capability discovery。所有新 View 继续复用 Database/Property/Record/View 与 generic records，不建立 renderer-specific persistence；Chart 聚合必须服务端执行。正式阶段目标与边界见 `docs/roadmap.md`。


P11 Timeline 产品基准（2026-10-13）：用户要求产品结构/交互以 Notion Timeline 为直接基准。正式标准见 [P11 Timeline](../p11-timeline.md)。检索重点：`TimelineView`、`TimelineViewOptions`、date range / datetime、time ruler、horizontal scrollbar、today line、move/resize range、offscreen jump、Frozen Table、dependency self-relation / shift strategy、generic View row ordering。硬要求包括：底部真实水平滚动条；当前日期可视时贯穿 canvas 的红色 today line；Hour/Day/Week/Bi-week/Month/Quarter/Year scale；单 Date range 与独立 Start/End 两种 source；bar move/左右 resize 写回 generic Date mutation + CAS；左表可隐藏且与 rows 对齐；dependency 不创建 Timeline-specific persistence。P11.1A 已冻结 `{ start, end?, timeZone? }` 与 legacy string；P11.1B 通用 Date 数据链路已完成 / PASS，完整比较/投影契约见 §10.4。当前正式版本仍为 0.0.1；P10 尚未实施，不能虚报完成；P11.1C 配置契约见 §21；renderer 尚未实现。

P11.1B 检索入口：`packages/domain/src/date.ts` 的 `isValidDatabaseDateValue` /
`normalizeDatabaseDateValue` / `getDatabaseDateStartInstant` / `projectDatabaseDateToFormulaDate`，
`packages/domain/src/database.ts` 的 Date validator / Formula evaluator，Contracts Record Create /
Cell Update，`DatabaseRecordRepository.queryTableWindow` 与 `DatabaseNodeView.vue` Date Cell。
Date-only 按 UTC 零点与 datetime instant 混排；日期 Filter 和 Formula date 按 start 的 UTC
日历日。持久化保留 wire shape、end / timeZone，cursor 使用同一 start 键和原版本 fence。
Rollup / 类型转换范围保持；不增加 Timeline 专用 Record、API 或 MCP 工具。

P11.1B 验收证据见 [Generic Date Data Path](../verification/p11-1b-generic-date.md)：真实 Mongo
19/19、完整 Web Database 111/111、Domain 41/41、Contracts 24/24；相关 consumer、
typecheck/build 与独立复核通过。B 阶段完成后停止；P11.1C 的配置契约入口见下文。

P11.1C 检索入口：`DATABASE_VIEW_TYPES`、`TimelineViewOptions` /
`isValidTimelineViewOptions`、`DatabaseViewConfig.options.timeline` 和
`validateDatabaseViewConfig(..., view.type)`。实际 wire shape 冻结在
[P11 §21](../p11-timeline.md#21-view-config-实际契约p111c-冻结)：dateSource 判别联合、
七种 scale（有效默认 month）、独立 Frozen Table 投影、self Relation dependency 的明确
方向和三种 shift 策略。结构验证复用原 Create/Update DTO；outer options 未知字段保留，
Property 引用语义仅 Timeline 应用。CRUD/generic records/版本 cursor fence 复用，Web
selector 可切 Timeline 并明确占位，无创建入口或 renderer。
P11.1D 生命周期实现入口：`DatabaseService.assertViewPropertyDependencies` 与内部
`DatabaseViewPropertyDependency`，统一 Board/select、Timeline dateSource/date 与
dependency/self-relation 硬引用409。deleteProperty独立修复Frozen Table visible/order，
updateProperty/changePropertyType/deleteProperty全部按真实view.type校验候选schema；
共享Database CAS与Property/View CAS保护事务/并发，旧Board专用repository查询已移除。
证据见[P11.1D验收](../verification/p11-1d-property-lifecycle-fence.md)。`linkInPage`
继续Table-only；P11.2.0 架构与下一轮接续见下文。

P11.2.0 Renderer Architecture 检索入口：
[Timeline Renderer Architecture](../architecture/timeline-renderer.md)，产品标准摘要见
[P11 Timeline](../p11-timeline.md) 的「P11.2 Renderer Architecture」章节。
拟实施模块位于 `apps/web/src/components/editor/timeline/`：projection、coordinates、scale、
ruler、layout、viewport；P11.2.0 当时仅文档，P11.2A 已创建 Shell/坐标模块，projection/layout 仍未实施。坐标统一为 renderer logical instant
→ pixel，date-only 使用显示时区的日历日边界；all-day inclusive end 只生成独立视觉边界，
不改变原 end / 显式零长度 range。generic records / cursor / View config / P9 fence 保持。
`configuredScale` 是原共享配置，`effectiveScale` 可由实例临时 override 改变；P11.2A zoom
不 PATCH、不触发 records 重拉，只有未来显式共享配置保存复用原 CAS/通知/cursor fence。
P11.2A 仅 Shell + Coordinate Engine：ruler/grid/native horizontal scrollbar/today/
navigation，不实现 bar、Frozen Table、mutation、dependency。P11.2.0 基线的独立 `DatabasePageView.vue`
会因 loading 分支及含 viewId 的 Editor key 重建 Editor/NodeView；架构 B1 的最小前置修复
已在 P11.2A 实施，生命周期验收结果见下文验证入口。

P11.2A 实施检索入口：`apps/web/src/components/editor/DatabaseTimelineView.vue` 与
`timeline/` 的 coordinates/scale/ruler/viewport/useTimelineViewport、Header/Viewport/Ruler/Grid/TodayLine。
`timeToX` / `xToTime` / `calendarBoundary` / `timelineInstantBounds` / `alignViewportScroll` 统一时间、
日界、端点和原生像素取整；子组件只消费 tick/位置与父层 title links。configuredScale 与 local
zoom 分开，selector 0 PATCH / 0 records GET；scroll/width/origin/timer 为实例临时状态。
standalone B1 已建立稳定 Editor key 与受保护 viewId 原地更新；正式结果见
[P11.2A 验证](../verification/p11-2a-timeline-shell.md)，数学/Web 回归入口为
`tests/timeline-coordinate.spec.ts` 与 `tests/product-database.spec.ts`。
projection/bar/range/milestone/Frozen/dependency/Date mutation 未实施，下一阶段为 P11.2B，需另行启动。
