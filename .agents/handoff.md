# Handoff
## 2026-10-12 P9.5C-1 Board View Creation Entry（已完成）

基线 `a70c8b9a41de42d3b38ac5997d33df314867edff`；聚焦提交为本节所在 commit。DatabaseNodeView 的通用 createView 支持 board，既有菜单增加“新建看板视图”，默认名称“看板 N”。复用 createProductDatabaseView / existing POST views / switchView(created.id, true)，当前 Block 只更新 viewId；不复制 Database、Records、Page 或 Database Block，不 reload/remount。默认配置严格沿用 DEFAULT_DATABASE_VIEW_CONFIG：空 filters/sorts、visibleProperties/propertyOrder null、options 缺省，无自动 groupBy；无 select 也可创建，现有 renderer 显示“尚未配置分组属性”。

独立 review 发现旧 pendingCreateView 跨类型重试会错用旧 type，已最小修复：确定性 4xx 清 pending；未知结果保留原类型/ID，跨类型提示先重试原类型，不发送 POST。新增回归验证 409 后 List→Board、未知结果不跨类型写入、原类型同 ID 重试只创建一个 View。Table/List 正常创建保持。

定向验证 9/9 + 原有 Table 创建生命周期 1/1（workers=1 / retries=0）：
`pnpm --filter @eotion/web exec playwright test tests/product-database.spec.ts --grep "creates a Board view|phone creates a Board view|a 409 while creating a List|an unconfirmed List creation|creates a List view|board renderer switches with Table and List|phone view selector keeps|snapshot convergence preserves phone" --workers=1 --retries=0`
`pnpm --filter @eotion/web exec playwright test tests/product-database.spec.ts --grep "database views create, rename, switch, delete and persist the selected reference" --workers=1 --retries=0`
Web typecheck、diff check、UTF-8 无 BOM 通过，独立复核无剩余 blocker。覆盖请求唯一/type/default config、当前/linked Block、无数据复制、Editor/NodeView DOM/component、Drawer/title draft、snapshot hydration、390px 无 select 与入口 bounds/两行 header。新增失败测试首跑因空 records 等待隐藏 tbody、前置 abort 未进入 fixture 计数失败，修正等待 selector 与独立拦截请求计数后通过；无产品范围外 failure。Table 回归有一条 ResizeObserver 通知警告，测试通过。

未发现已确认的 P9.5C-2 grouping settings blocker；该设置能力及无可用 select 的设置 UX 未实现或验收。未运行 Full Product/Visual/Final Acceptance，未改 grouping/renderer/drag/Domain/API/MCP/local-first。聚焦提交后停止。

## 2026-10-12 P9.5B-2 Board Drag Mutation Foundation（已完成）

基线 `23f3b0a1c0a232309611709632633f4a817d7545`；聚焦提交为本节所在 commit。Desktop 采用原生 HTML5 drag/drop，组件内保存 drag record identity，DataTransfer 仅携带标记；事件阻止冒泡至 Tiptap，数据/配置/可写状态变化清理 drag session。列提供目标高亮，未分组列始终可用，Phone 保持既有 <768px 单列和 picker。

Drag/picker 共用 nullable changeBoardGroup；合法 option.id 或 null 转到 existing cells PATCH，保留 Database/Record CAS、auth/workspace/database/view guard。当前缺失/null/未知 option 归为未分组，同列/null-null no-op。pending 禁用，成功服务端 records refresh 后才移动，失败409留原列并显式刷新重试。无 optimistic/rollback、Board API/model/position/reorder、依赖、MCP/local-first 变更。

Board savingCell 期间 notification deferred；成功显式 refresh 前消费已有 pending，避免 self notify 双刷新；读取期间新 external notification 在 finally 补刷。Table/List renderer semantics 未改，linked 新值与 Editor/NodeView/Drawer/title draft/snapshot 保持。shared picker、productDatabases、databaseEvents 已检查，无需修改。

验证：最终 targeted 15/15，workers=1 / retries=0：
`pnpm --filter @eotion/web exec playwright test tests/product-database.spec.ts --grep "Board drag|board grouping mutation|failed Board drag|Board drag conflict|board renderer|Board grouping picker|unconfigured Board|Board with a non-select|list view renders projected titles|phone view selector keeps|snapshot convergence reloads the editor|keeps failed text drafts" --workers=1 --retries=0`
Web typecheck、diff check、UTF-8 无 BOM 通过，一次独立 review 无 blocker。请求计数验证普通成功只一次完整 Board records refresh；GET barrier + external event 验证读取期间的新通知仍补刷并显示新值。覆盖 PATCH唯一/CAS、真实drag/pending、null/no-op、失败409重试、linked Table/List/Phone picker/layout、identity/draft/snapshot。

中间测试失败：pending gate 在 fallback 前错误读取 mock 请求计数，及 records GET matcher 未匹配 URL，已修正为拦截请求 payload 与 pathname predicate；初次并发验证导致测试 server 连接拒绝，已由单一验证 Agent 串行复跑。一次 Drawer draft 断言期望草稿但显示原标题，后续单独及最终组合均通过，未削弱断言或修改相关产品代码。无确认的 scope-external blocker，未继续扩大范围。

未运行 Full Product、Visual 或 Final Acceptance。未发现已确认的后续 Board blocker；Phone touch drag、Board settings、动画/reorder/MCP 均未实现或验收。修改两个 Board/NodeView 组件、product-database.spec.ts、P9/architecture/context、current-task/handoff；聚焦提交后停止。
## 2026-10-12 P9.5B-1 Board Card Mutation Foundation（已完成）

基线 `90f8d9d0fe0db4030cbd588881298f0c5d7cab23`；聚焦提交为本节所在 commit。Board Card 新增共享 DatabaseSettingsSelect 分组 picker，只提交当前 select 的稳定 option ID；未配置/非 select 不开放 mutation。父 changeBoardGroup 校验当前 Board/select/Record/option/可写状态与 auth/workspace/database/view identity，复用 updateProductDatabaseRecordCell → SDK cells PATCH，携带原 Database/Record CAS。没有 Board API / endpoint / schema / sync 变更。

提交期间禁用 picker 与已开菜单；成功沿用 DatabaseUpdated 通知刷新 linked Table/List，并明确重读当前已加载窗口，Card 进入目标列。失败不改 records/config，展示错误；409 提示刷新后重选，错误处“刷新记录”复用 refreshLoadedWindow，避免旧版本持续 CAS 失败。无 optimistic update / rollback UI / offline mutation；Editor/NodeView/Drawer/draft 保持。仍只支持目标 option，不提供未分组清空 mutation。

验证：新增 targeted 5/5，命令 `pnpm --filter @eotion/web exec playwright test tests/product-database.spec.ts --grep 'grouping mutation|grouping mutation control|non-select grouping property' --workers=1 --retries=0`。覆盖成功移动/其他卡片与 config 保持/CAS/唯一 cells API、linked Table/List 新值与 Table 继续编辑、Drawer draft/Editor/NodeView identity、失败旧列/旧 picker、未配置、真实非 select 组件、409→显式刷新→新版本重试。

既有定向回归最新代码复跑 10/10：grep `board renderer|list view renders projected|database tables render and references|database table scrolls horizontally|snapshot convergence preserves phone|keeps failed text drafts|409 refreshes the latest record version`，workers=1 / retries=0。Web typecheck、diff check、UTF-8 无 BOM 检查通过。独立 review 提出的旧 CAS 失败恢复入口已修复，复核无剩余 blocker。冲突测试初跑遇到初始后台 GET 计数竞态，改用手动刷新前计数并保留旧 UI 断言，未更改产品逻辑或弱化状态断言。非 select mount 测试 login 出现 auth proxy 未连接日志，测试通过；无 scope-external failure。

未运行 Full Product / Visual / Final Acceptance。未发现当前 record mutation 链路阻碍后续 Drag 的 blocker，但本轮未实现或验证 Drag。没有进入 Drag / optimistic / rollback / MCP；完成聚焦 commit 后停止。

## 2026-10-12 P9.5A Board Renderer Foundation（已完成）

基线 `73f1762d2c860f1c8d96ff9548cdb569950d8bca`，P8 COMPLETE / SEALED；聚焦提交为本节所在 commit。新增独立只读 DatabaseBoardView，DatabaseNodeView 仅 import + renderer 分支；Table DOM 与 List 不变。Props 沿用 records/properties/config/formatValue，openRecord emit 复用既有 Page prepare/record opening/Drawer。select options 按稳定 ID 生成全部列；保留输入排序，空值/未知值在有记录时进入未分组；Vue key 与真实 option ID 隔离。未配置 grouping 只提示，不推断/写回。title 为 Page.title projection；详情按 visibleProperties（null 全部）与 propertyOrder。

现有 product helper 仍调用 legacy /table，服务端 getTable 委托 getViewRecords；没有新增读取/写入接口、Domain/schema/SDK、snapshot 数据或 Board mutation。Filter/Sort/projection/分页/refresh 共用。Desktop/Tablet 局部横向滚动，Phone <768 单列堆叠。列计数为已加载记录数，非全库总数。

验证：`pnpm --filter @eotion/web exec playwright test tests/product-database.spec.ts --grep 'board renderer|list view renders projected|database tables render and references|database table scrolls horizontally|snapshot convergence preserves phone' --workers=1 --retries=0`，8/8，通过。Web typecheck 通过；独立 review 无 blocker，diff/UTF-8 无 BOM 检查通过。首轮 6/8，新测试误将标题计数纳入名称断言、Drawer 遮挡 selector 鼠标点击；修正名称 locator，并通过真实键盘 focus/Enter 操作切换后同组通过。无 scope-external failure。Table/List 往返保持 Editor/NodeView/记录 Drawer identity 和标题 draft；Phone Filter/Sort snapshot draft 原回归保持。

未运行完整 Product suite、Visual Acceptance 或 Final Acceptance；未发现只读 renderer/record opening blocker。Board 创建与 grouping settings UI 尚未实现，是后续阶段入口，未进入 drag/mutation/MCP/local-first。修改：Board 组件、NodeView、targeted tests、P9 文档、architecture/context、current-task/handoff。完成聚焦 commit 后停止。

## 2026-10-12 P9.4B Board Property Dependency（已完成）

基线 `a344268135e45f49d06d230222dc0a6cf1df5cd7`。本轮仅实现 Board grouping Property 生命周期保护；聚焦提交为本节所在 commit。P8 COMPLETE / SEALED，P9.4A config foundation 保持。

`DatabaseViewRepository.hasBoardGroupingProperty()` 沿用存在性查询模式，filter 同时限定 workspaceId、databaseId、type: board 与 config.options.groupByPropertyId，使用同一个事务 session。`DatabaseService.assertNoBoardGroupingDependency()` 在 delete 事务首次写入前，以及 select → 非 select 改型的版本校验/no-op 后、candidate dependency/fence 写入前执行。命中返回明确 409：`Property is used as Board grouping property.`。不自动清空 groupByPropertyId，不新增 Entity/表/API/registry；用户可通过既有 View update 显式迁移或移除分组后再修改 Property。既有 Database CAS/snapshot 事务保持。

Select option mutation、Record value cleanup、Property rename、同类型 no-op 与全部通用 View repair 保持。Table/List 的同名 options 是 opaque，不构成 Board dependency；未知 options 完整保留。新增实际 HTTP targeted 子测覆盖 A–F、多个 Board 引用、拒绝前后 Database/Property/Record/View/version/config/fences 深比较不变、Doing value 先真实写入再清理、迁移全部分组后改型/删除成功。P9.4A generic 回归也改为先明确拒绝、再显式迁移 grouping 后验证原 repair，Board records 保持可读。

验证与复用命令：

- 仓库外 `C:\Users\31250\AppData\Local\Temp\eotion-p94b-api-scoped-tsconfig.json` extends `apps/api/tsconfig.json`，只设置 incremental: false、include 两份 Database 测试文件绝对路径，保留真实 strict 配置与依赖闭包。`pnpm --filter @eotion/api exec tsc -p <temporary-config>` 通过。
- `pnpm --filter @eotion/api exec node --test dist/modules/http-api/database-http.test.js dist/modules/server-domain/database.test.js`：14/14，0 fail、0 skip/cancelled；包含原 11 个 service tests、HTTP 父测试及 Board/generic 两个子测。第二轮日志位于 Temp `eotion-p94b-scoped-tsc-r2.log`、`eotion-p94b-scoped-api-tests-r2.log`。
- 首轮 compile 通过；HTTP 新 fixture 在 RecordPage POST 携带额外 properties 返回400，另一处迁移后 options 仍断言旧 grouping ID。通过合法 POST + 既有 cell PATCH 明确写入 Doing，以及比较显式迁移后的 options 修正；同组第二轮全通过。首轮日志保留，没有 scope-external failure 或无关修复。
- 一次独立 reviewer 最终无 blocker，主 Agent 复核最终 diff；git diff --check 与 UTF-8 无 BOM 检查通过。

修改文件：API database service、repository、Database HTTP test，`docs/p9-multi-view.md`、architecture/context 索引、current-task 与本 handoff。未修改 Domain/Contracts/SDK/Mongo schema/Web/依赖/lockfile。未执行完整 API build/typecheck（既有 MCP/Zod 环境限制），未运行 Web Product、Visual 或 Final Acceptance。未发现依赖/API 层的 Board renderer blocker；renderer/UI/drag/MCP 没有检查或实现。完成一个聚焦 commit 后停止。

## 2026-10-12 P9.4A Board Config Foundation（已完成）

基线 `e15d6d1b9f3519f0cb6d16f937209c98bc0d1370`。P8 COMPLETE / SEALED，P9.1A / P9.2 / P9.3 保持已完成；本轮只建立 Board config/domain foundation。聚焦提交为本节所在 commit。

Domain 新增 `DatabaseBoardViewOptions` / `DatabaseBoardViewConfig`，可选 `groupByPropertyId?: string`；通用 `DatabaseViewConfig.options?: Record<string, unknown>` 继续保留未知 key/value。`validateDatabaseViewConfig(config, properties, viewType = 'table')` 只在 Board 显式提供 grouping ID 时校验稳定 ID、当前库 select 与合法 options 数组（可空）。缺省 options / 空对象合法，Table / List opaque options 兼容。API create / update / records read 分别传请求 / 持久化 View type，records response contract 同样传 view.type；继续使用 `POST .../views`，没有专属 Board API。

Property option cleanup / type change / delete 维持通用 repair 校验与已有 spread，完整保留 options / groupByPropertyId，不新增 Board dependency、delete/type-change conflict 或自动清除策略。真实 HTTP 回归让每条 repair 确实重写配置并递增 View version，确认通用字段修复且 options 深比较保留。grouping Property 自身改型/删除后 ID 保留，records read 按当前 schema 返回既有 409；生命周期留给 P9.4B。

验证：

- `pnpm --filter @eotion/domain test`：35/35；`pnpm --filter @eotion/contracts test`：24/24，0 fail / 0 skip。
- Domain / Contracts / SDK `typecheck` 通过。
- API scoped compile：仓库外 `C:\Users\31250\AppData\Local\Temp\eotion-p94a-api-scoped-tsconfig.json` extends `apps/api/tsconfig.json`，仅设置 `incremental: false` 与 include 两个测试文件绝对路径，保留原 strict 等选项与真实依赖闭包。`pnpm --filter @eotion/api exec tsc -p <temporary-config>` 通过。
- `pnpm --filter @eotion/api exec node --test dist/modules/http-api/database-http.test.js dist/modules/server-domain/database.test.js`：13/13，0 fail / 0 skip。HTTP 包含合法 Board POST/records/type/options、groupBy 缺省、text/number/missing/非法稳定 ID/真实外库 select 拒绝、PATCH 使用持久化 type、invalid create 零写入/version 回滚、三条实际 property repair。首次新增 Board fixture 与原 `generic-board-view` ID 重复，合法 POST 得到 duplicate-key 500；改为独立 `generic-grouped-board-view` 后同组通过，产品代码/错误处理与原断言未变。
- 一次独立 review 无 blocker；fixture 修正后定向复核同样无 blocker。`git diff --check`、全部修改文件 UTF-8 无 BOM 检查通过。

修改：Domain/Contracts source 与定向测试、API DatabaseService 与 Database HTTP test、`docs/p9-multi-view.md` / architecture / context 索引、current-task 与本 handoff。未改 Mongo schema（P9.2 已支持 board）、Web、SDK source、依赖或 lockfile。完整 API build/typecheck 未执行，继承 P9.1A 的 MCP/Zod 环境限制；本轮仅 scoped compile/test。未运行 Web Product / Visual / Final Acceptance。未发现 P9.4A Board Domain blocker；Board UI、renderer、columns、drag、selector、MCP、Local-first 均未开始。完成一个聚焦 commit 后停止。

## 2026-10-12 P9.3B-2 Create List View（已完成）

基线 `a9217b6496ce3d97f6f3999055c081fab5deb488`。View Selector 保留既有“新建视图”Table 创建流程，新增“新建列表视图”List 创建入口；两者复用 `createProductDatabaseView()` / `POST .../views`，不复制 Database、不创建新的 Database Block、不修改 Page Tree 或 snapshot。

List 创建显式传 `type: 'list'`，使用通用 `DEFAULT_DATABASE_VIEW_CONFIG`，不增加 List 专属 config。成功后沿用既有创建路径和 `switchView()`，只更新当前 Database Block 的 `viewId`；既有 watch reload 后进入 `DatabaseListView`，切回 Table 保持原 renderer 与行为。Rename/Delete、View settings、Board、Calendar、Gallery、MCP、Local-first 未开始。

新增 targeted regression：View 数量 +1、创建结果 type 为 list、默认 config、block `viewId`、List renderer、Table 回归；与既有 selector/nested/Phone/List 测试组合共 5/5 通过。Web typecheck、`git diff --check` 通过；未运行完整 Product、Visual、Final Acceptance；未改 lockfile。修改文件为 `apps/web/src/components/editor/DatabaseNodeView.vue`、`apps/web/tests/product-database.spec.ts`、`docs/p9-multi-view.md`、`.agents/current-task.md`、`.agents/handoff.md`。

## 2026-10-12 P9.3B-1 View Selector Integration（已完成）

基线 `38b3ac54c43b30cef918641b8afa7599f81441b8`。本轮确认并固化既有 View Selector 与 P9.3A Table/List renderer 的集成契约，没有新增产品 renderer 或 Database domain 逻辑：selector 打开时经 `listProductDatabaseViews()` 读取 server DatabaseView entity；当前项由 Block attrs `viewId` 高亮；点击通过既有 `switchView()` 只更新 `{ viewId }`，不修改 `databaseId`、Page tree、Page snapshot 或创建新的 Database Block。

新的 viewId 由 `DatabaseNodeView` 既有 watch 触发 records reload，records 响应的 `view.type` 继续选择 Table 或 `DatabaseListView`。Table DOM/interaction、nested Database Block、Editor/NodeView identity 和 Phone `<768px` 两行 header 均保持。P8 已有 Create/Rename/Delete 代码与测试未改动，本轮不扩展其范围；Board/Calendar/Gallery/MCP/Local-first/Database domain 未开始。

新增 targeted UX 回归覆盖：Database 同时有 Table + List 时显示两项且当前高亮；Table → List → Table renderer 往返；只改变所选 block 的 viewId；nested block 不受影响；Editor identity 保持；Phone selector 不破坏两行 header 与 viewport。`product-database.spec.ts` targeted 5/5、`pnpm --filter @eotion/web typecheck`、`git diff --check` 通过。未运行完整 Product、Visual、Final Acceptance；未改 lockfile；未发现 Create View 或 Board blocker。

修改文件：`apps/web/tests/product-database.spec.ts`、`docs/p9-multi-view.md`、`.agents/current-task.md`、`.agents/handoff.md`。聚焦提交 SHA 以当前 `HEAD` 为准。

## 2026-10-12 P9.3A List View Renderer Foundation（已完成）

基线 `3a502aa53725b4e44d392c14ae592cb605513be6`。新增 `apps/web/src/components/editor/DatabaseListView.vue`，由 `DatabaseNodeView` 根据 records 响应中的 `view.type === 'list'` 局部选择；父组件继续持有统一 loading、分页、refresh、Page.title projection、Filter/Sort、relation title resolve、record opening 和 Table editing 生命周期。List 不新增 Database 模型，不复制 inline edit；title 点击复用既有 `openRecordPage`，因此保留 record opening preference / drawer 生命周期。

List 按 `visibleProperties` 过滤非 title 属性、按 `propertyOrder` 排列；`visibleProperties === null` 时 title 外最多展示三个属性。title 使用服务端 Page.title projection，Desktop/Tablet 为横向 title + properties，Phone 沿用既有 `<768px` breakpoint 为单列记录项。Table DOM 和交互没有改动，未实现 View Selector、View creation/management、Board、Calendar、Gallery、MCP 或 Local-first。

验证：`pnpm --filter @eotion/web typecheck`；List targeted product 1/1；既有 Table root/nested 1/1；既有 Phone Table overflow 1/1；`git diff --check`，全部通过。首次 Playwright 因 node_modules 缺失 `morphicons/vue` / `lucide` 失败；按 Web workspace frozen install 恢复依赖后重跑通过，lockfile 未修改。未运行完整 Product、Visual、Final Acceptance。未发现 P9.4 Board blocker。

修改文件：`apps/web/src/components/editor/DatabaseListView.vue`、`apps/web/src/components/editor/DatabaseNodeView.vue`、`apps/web/tests/product-database.spec.ts`、`docs/p9-multi-view.md`、`.agents/current-task.md`、`.agents/handoff.md`。

## 2026-10-12 P9.2 View Type Foundation（已完成）

基于 master `8c6a7fe25f5879ad82ac43041ab62cdc06f052fe`，P8 保持 COMPLETE / SEALED。Domain 导出单一 `DATABASE_VIEW_TYPES = ['table', 'list', 'board'] as const` 与 `DatabaseViewType`；Domain runtime、Contracts create enum 与 Mongo enum 一致。默认 Database 创建仍 table；createView 持久化请求 type，创建/列表/records 响应保留 type。Generic records 接受三种 View，legacy Table 继续委托；没有修改查询、游标、权限或 version/config fence。

`DatabaseViewConfig.options?: Record<string, unknown>` 为可选 opaque 对象，只验证非 null、非数组 object，内部未知 key/value 不丢失。既有 filters/sorts/列与 Property reference validation 保持。Property delete repair 补上 `...config`，select option cleanup/type-change 原有 spread 保持；真实 mutation 回归确认嵌套 options 在三条路径后均保留。没有 groupBy 校验、Board dependency、Capability Registry 或 renderer 字段；旧 table/config 不补 options，无 migration/批量更新。

验证与复用命令：

- `pnpm --filter @eotion/domain test`：35/35；`pnpm --filter @eotion/contracts test`：23/23。
- Domain / Contracts / SDK `typecheck` 通过；`git diff --check` 和全部修改文件 UTF-8 无 BOM 检查通过。
- API scoped compile：仓库外临时 tsconfig extends `apps/api/tsconfig.json`，`incremental: false`，include 仅 `src/modules/http-api/database-http.test.ts`、`src/modules/server-domain/database.test.ts`，TS 跟随真实依赖闭包。`pnpm --filter @eotion/api exec tsc -p <temporary-config>` 通过。临时 config 位于 `C:\Users\31250\AppData\Local\Temp\eotion-p92-api-scoped-148e51481c1f4686a2e7a30718413303.json`。
- `pnpm --filter @eotion/api exec node --test dist/modules/http-api/database-http.test.js dist/modules/server-domain/database.test.js`：13/13、0 fail、0 skip。首次运行仅旧 fixture View 数量期望失效；改为明确核对原两个 Table + 新增 Board 的三个 ID 后同组通过，原其余断言保持。
- 独立 reviewer 无 blocker；未发现 P9.3 List View foundation blocker。

完整 API build/typecheck 未运行，继承 P9.1A 已记录的 MCP/Zod 环境限制；未修复 MCP/依赖。未改 Web、Product/Visual tests、Database Block 引用形状或 P8 文档；未运行 Web Product、Visual、Final Acceptance。`linkInPage` 暂保留 table-only，Web List renderer、selector/链接入口接入是后续 P9.3 工作，不在本轮执行。

本节所在聚焦 commit 完成后停止，不开始 List/Board/Capability Registry/Web/MCP。

## 2026-10-12 P9.1A Generic View Records Read Foundation（已完成）

基于 master `13053793ffa4683e3ffdb6d7f1f512f270ebc499`，P8 保持 COMPLETE / SEALED。新增 `GET /api/workspaces/:workspaceId/databases/:databaseId/views/:viewId/records`、`DatabaseViewRecordsQuery/Response` 及 schemas、SDK `getDatabaseViewRecords()`。唯一读取体为 `DatabaseService.getViewRecords()`；legacy `/table` / `getTable()` 委托 generic 方法，原 Table contracts、SDK 路径和结构保留。查询、权限、title/derived projection、transaction、bounded query 与 cursor scope/version/config fence 未复制或削弱。正式设计见 `docs/p9-multi-view.md`。

新增定向 HTTP 回归通过：同一 Table View 的新旧核心数据及默认/配置分页完全等价，cursor 可跨 endpoint 继续；Filter before pagination 与双层 Sort 生效；独立 workspace/database/view scope、Database version、View version、config hash fence fail closed；title/Relation/Rollup/Formula 投影等价。所有原 Table 断言保留。HTTP fixture 直接装载生产 HttpApiModule + ConfigModule + 隔离 Mongo，继续使用真实 SessionAuthGuard、SameOriginGuard、controller/service 和监听端口，不替代完整 AppModule 启动测试。

验证：

- `pnpm --filter @eotion/contracts test`：23/23；`pnpm --filter @eotion/sdk test`：23/23。
- Contracts / SDK `typecheck` 通过，`git diff --check` 通过。
- API scoped TypeScript compile 通过：仓库外临时 tsconfig extends `apps/api/tsconfig.json`，`incremental: false`，include 仅 `src/modules/http-api/database-http.test.ts`、`src/modules/server-domain/database.test.ts` 及其真实依赖闭包；使用 `pnpm --filter @eotion/api exec tsc -p <temporary-config>`，没有关闭类型检查。
- 包内 `node --test dist/modules/http-api/database-http.test.js dist/modules/server-domain/database.test.js`：13/13，0 fail，0 skip（11 个原 service tests + HTTP 父测试与 generic 子测试）。
- 独立 reviewer 无 blocker，补充确认 scoped HTTP fixture 保留真实守卫与原断言。

环境限制：完整 API `build` / `typecheck` 未通过，错误涉及 MCP 模块缺失及 Zod 类型/API 错配；build 报 43 errors。初始完整 AppModule targeted group 为 12 pass / 2 fail，失败均在装载 MCP 时（尚未进入 Database HTTP 断言）。失败涉及的 MCP 源、API/package 配置、tsconfig、lockfile 与 `13053793` 的 `git diff --exit-code` 为 0；未另建 clean worktree 重跑全基线，因此不声称第二次 baseline build 证据。Ownership 在约 2 分钟内核对，未修复 MCP/依赖、未削弱断言；以上 scoped compile/HTTP 测试作为本轮替代验证。该环境问题仍阻断完整 API 验证，后续另行处理。

本轮未改 Web、domain、Mongo enum、View CRUD、queryTableWindow、DatabaseTableRecord 或 cursor helpers。未运行完整 Web Product、Visual、Final Acceptance。未发现 P9 后续 read seam blocker；View.type 泛化、List、Board 未开始。完成一个聚焦 commit 后停止。

## 2026-10-11 Database UX Final Acceptance（PASS / SEALED）

**P8 Database UX Final Acceptance — PASS；P8 Database — COMPLETE / SEALED。** 基线 `32c671192a470cad72d132a2b981fed9ad2fb361`；验收提交为本节所在 commit。本轮只做验收与最小 blocker 修复，没有新增 Database 产品能力，没有改 Domain / API / Contracts / Overlay 产品实现，没有开始 P9。

自动化：完整 Database + Overlay + Pages 产品套件 `144/144`（`--workers=1 --retries=0`，fresh Vite dev server）；Domain 35/35、Contracts 21/21、SDK 22/22、API domain 13/13；Web/SDK typecheck、`build:web`（保留既有 chunk 提示）、`git diff --check` 通过；workspace clean。

仅有的失败都是测试视角问题，已修复且未削弱断言：(1) 4 处 stale locator —— f383c12 之后表头属性名位于 `.eotion-database-header-name`，属性 trigger 变为纯图标按钮，select/advanced 行内是刻意的文字配置按钮；改为断言新语义并新增文字入口的对齐断言。(2) 390px 创建卡片断言与 Bottom Drawer 200ms 入场 translateY 竞态；测量前等待 `transform: none`，`--repeat-each=5` 10/10。另观察到 7 个 snapshot/fencing 用例只会在长生命周期 HMR dev server 上假失败（测试按路径 import 的应用模块与页面实例分裂），fresh server 下全绿，产品行为正确，记为运行环境边界。

截图包在仓库外 `artifacts/database-ux-final/`（22 张请求命名 + 94 张完整捕获 + `manifest.json`，Chromium responsive Web，非真机）。Device/Theme 已人工检查 Desktop light/dark、Tablet coarse、Phone light/dark 的表头、菜单、属性 Drawer、类型变更确认。

Non-blocking debt：`添加属性类型` 与 Table select cell 仍是 DatabaseNodeView 内手写 Teleport + `anchoredStyle`；Relation complex picker 按既定边界保留。历史 59/60 用例已通过。到此停止，不开始 P9。

## 2026-10-11 Universal Block +（PASS）

master 基线 7b6e689cffbdebbba07ad9007b631e586994b8cc；复用 nestedBlockInteractions 的既有 widget 和 insertParagraphAfter，为所有 movable Block 创建统一 [+] [drag]。覆盖 Paragraph / Heading / Bulleted & Numbered List / Todo / Quote / Code / Divider / Callout / Toggle / Table / Database，不纳入附件或上传 placeholder。

普通空 Paragraph 插在完整节点后、同 parent sibling list，保持 BlockIdentity、selection/history 与保存通路并立即 focus。Desktop idle 两控件 opacity 0；hover、focus-visible 或正文 caret Block 显示，24px绝对定位无正文位移。修复已实际复现的 nested anchor 使用整页 top 造成41px纵向偏差，改用真实offsetParent；透明命中桥及显现层叠修复Divider邻接Table时透明控件抢点击。Phone<768全隐藏无预留；Tablet coarse既有Database控件边界保留。

定向 product-blocks / product-nested / Database Chrome 最终21/21（retries=0）；Web typecheck、git diff --check通过。包含root各类型插入/输入/undo/redo、nested同parent和reload、完整Toggle后插入、caret focus/blur、鼠标跨间隙、Phone390/Tablet820、原drag/indent/outdent。独立review无剩余blocker。Desktop/Phone截图已在仓库外查看。未运行完整Database suite，不处理59/60属性Drawer失败，不修改Drawer/Sync/Database domain/model/codec。

剩余事项仅 Database UX Final Acceptance；提交后停止，不开始 Final Acceptance 或 P9。

## 2026-10-11 Drawer Motion Final Re-acceptance（PASS）

基线 `65e7b5ea7736bc0f46999fe82d84e12e362e20b8`，继续 master；复验 `a37aba8` Motion 与 `65e7b5e` snapshot 修复。Right / Desktop Drawer 的 X 与 Bottom Drawer 的 Y 正反位移、200ms enter / 170ms leave、masked backdrop fade 均通过；关闭按钮、Escape、backdrop、leave 完成前 surface/scroll lock/焦点保留及完成后关闭、解锁、focus restore 通过。Desktop 无 mask、背景可交互；三种 Drawer reduced-motion 无位移、立即关闭、无残留打开 dialog 或 scroll lock。

Phone Filter / Sort 的正常 snapshot convergence 回归通过：等待实际 hydrate、snapshotRevision 与 PageView 比较完成，EotionEditor / DatabaseNodeView DOM 与 Vue 实例不 remount，MutationObserver 无瞬时卸载，Drawer 与 draft 保留。额外临时探针 2/2 将同次 convergence 后的保存与 leave 串起来：保存 config 正确，leave 期间 surface 仍 open/visible、scroll lock 保留，动画完成后关闭并解锁；探针已删除，未修改永久测试或产品代码。

验证命令：`pnpm --filter @eotion/web exec playwright test tests/product-overlay.spec.ts tests/product-database.spec.ts --workers=1 --retries=0`，Overlay 35/35、Database 59/60，共 94/95（2.4 分钟）；opening、record、Filter/Sort、snapshot 与相关 overlay 全通过。唯一失败 `edits versioned cells and manages property options without losing stable IDs` 在 `product-database.spec.ts:2118`：属性 Drawer 已处于 open，测试点击被 property-row 覆盖的背景 Table 文本按钮；一次隔离复现仍同因失败。证据不指向 Motion 入/退场或 snapshot，按本轮范围停止诊断，未修复，也未认定为历史既有失败。Web typecheck、git diff --check 通过；独立 review 无 Drawer Motion blocker。完整 Database 并非全绿，本结论不代表 Database UX Final Acceptance。

Drawer Motion：**PASS**。本轮只更新验收文档、current-task 与 handoff，不修改 Motion、Universal Block + 或其他产品实现；未跑 product matrix。Remaining issues：Universal Block +、Database UX Final Acceptance。完成一个聚焦 acceptance commit 后停止，不开始 P9。

## 2026-10-11 Page snapshot convergence（PASS for scoped fix）

基线 a37aba8dd36ced4f1bf1683418dfb2cad185140e，继续 master。本次最小运行时比对确认 phone-view-settings 的 props 完全一致，parent/type 一致；baseline orderKey=000000000000000001000000000000，snapshot=0000000000000100。原 Phone 测试同步 mock 漏处理 block.move，编辑器新增尾段落后 rebalance 的 move 被 ACK 却未落库；snapshot 因此恢复旧次序并重建编辑器。补齐 mock move（不存在目标返回 404）后原用例通过，生产 orderKey 比较保持严格。

另以独立等价 snapshot 回归证实原 JSON.stringify props 比较对对象字段插入顺序敏感；PagePersistence.matchesLocalBlocks 与 changes 共用递归排序对象键的 JSON 比较，数组顺序与真实属性值继续参与。没有调整 PageView、sync、Drawer Motion、pending work/databaseBusy/identity fences 或 local-first draft。新增 Filter/Sort Phone 回归实际 hydrate snapshot 并等待 PageView 比较，确认 DOM 与 Vue 组件身份保留、无瞬时卸载、Drawer 未保存草稿保留；paragraph 真实变化仍 reload。

验证：旧实现新增回归 3 红 / 1 绿，修复后新增及原 Phone 5/5；相关 Page Editor/Sync 13/13，Web typecheck、git diff --check；required checks 全绿后额外 Database opening/drawer 8/8。独立 review 无 blocker。未跑完整 Database suite，未执行任何 Final Acceptance。

Remaining issues：Drawer Motion final re-acceptance、Universal Block +、Database UX Final Acceptance。完成一个聚焦 commit 后停止，不开始 P9。

## 2026-10-11 Drawer Motion（NO PASS）

基线 a9c206722e6d4c5bf05cff54e2212297729d6113，范围仅 EotionProductOverlay Drawer motion。Right/Desktop X、Bottom Y 从 100% 到 0，退出反向；enter 200ms ease-out、leave 170ms ease-in，masked backdrop 同步 opacity，Desktop 无遮罩。Vue Transition 保留退出前的 vnode 和正文，受控父级接受关闭后才 leave，结束后真正 close/unmount、unlock 与 focus restore。保存拒绝维持面板；reduced-motion 禁用位移并立即完成；快速切换/取消清理与 Modal 回退关闭焦点已覆盖。

最终指定验证通过：Overlay 35/35、Database opening/record 14/14（workers=1、retries=0），Web typecheck、build:web、git diff --check。构建保留既有 >500kB chunk warning。独立复核完成。但本轮不能 PASS：扩展完整 Database 回归曾为 54/56；恢复 baseline nextTick 显示/聚焦时序后 Desktop 属性单例通过，Phone filter/sort 仍在添加排序时因父编辑器重建而卸载。隔离基线 Overlay 两例 2/2 通过，确认本改动时序暴露了回归；不将其标为无关失败。

运行时证据：Phone Sort Drawer 入场后 PagePersistence.matchesLocalBlocks 返回 false（两侧均 2 blocks，mismatch phone-view-settings），随后整个 .eotion-editor、Database NodeView 和 open=true 的 Overlay 同时移除再重建，无 Overlay close 请求。调用链为 PageView snapshotRevision -> loadBlocks -> editorRevision key 重建。该父编辑器/Sync 生命周期超出本轮明确边界，未修改；详见 current-task。探针已按 SHA256 恢复测试原字节，诊断日志及临时配置已清理。当前提交保留此阻断，不宣称完整 Database UX 通过。

Remaining issues：Universal Block +、Database UX Final Acceptance。提交后停止，不开始 P9。

## 2026-10-11 Database Overlay Header / Body / Footer

在 master 基线 6debd1a7e8a1878bf615c5ed4ec7baacc9e8ebf1 上完成统一 ProductOverlay 分区：title 可视 Header，label 保留独立 accessible name；Header 单关闭按钮，Page 返回；Body 独立滚动、可选 Footer 有分隔线且保持稳定。无动画。

Database 筛选、排序、属性、记录打开方式和 Relation/Rollup/Formula 配置标题移入 Header，正文重复标题与高级属性额外关闭按钮删除。创建器迁移 ProductOverlay：Desktop/Tablet Modal、Phone Bottom Drawer，Footer 左返回上一步、右取消整个流程与 Primary 创建（关联原 form）；链接列表业务保持，返回/取消同样进入 Footer。Filter/Sort 保存移入 Footer，数据与保存成功关闭语义不变。原 CommandOverlay 的 IME keyCode 229 Escape 防护保留。

验证：最终 Overlay/Database 两 spec 串行 71/71，全程 retries=0；Web typecheck、build:web、git diff --check 通过，保留既有 >500kB chunk warning。独立 review 无 blocker；Desktop Modal/Phone Bottom Drawer、长正文、明暗主题、可选 Footer、Back/Cancel/Create、Filter/Sort 保存回读、Property/Record Opening、focus trap/Escape/backdrop/restore 全覆盖。Rapid title saves 仅添加正文 rAF autofocus 就绪等待，快照 gate、事件与表格断言全部保留，不改同步业务。截图位于本次会话 visualizations/overlay-header-review（仓库外），使用 mock transport 与 Chromium responsive Web，不作为 Final Acceptance/原生宿主验收。

本轮 PASS，提交后停止。Remaining issues：Drawer Motion、Universal Block +、Database UX Final Acceptance。不开始 P9。

## 2026-10-11 Database Table Cell Inline Editing

在 master 基线 050173fce98d40eb7f8d2432cd3bd2e87486c3da 上完成聚焦 Cell 交互：Title 主体直接编辑 Page.title；删除铅笔入口，首列独立弱化的详情 icon button 复用现有 opening preference/pipeline。Desktop mouse idle 隐藏、hover/focus-within 显示；Tablet/Phone 与无 hover 输入常驻且至少 44px，与编辑主体不重叠。Text/Number/Date/Select/Checkbox/Relation 复用现有 editor/picker/mutation，Formula/Rollup 只读；Enter/Escape/Tab/Shift+Tab/Space 定向验证通过。

Title Tab 最小复现发现：sync.runSync 首次 flush 父页面生成 pending operations 后 deferRetry 返回 syncing，使既有 title 状态检查拒绝提交。现复用 activePageEditor 先 flush 同 Workspace 页面，再经过原 sync-state / auth / workspace / Page+Record+Database CAS gate；没有改 Database domain、服务端协议或同步域。详情字形使用 aria-hidden SVG，不混入 Cell 文本值。

验证：定向 8/8；初始 Record autofocus readiness 定向 3/3；完整 Database suite 最终 55/55，无 retry；Web typecheck、build:web、git diff --check 通过，保留既有 >500kB chunk warning。原 HEAD 上 Record title focus 测试 repeat2 为 1 pass/1 fail，证实正文 rAF initial autofocus 与过早 fill 的竞态；只补测试等待现有 body focus 的就绪断言，原 title focus / close / route 断言未削弱，未改 Overlay。独立 reviewer 最终无 blocker。

提交后从最终 HEAD 重采的视觉包放在 artifacts/database-ux-review/（ignored），manifest 记录 commit、生成时刻、尺寸/主题和完整文件清单。使用 Chromium responsive Web + product mock transport；不把它当 native 真机验收。截图保留等待用户人工查看；本节对应最终聚焦提交，实际 hash 见 git HEAD 与截图 manifest。

本轮实现/验证 PASS；Database UX Final Acceptance 仍待用户审阅。Remaining issues：Drawer Motion、Universal Block +、Database UX Final Acceptance。截图采集完成后停止，不开始下一项、性能或 P9。
## 2026-10-11 Mobile Database Header UX

在 `master` 基线 `0a3066b4e82ce21cc674e0e43d7a393f1d55bd67` 上仅修改 Phone（<768px）Database Block/Header presentation：隐藏插入与拖拽控件并取消 100px 左侧预留；标题独占第一行、长标题单行 ellipsis；第二行左 View Selector、右图标新建记录 `+` 与设置 `…`，三个触控目标至少 44px。Phone 隐藏 Database icon。Desktop/Tablet 原布局、Tablet coarse controls/插入交互与 Record/View/Settings/opening preference 保持。

验证：Header 定向 5/5；完整 Database suite 最终 `--workers=1 --retries=1` 为 53 passed + 1 flaky，exit 0。无重试完整运行曾有 linked view Phone 抽屉缺失与 advanced property DOM detach 超时；隔离原基线也复现两种症状（advanced 连跑 3 次为 2 pass/1 fail），未修改这些行为、断言或超时。Web typecheck、build:web、git diff --check 通过；既有 chunk size warning 保留。390px light/dark 与 Desktop/Tablet 截图复核通过，独立 reviewer 无 blocker。临时基线 worktree 已归档。本轮 Header UX PASS，整体 Database UX Final Acceptance 仍 HOLD。

Remaining issues：Table Cell Inline Editing、Drawer Motion、Universal Block +、Database UX Final Acceptance。本轮提交后停止，不开始下一项、性能或 P9。

## 2026-10-11 ProductPages snapshot revision 收敛竞态

在 `master` 基线 `153797d` 上完成聚焦修复：首次 load 期间 refresh 置 pending，由原 load promise 合并并串行重读完整 Pages 与 navigation projection；每次读取和提交检查 epoch/workspace，切换和 reset 清 pending。未修改 sync contract、LocalStore schema/index、PageTree 或 Database navigation，未做性能优化。

确定性 IndexedDB 回归：先截获 10,050 条 roleless navigation，再真实 replaceWorkspaceSnapshot 补 Record role 并触发 sync revision；最终 items=10,050、navigationItems=50，Record direct-open 保留。覆盖多次 revision 合并、尾随读取期间再次 revision、in-flight load 复用、workspace 切换/reset 旧读取隔离、正常 load 单次读取。新增测试 2/2、已有相关 product-pages/product-sync 定向测试 5/5、Web typecheck、git diff --check 均通过。

10k Audit 继续 **B — PASS WITH DEBT**。Remaining issues 保留：Mobile Database Header UX、Table Cell Inline Editing、Drawer Motion、Universal Block +、Database UX Final Acceptance（HOLD）。本轮结束后停止，不开始 P9 或下一项；完全离线 roleless 缓存与 legacy lookup 性能债务保持既有边界。

## 2026-10-11 Page Tree / 10k Projection Performance Audit

基线 `7c7a7e528393e31f5af9261a2390fe20f0a888c3`；审计结论 **B — PASS WITH DEBT**。本轮只新增隔离 benchmark、文档和任务记录，没有改产品实现、schema 或 index；未开始 Database UX Final Acceptance 或 P9。完整数据路径与每组 `min/median/max` 见 `docs/p8-database.md` 的 Page Tree / 10k audit 章节。

环境为 Windows 11 x64、i7-13620H、Node 26.3.0、MongoDB 8.2.11、Headless Chrome 154。每个 workspace 50 普通 Page、1 Database、1 Block，Records 0/1k/5k/10k。API 有新 role / legacy roleless 两种 fixture，共 8 组；Web 与 SQLite 另含 server-projected legacy，共各 12 组。每项三次。API 用随机 Mongo DB，Web 用随机 IndexedDB DB，Desktop 用内存 SQLite。

10k role-aware Server Page navigation median 约 31ms、返回 50 页、仍检查 10,050 Page；legacy median 约 0.93s、返回仍为 50，profiler 合计约 20,051 docs/keys。Snapshot 含 10,050 Pages、1 Block、约 3.22MB JSON，server 生成约 178–195ms（网络和客户端写入未测）。Web hydration median 约 88–96ms、PageTree 约 0.1–0.2ms；IndexedDB 两次读取均线性读全量。SQLite nav 约 0.6ms，plan+fixture 推断 workspace 候选行为 10,050（无实际 row-visit counter）；role-aware parse 50，raw legacy parse/返回 10,050。

需保留的发现：旧本地 roleless snapshot 在 offline 时会把 Record Pages 放入 PageTree；服务端 snapshot 成功通常补 role 并 refresh，但若 revision 在首次 pages load 仍 loading 时触发，`ProductPagesStore.refresh()` 会直接返回且不排队，旧 projection 可能保留。现有测试尚未覆盖 roleless local tree → snapshot 投影 → tree 收敛的端到端链路。后续优先评估对此 race 的收敛保障与回归，再单独评估 legacy `$lookup`；本轮不修。

聚焦回归通过：API Database HTTP 1/1；PageTree / standalone Database route / Linked View 3/3；API benchmark 8 组、Web/SQLite benchmark 各 12 组，每组 3 次。SQLite `EXPLAIN QUERY PLAN` 没有实际 row-visit counter；文档将候选行数标为按 plan 与 fixture 推断，JSON.parse 次数是包装器实测。独立 reviewer 复核无其余 blocker；上述审计口径已修正，收尾前形成一个 audit commit 并确认 clean。Database UX Final Acceptance 仍待后续独立工作。

## 2026-10-11 Database Opening / Record Creation / Overlay 聚焦修复

本轮聚焦修复 **PASS**，但 Database UX Refinement **尚未 Final PASS**。基线 `7419e7043790085f855963f7a2d5a2b8a2fba73b`；本节随最终聚焦提交落库，提交哈希以当前 HEAD 为准。没有开始 P9。

Opening Settings 现于同一 Quiet Studio Popover/Menu 界面展示 Desktop、Tablet、Mobile 三组合法选项；Record/Property 交互一致、配置独立，沿用原 localStorage key/对象且即时保存。新建记录删除 Header inline title form，直接用“无标题”原子创建 Record + Page，prepare 后复用 Existing Record 的统一 Host；正式 Record Page 可编辑 Page.title/正文，标题与正文共同参与 close/switch/route flush，多数据库连续标题保存按固定来源目标等待成功同步后刷新 Table。

Overlay 已收敛：Desktop/Tablet Drawer 无 backdrop、背景可交互；Modal 与 Phone Right/Bottom Drawer 使用 native modal/focus trap/backdrop；Right Drawer 与 Mobile Sidebar 共用 `--mobile-sidebar-width: min(86vw, 320px)`，Bottom Drawer 保留 safe area。Filter/Sort 在 Desktop/Tablet 固定 Modal、Phone 固定 Bottom Drawer，不进入 preference；Property 继续按 Property preference。

验证：root typecheck、独立 Web typecheck、build:web PASS；最终 Database 49/49；Overlay/Settings/Pages/Editor 99/100，唯一旧 Editor 同步重试按钮 DOM 状态竞态隔离连续 3/3 PASS；完整 product 在 review 修复前 270/270。Database 设置/Linked View 的 remount 点击竞态均隔离定位并以真实 Escape/最终 UI 结果验证，相关重复 3/3、5/5。Desktop light/dark 与 390px Mobile 截图已人工检查。独立 review 首轮发现 2 个 title flush/refresh race，修复后二次 review 0 blocker。

下一轮仍需：Drag Handle visibility、Database Header icon consistency、Page Tree / 10k projection 性能审查、最终 Database UX Acceptance。本轮到此停止。

## 2026-10-11 Database UX 收敛完成收口

先前“暂停交接”已失效，用户恢复后任务继续完成。实现、验证、独立 review 与聚焦提交均已完成；详情见 `.agents/current-task.md`。导航语义提交为 `e8ed579`，UI/测试/文档由紧随其后的最终聚焦提交承载。完整 product 254/255，唯一旧 Toggle reload 用例随后完整 blocks 14/14 通过；Database 41/41、Overlay 8/8、Domain/Contracts/SDK/API domain/HTTP/MCP/storage/visual/desktop/performance、typecheck 与 Web/API/Desktop build 全通过。独立 review 0 merge blocker；不得开始 P9。

## 2026-10-11 Database UX 收敛暂停交接

用户因额度即将用尽要求立即停止，并交给 deepseek-harness 接手。当前 HEAD `e8ed579`，工作区有未提交 UI 集成改动，**任务未 PASS**，不得开始 P9。

已完成并提交：`e8ed579 feat(database): 收敛数据库与记录导航语义`。该提交增加服务端只读 Record Page role、新旧 P8 Record Page 的分页前 Sidebar 过滤、Database navigation DTO/HTTP/SDK、旧 Block 引用推导、LocalStore/IndexedDB/SQLite navigation projection，并保持直接 Record Page 读取与完整 snapshot。Domain 31、Contracts 17、SDK 22、API domain 12、HTTP 全套、MCP 30、Database 5k/10k performance、Desktop 18 均通过，无 skip。

未提交 UI 代码已经覆盖大部分需求：Database `[+] [drag]`、统一 Slash icon、accent drop indicator；中文 Header/空 Cell；Create/Link 同行与 Back/Cancel/Primary；`...` 五入口；shared device-aware Overlay；Property 管理与独立配置；Record create/existing 统一打开；复用 PageView 的 Record host；Database standalone route；PageTree 使用 navigation projection。完整文件和风险清单见 `.agents/current-task.md`。

暂停点：最后一次 Web typecheck 在 autofocus/protected-document/PageTree refresh 最后补丁前通过；最新补丁未重跑。Database product 全跑曾与子 Agent 的 Playwright runner 共用 7173，首个旧断言超时后 dev server 被另一个 runner teardown，余下连接拒绝不可作为产品结论。旧测试已部分迁移但未完成；用户叫停时定向 `linked views keep` 已主动终止。尚未做完整 product/storage/visual/build、三端视觉 QA、正式文档更新和独立 review；UI 未提交，workspace 不 clean。

接手必须先运行 `git status` 并保留未提交改动，然后按 `.agents/current-task.md` 的接手顺序完成。重点复核：Record Page tree filtering 与旧 P8 compatibility、Drawer/Modal focus/backdrop、viewport 配置、Record 原子创建、Linked View、hidden property 仅属于 View、Local-first、多 active editor flush。最终要求 0 blocker、聚焦 UI commit、workspace clean。不要开始 P9。

## 2026-10-11 P8.6 Database Final Acceptance（P8 Database COMPLETE）

P8.1–P8.6 全部 PASS；P8 Database COMPLETE。基线 `ed87dfe2838279d84cac838720af252ee985e37c`。本轮只做 Final Acceptance 与真实 blocker hardening，无新增 Database 产品功能；聚焦提交包含本交接记录，当前 HEAD 即验收提交。

Page.title 是 title Sort 的唯一来源。Page title 修改现在在事务中推进关联 Database version 并使用 CAS；第一页加载后若非 anchor Record title 使排序变化，旧 cursor 明确冲突并刷新，不继续沿变动序列制造 duplicate / missing。没有跨分页请求的全局 snapshot，旧 cursor 需要重读。

Relation → Rollup → Formula 读取投影、Formula chain / Relation cycle、两个 linked Views 的共享数据与独立配置、target 删除 incoming link cleanup / derived refresh / reload、dependency rejection、retarget、自关联、stale CAS / reference fence / transaction rollback 均通过。派生值不落库。Workspace scope 与 owner permission 未改变；Formula 使用严格 AST 和 fail-safe evaluator。

最终 bounds、Property/View/filter/sort、Relation/Rollup/Formula、Local-first/MCP、兼容性及 5k/10k Mongo profiler/explain 测量在 `docs/p8-database.md` 的 P8.6 章节。主要性能观察：默认首屏 41–50ms，next page 29–31ms；Filter 326/606ms，2-level Sort 614/1,213ms；derived 100 rows / 5,000 targets 589–593ms；10k cleanup overflow 在 263–292ms fail-closed，10,001 scanned / transaction rollback；被测 profiler 请求 usedDisk spills 为0。数据为本机隔离 Mongo 单次 fresh 观测，不是 SLA。

验证：Domain 31、Contracts 16、SDK 21、API domain 12、HTTP 24、MCP 30、完整 Product 244、Storage 7+11、Visual 7、Desktop titlebar 2、5k/10k performance 1；root typecheck 与 Web/API/Desktop builds 全通过。独立只读 reviewer **0 merge blocker**；diff check 与 UTF-8 无 BOM 通过。旧 View 无 config、旧基础 Record 和旧基础 Property Database 可读取，不需要手工 migration。

已接受限制：Database online-only / 离线 read-only，无 Database oplog、MCP tools 或跨客户端实时 push；无全局分页 snapshot；derived filter/sort 不支持；Rollup/Formula 读取时计算并受 100 rows / 5,000 target bound 限制；search/cleanup 超限 fail-closed；Formula 为轻量 JSON AST editor；date rollup min/max、People/Files、非 Table View、双向 Relation 不在 P8；390px 是 responsive Web，不代替 native 设备验收。到此停止，不开始下一阶段。

## 2026-10-10 P8.5 Advanced Properties 完成

P8.1–P8.5 PASS，P8.5 current；基线5179c584b335484268e9b9be995d529ef5b2f5d6。仅本阶段，一个聚焦commit；P8.6 not started，到此停止。

单向 multi Relation 使用稳定 Record ID[]（最多50、重复拒绝、保留顺序），允许self/纯关系图环；同Workspace target校验、source/target事务fence；Record删除按sourceDB总10000行有界清理incoming relation，不删Page/targetDB；依赖属性拒删。Rollup支持count/count_values和number sum/avg/min/max，只读、读取时计算，target限base属性。Formula严格AST+静态类型+同库cycle/depth验证，不执行任意代码；array/object enum拒绝且不调用转换hook。派生Filter/Sort明确拒绝，Relation仅empty/nonempty，保持P8.4分页语义。Page.title、online-only/MCP边界不扩大。

Quiet Studio Table配置/picker/Formula模板编辑、linked及目标变更派生刷新、动态标题、390px/离线/error/retry完成。Bounds与删除/类型/图规则详见docs/p8-database.md，检索入口docs/context/README.md。

验收：Domain30、Contracts15、SDK21、API domain9、HTTP27、MCP30、fresh完整Product243、Database32、Storage7+11、Visual7、titlebar2；typecheck及Web/API/Desktop build、diff与UTF-8无BOM通过，零新blocker，独立review0。Desktop node12/17的4个legacyprops及1个EPERM为已确认基线；附件两项早期fixture超时各隔离3/3，fresh全集通过；HMR模块状态分离由无源码修改的fresh服务复跑确认，未削弱断言或更新visual baseline。日志在系统Temp/p85-validation，截图在本任务仓库外p85-ui。

已知限制：date min/max延期；Rollup不可target relation/derived；derived query不支持；Formula轻量JSON AST editor；有界大库search/cleanup会fail-closed；没有跨客户端Database实时推送/离线复制/MCP扩展。390px为Chromium响应式，非原生宿主真机新增验收。

## 2026-10-09 Desktop Custom Title Bar 独立修复

基线 `50a914d15c716576926098672b9dde53960ffd9f`。实现和独立 review 完成（0 blocker）；仅桌面标题栏，不开始 P8.5。BrowserWindow hidden + 44px Windows/Linux native overlay，主题外观同步；ProductShell drag/no-drag 和 CSS env safe area；无 Product Topbar 的页面补 Electron fallback header。正式契约见 `docs/runbooks/desktop-production.md`，回归入口 `apps/web/tests/desktop-titlebar.spec.ts`。

Desktop/Web typecheck/build、相关 Desktop/ProductShell/interaction/theme 回归通过，新 titlebar 2/2。最终完整 product 238/239：linked-view 列上移点击 DOM detached/30s 超时，隔离单 worker 通过；没有削弱断言。Desktop node tests 12/17，5 项 SQLite 测试失败（Invalid block attributes、EPERM）；对应实现和测试与基线 HEAD hash 一致，未顺手修复。diff-check 通过。

真实 Windows 原生 UI 已检查窗口按钮、双击最大化/还原、顶部内容、普通/最大化布局、顶栏/侧栏/SyncStatus 点击和 Light/Dark。**真人鼠标拖动仍待确认**：Sky 对默认原生标题栏对照窗口同样无法移动，不能将自动化工具结果当作产品拖动失败或人工通过。已向用户请求确认并保留隔离 Eotion 测试窗口；后续只收尾这项验收，不启动 P8.5。macOS/Linux 原生视觉未验收。

## 2026-10-09 P8.4 Views + Filter + Sort 完成

P8.1–P8.4 **PASS**，P8.4 为 **current**；基线 `4f123090066b7016f1c658a3536f4bd88c624853`。本轮仅交付 P8.4，P8.5/P8.6 not started，到此停止。正式契约与检索入口见 `docs/p8-database.md`、`docs/context/README.md`。

同一 Database 多 Table View 支持创建、重命名、切换和安全删除。View 独立保存 AND filters、多级 sorts、visibleProperties/propertyOrder，records/properties 共享；linked 引用修改 Record 后按各自配置刷新并保留加载深度。六种基础 Property 有严格 operator/type/option ID 校验；空值双向排序均末尾，Record ID asc 最终兜底。服务端先筛选/排序再 keyset 分页；无 Filter/Sort 保留索引 limit+1 与批量 Page 投影，动态查询采用受校验的 Mongo 映射。

至少保留一个 View；被持久化 Block 引用的 View 拒绝删除，当前引用先切换并同步，不自动改写其它 Page。View 引用写入与删除使用事务 fence；配置和生命周期沿用 owner 权限、Database/View version CAS。Property 删除同事务清理所有相关 View 配置；option 删除只移除真正带该 option ID 的 Filter，保留空值条件。Page/Block 继续 Local-first，Database/View online-only，没有 Database oplog、新 MCP tools 或 Page DTO 数据扩展。

验收：Domain 24/24、Contracts 12/12、SDK 20/20、API domain 5/5、HTTP 27/27、MCP 30/30、完整 product 239/239、storage package 7/7、浏览器/Electron 11/11、visual 7/7，零 skip；根 typecheck、Web/API build、SDK 缺版本负向编译检查、git diff --check 与 UTF-8 无 BOM 通过。500 条记录的真实 Mongo profiler 回归验证默认首/次页查询成本。Desktop Light/Dark 与 390×844 View/Filter/Sort/列设置截图已人工检查；独立 review 最终 0 blocker。首轮两个旧回归超时后定向重复各 6/6，最终完整 product/storage 均通过，未削弱断言。日志和截图保留于 ignored `test-results/p84-validation/`、`test-results/p84-visual/`。

已知边界：仅 Table、20 条 AND Filter、10 条 Sort、最多 100 Property/View；没有 OR/nested、高级属性、列宽持久化、完整 Database offline sync 或跨客户端实时推送。动态筛选/排序、View 删除引用扫描、Property/option 清理成本随数据规模增长；共同 Database version 可能要求刷新重试。Page 并发改名不提供跨页快照隔离；未知操作恢复仅限客户端会话。移动验收为响应式 Chromium，不替代原生宿主真机测试；Web 保留既有大 chunk 提示。

## 2026-10-09 P8.3 Properties + Record Editing 完成

P8.1 PASS；P8.2 PASS；P8.3 **PASS / current**，基线 `014ddbbcb1b4be104a7c9c08950e1a545102de99`。本轮仅交付 P8.3，P8.4–P8.6 not started。正式契约与检索入口见 `docs/p8-database.md`、`docs/context/README.md`。

Property 支持 title/text/number/checkbox/select/date；非 title 可新增/删除，全部可重命名，select option 使用稳定 ID。Table 提供 typed cell 编辑、清空、校验、保存错误与冲突重试；linked 引用刷新共享数据并保留分页深度，390px 可编辑。Page.title 是唯一持久化标题来源，Record 读响应投影标题与 pageVersion，后续写入清除旧 title 副本；Table 标题写入与 Record 在同一事务内 CAS。新记录先输入非空标题，再原子创建 Record + Page。

HTTP/application/domain/repository 继续复用 Workspace owner 权限，拒绝跨 Workspace/Database 注入；schema/cell 使用共同 Database version，Property/Record/Page 使用对应版本条件。删除 Property 或 option 在同一事务内清理受影响值。Database 编辑仅在线；Page/Block 继续 Local-first，MCP 不新增工具，get_page 只返回 Database 引用。

验收：Domain 23/23、Contracts 12/12、SDK 19/19、API domain 4/4、HTTP 27/27、MCP 30/30，零 skip；product 237/237（Database 26 + 其余 211，单 worker）、storage package 7/7 与浏览器/Electron 11/11、visual 7/7、根 typecheck、Web/API build、git diff --check、UTF-8 无 BOM 通过。Desktop Light/Dark 与 390×844 cell/property/select 编辑截图已人工检查，保留在 ignored `test-results/p83-visual/`。最终独立 review 0 blocker。

已知边界：没有类型互转、Filter/Sort/其他 View、高级属性、Database MCP 或完整 Database offline sync；共同 Database version 可产生需刷新重试的冲突，删除 Property/option 的事务扫描成本随记录数增长。Page 离线改名继承现有 last-writer 同步语义；未知创建跨重启幂等恢复仍未扩展。移动验收为 Chromium 响应式证据，Web 保留既有大 chunk 提示。本轮到此停止。

## 2026-10-09 P8.2 Inline Database + Table View 完成

P8.1 PASS；P8.2 **PASS / current**，基线 `3ddab71784220fd928be9c411cc19965323679cc`。本轮只交付 P8.2，P8.3–P8.6 not started。实现与正式边界见 `docs/p8-database.md`，检索入口见 `docs/context/README.md`。

`/database` 在独立正文空行或 Toggle 真实子块打开选择器：新建 Database/默认 title Property/Table View/引用 Block 走同一 Mongo transaction；linked 绑定当前 Workspace 的既有 Database/View，不复制数据。Table 展示基础属性、分页及 empty/loading/error，390px 使用块内横向滚动。新增 Record 同事务创建普通 Page，标题沿用现有 Page 路由与编辑器；删除 Block 不删除 Database。Block props/MCP/Page snapshot 继续只保存引用；Database 数据没有完整 offline/sync。

未知提交按本次固定 Block/Page ID 核对；不能确认时会话内禁止同页面再次插入、同 Database 再次新建 Record，并提示联网刷新确认。周边正文继续本地保存。跨应用重启幂等恢复、结构化属性编辑、Filter/Sort、其他 View 与 Database MCP tools 均未实现。

验收：Domain 23/23、Contracts 12/12、SDK 19/19、API domain 4/4、HTTP 26/26、MCP 30/30，零 skip；完整 product 单 worker 231/231（含 Database 20/20 与 P7），根 typecheck、Web/API build、visual 7/7、`git diff --check`、UTF-8 无 BOM 通过。独立 review 最终 0 blocker。Connectivity 单张陈旧截图按现有 env 关闭诊断行的行为维护，视觉阈值未变；桌面明暗主题、空表、错误和 390px 初始/横向滚动截图已人工检查。

真实事务与权限使用隔离 Mongo replica set 测试，已关闭本任务启动的实例；Web 使用 mock transport，移动端证据为 Chromium 响应式截图。截图保留于 gitignored `test-results/p82-visual/`。Web 仍有既有大 chunk 构建提示。到此停止，等待用户下一个阶段指令。

## 2026-10-11 P7.5 Advanced Blocks 验收完成（P7 COMPLETE）

P7.1–P7.5 全部 PASS，**P7 Advanced Blocks COMPLETE**。本轮只做验收（不新增 Block、不开始 Database），基线 `84f5c0d`，验收记录见 `docs/p7-advanced-blocks.md` 的「P7.5 Advanced Blocks Final Acceptance」。

验收：新增 `apps/web/tests/product-p75-acceptance.spec.ts`（混合文档创建→编辑→缩进/重排→reload→浏览器进程重启→offline→reconnect→push/pull，含 ID/parent/orderKey 与 orphan/cycle 检查；旧 P5/P6 页面兼容）。`test:product` 211/211（`--workers=1`）、`test:storage` 11/11（含 Electron SQLite）、domain 17/17、contracts 6/6、storage 7/7、API domain 2/2、HTTP 24/24、MCP 25/25、typecheck/build:web/build:api、`git diff --check` 通过；`test:visual` 6/7，唯一失败仍是既有 `Connectivity backend unavailable desktop` 基线差异（21748 px，ratio 0.02），不更新基线。

独立只读 review 报 2 个 BLOCKER，均已修复并补回归：

1. 编辑器可产出 codec/domain 拒绝的结构（粘贴 `<ul><li><p>a</p><h2>b</h2></li></ul>`、`<blockquote><table>…` 或在 listItem 内用 `# ` input rule）→ 整页永久无法保存。修复：`apps/web/src/editor/contentRules.ts` 用 domain `EDITOR_NODE_RULES` 派生 `listItem`/`blockquote` 的 ProseMirror content，`useDocumentEditor` 关闭 StarterKit 对应节点；放不进容器的粘贴内容被提升到最近合法祖先，内容不丢。
2. 属性维度同类漏洞：`<ol type="A">`、`<ol start="abc">`、非法 cell span、HTML 注入 `blockId`。修复：`EotionOrderedList`（type 固定 null、start 归一化为正安全整数）、`tableNodes` cell span 归一化与 colwidth 不解析、`blockIdentity` 的 `blockId` `parseHTML: () => null`。回归 `product-content-rules.spec.ts`。

另外修复：P7.3 回归「Toggle 子块内 slash 折叠列表静默无效」（`isBlockCommandRangeSafe` 把包住选区的父 toggle 误判为被吞掉的 child owner）；测试环境「Vite watcher 因 Playwright 临时目录 EBUSY 崩掉 `pnpm dev`」（`vite.config.ts` 的 `server.watch.ignored`）。

当时记录的 Toggle summary MCP 保真度和服务端 props 校验缺口已在封板后边界修复中解决（见 `docs/p6-mcp.md` 与 `docs/p7-advanced-blocks.md`）。仍保留的已知限制：5,000 块连续输入仍是既有 O(N)/docChanged（基线约 112 ms/字符，本轮约 119 ms/字符）；真实设备输入法与原生宿主验收仍不由浏览器回归替代。运行 `test:storage` 前需清除 `ELECTRON_RUN_AS_NODE`。

环境：本轮在 `apps/web/package.json` 新增 `@tiptap/extension-blockquote@3.31.3` 与 `@tiptap/extension-list@3.31.3`（starter-kit 已依赖的同版本），新增依赖后需重启 `pnpm dev`。

下一步：P7 已封板，不开始 Database / Property / View / Relation 等下一阶段，等待用户指令。


## 2026-10-07 P7.3 Nested Blocks UX 完成

P7.3 已 PASS。Tab/Shift+Tab 缩进、拖拽嵌套、slash 上下文过滤、移动端缩进/反缩进、child attachment 顶层边界、hardBreak+marks 一致性全部落地，并走既有 moveBlock → block.move → LocalStore → sync。核心文件：apps/web/src/editor/nestedBlockInteractions.ts（单 PM transaction 移动整棵子树，MAX_BLOCK_DEPTH=8，`Decoration.node` 高亮不改正文 DOM）、apps/web/src/editor/blockCommandContext.ts（以 registry / allowedChildTypes / EDITOR_NODE_RULES 过滤 slash 与附件）、packages/domain/src/order.ts（LIS 保留旧 key、只给移动块补 gap）。

验证：product 189/189（`--workers=1`；默认多 worker 有本环境既有 flaky）、domain 13/13、contracts 6/6、storage 7/7、API domain 2/2、HTTP 24/24、MCP 22/22、Electron SQLite 17/17、test:storage 11/11、typecheck / build:web / build:api / git diff --check 通过；visual 6/7，唯一失败为既有 Connectivity 基线差异 21748 px。独立 review 0 blocker；已关闭移动端 Touch Toolbar 绕过上下文过滤（曾可在 listItem 内建出 codec 拒绝的 heading 导致整页无法保存）与工具栏选区 range safety，并补回归。

性能回归已修：拖拽把手由逐块 rAF 定位（5000 块 O(n²)，readyMs 38.5s）改为每帧一次批量定位（约 4.5s，与无把手基线一致）。

已知限制：附件仍只支持顶层插入且不参与块级拖拽；MCP nested document replacement 拒绝；大文档持续输入仍是 O(N)/docChanged；被拒绝的 drop 静默无提示。运行 Electron 用例前清除本沙箱默认的 `ELECTRON_RUN_AS_NODE=1`。下一步：P7.4 Table 未开始。

## 2026-10-06 P7.1 Advanced Blocks 交接

P7.1 Block Model Foundation 实现完成。阶段重定义：P7 由「协作」调整为 Advanced Blocks（P7.1 Block Model Foundation / P7.2 Rich Blocks / P7.3 Nested Blocks UX / P7.4 Table / P7.5 Acceptance），原协作内容顺延为 P7.x，docs/roadmap.md 与 docs/README.md 已同步。

- Block 单一来源：packages/domain/src/block-types.ts 的 BLOCK_TYPES / BLOCK_NODE_TYPES / BLOCK_CAPABILITIES / EDITOR_NODE_RULES / BLOCK_COMMANDS 同时服务 editor codec、server domain、MCP read 与 slash menu；BLOCK_TYPES 新增 toggle 属加性扩展，旧数据仍合法。
- 嵌套模型：复用 parentBlockId；packages/domain/src/block-tree.ts 提供 self-parent / missing parent / cross-page parent / cycle 校验与稳定树重建（buildBlockTree / flattenBlockTree / orderForDeletion）；LocalStore、SqliteLocalStore、BlockService、validateWorkspaceSnapshot 共用同一实现；reparent 走新的 block.move（contracts + LocalStore.moveBlock + SyncService）。
- 编辑器：EotionToggle + ToggleNodeView；折叠状态是 localStorage 偏好（eotion:collapsed-toggles），不进入 props；BlockIdentity 覆盖 toggle 子区块；PagePersistence 按 parent 分组分配 orderKey、parent 变化发 block.move、删除按子先于父排序。
- MCP：无新 tool；read 增加可选 parentBlockId/depth 并按深度优先返回，toggle 可读不可写。
- 验证：domain 10/10、storage 6/6、api domain 2/2、api mcp 16/16、web test:product 167/167（含新增 product-blocks，需 `--workers=1`；本沙箱默认多 worker 运行偶发与本次改动无关的 UI 超时，逐个单独运行均通过）、test:storage 11/11、root typecheck、build:web/build:api、git diff --check 通过。注意本沙箱默认 ELECTRON_RUN_AS_NODE=1，会让 3 个 Electron 用例报 Process failed to launch，运行前需清除该变量。test:visual 为 6/7，Connectivity backend unavailable desktop 在干净基线同样失败，属既有环境基线差异，与本阶段无关。
- 独立 review（只读）无 blocker；review 提出的 Major（新测试未接入脚本、BlockIdentity 身份继承、环/损坏树未 fail-closed、allowedChildTypes 未落地、toggle summary 假设）已在提交前修复并补回归测试。
- 已知限制：已有段落转 Toggle 会走一次 block 重建（旧段落 block 删除 + 新 toggle block 创建）；wrapIn 与 Quote 相同会留下尾部空段落区块；拖拽嵌套与 Tab/Shift+Tab 缩进属于 P7.3。
- 下一步：本轮只到 P7.1，不开始 P7.2。

## 2026-10-06 HarmonyOS 应用内补测交接

用户指定根 release/0.0.1-beta/Eotion-0.0.1-beta-harmony.hap，构建 a0d3a4da93eb，已通过 hdc install -r 覆盖安装 nova 14 (TLR-AL00/OpenHarmony-6.1.1.120)。用户帮登录后只执行应用内剩余项目；用户说已手测断网重连等，本轮不重复网络切换/kill。附件上传也由用户接手，当前未收到结果。

报告 docs/verification/device/mobile-harmony-in-app-2026-10-06.md。Workspace/Page/本次中文composition与基本输入/系统选择菜单通过；长正文末行caret被Touch Toolbar遮挡，Safe Area/IME FAIL；标题按钮实际H2，不满足原H1。图片/文件入口均可弹出ArkWeb系统选择界面，不可沿用旧Android picker失败推断Harmony。普通在线重开内容保留并已同步，不替代pending oplog或第二客户端闭环。网络/Session真正kill Gate未独立重测，完整Mobile Acceptance不得PASS。产品无修改。

原始证据在ignored根release/0.0.1-beta/runtime-verification/harmony-20261005，包含账号信息勿提交；提交证据在docs/verification/device/evidence/harmony-20261006。保留新Page“无标题HARMONY_ACCEPT_20261006”供复核与用户附件手测，当前App停在该Page，未改变设备网络/旋转设置。后续独立修复需先定位caret避让中的visualViewport/inset/滚动容器真实数据；当前只有源码线索，没有证明根因。

## 2026-10-04 公共官网与用户指南交接

`apps/site` 已实现独立 VitePress 官网：六节首页、download、8 篇 guide、changelog；版本/build 复用根 package.json，发布记录复用 apps/web/src/releaseInfo.ts。维护入口 docs/runbooks/public-site.md。版本/typecheck/build、339 链接/锚点/资源、2 SSR 回归、7 Playwright 与三尺寸 Light/Dark 视觉检查通过；独立 review 无剩余 blocker。

上线前配置真实 EOTION_SITE_ORIGIN、公开安装包 URL 与新官网 DNS/TLS。未配置 origin 时 noindex/robots 禁止抓取，不生成伪 canonical。APP origin 保持 https://eotion.evanpatchouli.space。eotion-site 只占本机 8002，现有 Web 8001 不变。Docker 完整镜像构建被 Corepack 访问 npm registry 网络错误阻断；同 Nginx 配置挂载静态产物的临时容器 HTTP 验证通过（公开路径 200，开发路径 404）。部署网络中应重跑完整 image build；本轮未发布公网服务。

## 2026-10-04 最新交接：Mobile 验收（仅 Android）

用户将本轮调整为只测 Android，nova 14 / HarmonyOS 不测。本轮最新 master 基线 3625f74，重新构建 APK 并覆盖安装现有 MuMu Android12，保持既有登录。报告及脱敏证据见 docs/verification/device/mobile-real-device-2026-10-04.md；原始日志/截图/探针在忽略目录 apps/mobile-hosts/release/runtime-verification/acceptance-20261004/。

Android Session 与 Workspace/Page、完全断网下两次 force-stop/restart（A/B 保留）通过；重连后需点击同步状态重试，随后已同步且服务端/独立 Web context 均读到 A/B。原生图片/文件 picker 均失败；javap 证据显示 XElement4.1.0 默认 WebView 没有 WebChromeClient/onShowFileChooser。Touch Toolbar 标题为 H2，不满足本轮 H1 要求；MuMu IME 高度0，真实 composition/键盘安全区未完成。Todo 正文短tap触发checkbox是另一个定位线索（正文位于label内）。仅提交文档与证据，未改产品。完整 Mobile Acceptance / P5.4 / P5 不能据此声明 PASS；下一步独立修复/补测上述边界，HarmonyOS以后补测。已有测试清单正文已恢复，新增无标题测试Page保留复核；网络/旋转设置已恢复。

以下为较早阶段背景，当前移动验收状态以上述报告为准。

> 仅在任务需要跨会话、跨 Agent、跨模型或暂停后继续时填写；任务完成后清理。

- Goal: P5.4 Real Sync 的完整退出验收。
- Current state: Web / Electron 的正式 local-first 链路与自动 E2E 已完成；P5.4 暂不标完整 PASS。
- Completed: Snapshot API/SDK、`page.move`、IndexedDB/SQLite 安全 hydrate、按当前账号 workspace 过滤 oplog、Page Tree/Editor 本地保存、Push→Pull、离线身份/工作区缓存、生产 Web Service Worker、保存与同步状态分离。
- Remaining: 在目标 Mobile WebView/Lynx 宿主使用稳定 HTTPS origin（或先决策 bundled/local origin 的迁移方案），完成真机完全断网重启、继续写入及重连验收，然后决定 P5.4 PASS。当前默认 LAN HTTP 开发地址不满足安全上下文，不能作为该验收路径。
- Key evidence: `docs/p5-real-sync.md`；独立 review 已检查覆盖保护、跨账号发送、活跃编辑器、空段落、Web/SQLite 语义。
- Files changed: `packages/contracts`、`packages/sdk`、`packages/storage`、`apps/api`、`apps/web`、`apps/desktop` 与 P5.4 文档/测试，详见本阶段提交。
- Validation completed: Web `test:product` 55/55、`test:storage` 9/9、`test:real-sync` 1/1、`test:offline-shell` 1/1；storage 6/6、Desktop 7/7、SDK 12/12、API domain 2/2、HTTP/Sync/File 全通过；相关 typecheck/build 与 `git diff --check` 通过。
- Decisions: 本地内容是 durable source of truth；Push 成功且无未同步本地 operation 才允许指定 workspace 的 snapshot replace；顺序多设备采用 Server 最后成功提交的 mutation，无 CRDT/revision merge。
- Next recommended action: 用户当前决定在 P5 Final Acceptance 前先推进 P5.7 UI/UX Foundation & Product Redesign。先做 P5.7.1～P5.7.4 设计阶段并通过 Gate A，再进入正式 UI 实现；范围见 `docs/p5-ui-ux-foundation.md` 和 `docs/design/*`。之后仍需处理或明确 P5.4 Mobile WebView 真机离线重启验收。
- Risks / blockers: Mobile LAN HTTP 无 Service Worker；IndexedDB pending 查询目前读取整个 oplog，历史 synced 记录很多时有性能成本（不影响当前数据正确性）。

## P5.5 后续上下文

P5.5 Attachments 已 PASS，见 `docs/p5-attachments.md`。附件通过既有 Block/oplog 同步；二进制在线上传，IndexedDB/SQLite cleanup queue 按 delete ack、存活引用与当前授权清理。产品回归更新为 72/72，storage/Electron 为 10/10，真实双客户端为 1/1；另完成线上 OSS 图片/文件、刷新、第二客户端、URL 字节和删除后 404 验收。GPT-6.1 Sol 独立 review 无剩余确定 blocker。P5.5 没有新增原生宿主，以上 P5.4 真机待验收依旧保留，也没有关闭整个 P5。


## P5.6 完成 / 下一阶段

P5.6 Settings & Preferences 已 PASS（2026-10-01），版本保持 0.0.1 / build 1，完整实现与验收见 docs/p5-settings.md。独立认证设置路由、宽屏双栏与 compact Index→Detail；昵称跨设备/缓存一致；scrypt 改密通过 Mongo 事务更新 hash/version 并 revokeAll，所有旧 Session 失效；Theme device-local system/light/dark 在生产入口前应用并实时响应系统；固定 Toolbar 默认 OFF，按 user/workspace/device 隔离且不关闭 touch/Slash；MCP/Agent 只有即将推出。

Web product 111/111、Settings 11/11、theme 3/3 + production 1/1、storage/Electron 11/11、offline-shell 1/1、real-sync 1/1；API/SDK/各端构建类型检查均通过。Light/Dark 1440×900、1024×768、390×844 实际截图与独立 review 无 blocker。真实双客户端验证昵称及改密后的旧会话/旧密码失效、新密码可登录。截图在系统临时目录 eotion-p56-visual-qa，临时测试 Mongo 容器已移除。

下一步：单独开始 P5 Final Acceptance。本次不声明整个 P5 PASS；上文 P5.4 目标移动 WebView/Lynx 真机完全离线重启边界仍保留。运行真实测试时可通过 EOTION_REAL_API_PORT / EOTION_REAL_WEB_PORT 避免占用现有服务，见 docs/runbooks/testing.md。


## P5.7 Design First

P5.7 已正式插入 P5.6 与 P5 Final Acceptance 之间。原因：当前核心功能链已成立，但现有 UI/UX 主要由工程实施逐步演化，用户希望在后续 P6+ 扩展前先冻结 Eotion 的视觉基调、交互原则和 Design System。

P5.7.1～P5.7.4 只做 Audit、Design Direction、Design System v1 和核心高保真页面；用户明确批准 Gate A 前不得重构正式 Product UI。P5.7.5 才是实现阶段，P5.7.6 建立 Light/Dark × Desktop/Tablet/Mobile 的 Visual Acceptance / screenshot regression 基线。

主计划：`docs/p5-ui-ux-foundation.md`。设计文档地图：`docs/design/README.md`。


## P5.7.1 Audit 完成 / P5.7.2 Stitch

P5.7.1 UI/UX Audit 已于 2026-10-01 PASS，核心问题见 `docs/design/ui-ux-audit.md`。重点包括：Editor giant bordered Card、Desktop/Tablet Sidebar 不可折叠、Sidebar footer row 不统一、Workspace/Page inline panel 推布局、稳定态 context/status 重复、Attachment nested card、upload placeholder 脱离插入位置、失败反馈重复、cleanup/raw HTTP 技术语言泄露、Settings detail 超宽屏偏窄、Slash Menu 中英双语重复。

用户明确偏好：展开 Sidebar 右上角与右下角圆角，左侧贴边；Login/Register 暂无明显问题，不作为 P5.7 重设计重点。

当前进入 P5.7.2。统一 Design Brief：`docs/design/stitch-design-brief.md`。第一轮在 Stitch 使用同一 1440×900 Desktop Page 场景探索至少 3 个视觉方向；用户选中/组合后再冻结 `design-direction.md` 和 Design System v1。Gate A 前不得修改正式 Product UI。


## P5.7.2 Quiet Studio 冻结

P5.7.2 已于 2026-10-01 PASS。Stitch 第一轮探索 Editorial Paper / Precision Studio / Ambient Focus，后续收敛为 Quiet Studio A/B，并最终批准 **Quiet Studio**：以 A 的 warm editorial / document-first 为主，吸收 B 的 Sidebar 层级、popover 精度和附件信息对齐；不采用 C 的 Document Card / purple / gradient / glassmorphism。

Stitch 导出规范存在 Newsreader、Material-style token、30/32px 冲突及虚构业务内容等不一致，因此不作为 source of truth。正式方向见 `docs/design/design-direction.md`；Eotion 自维护的规范见 `docs/design/design-system-v1.md` 与 `docs/design/DESIGN.md`。

当前进入 P5.7.3。Gate A 前仍不修改正式 Product UI。Stitch 后续仅用于 Dark/Mobile/Settings/companion states 等视觉稿，不再负责最终规范。


## P5.7.3 Dark Theme 冻结

Quiet Studio Dark Desktop Page 已于 2026-10-02 通过人工 review。正式 Dark palette 已写入 `docs/design/design-system-v1.md` 与 `docs/design/DESIGN.md`。Stitch 原始 `text-muted #73716A` 与 `danger #C9615D` 因关键 dark surface 对比不足被修正为 `#8F8D86` 与 `#D06A66`。其余 Dark tokens 保留 Stitch 推导值。Stitch prototype 中残留的 Newsreader / Material Symbols / 虚构 metadata 不属于 Eotion source of truth。

下一项为 Desktop Settings 高保真推演，重点冻结 Settings detail responsive width/cap、navigation density、setting row anatomy 与 form/control visual treatment。Gate A 前仍不修改正式 Product UI。


## P5.7.3 Desktop Settings 冻结

Quiet Studio Desktop Settings Light 已于 2026-10-02 通过人工 review。Stitch 的三档 viewport 导出尺寸和 HTML max-width 与文字汇报不完全一致，因此正式规范采用人工归一化行为：Settings navigation 240px；detail min 520px / max 740px；1280 目标约 620px、1440 约 700–720px、1600+ 封顶 740px；outer gutter 分别 48 / 64 / 80px。Settings 继续保持 P5.6 list-detail IA，不新增功能，不做 Card dashboard。

Light `text-muted` 从 `#8F8D86` 修正为 `#706E67`，在 Light sidebar/canvas 上均达到约 4.6+:1，适合作为 12–13px muted text。下一项为 Desktop companion states：Collapsed Sidebar、Workspace Popover、Page Action Popover、Attachment Upload Failed。Gate A 前仍不修改正式 Product UI。


## P5.7.3 Desktop Companion States 冻结

Quiet Studio Desktop Companion States 已于 2026-10-02 通过人工 review：Collapsed Sidebar、Workspace Switcher Popover、Page Action Popover、Attachment Upload Failed 全部 APPROVED。未新增 token。

冻结要点：Sidebar collapsed 后完全退出主内容区，document 保持居中；breadcrumb 前唯一 reopen control，视觉约 32×32px（实现可扩大 pointer hit area 至约 36–40px），tooltip 为“展开侧边栏”。Workspace Popover 约 240px、trigger offset 约 6px；Page Action Popover min-width 160px、4px padding，固定动作“新建子页面 / 重命名 / 移动 / 删除”。所有 Popover 使用 anchored floating layer，ESC / click-outside 关闭，focus return，keyboard navigation，且不得造成 Page Tree layout shift。

Attachment Upload Failed 固定在最终插入位置，文案“上传中断”，操作“重试 / 移除”；同一次失败仅一个主要错误 Surface，不出现重复全局 banner，也不暴露 cleanup / object-storage 等内部术语。

下一项：Mobile Page 高保真推演（390×844 baseline），重点解决 drawer、mobile topbar/gutters、touch toolbar、IME coexistence、narrow attachment 与 mobile sync/offline presentation。Gate A 前仍不修改正式 Product UI。

## Mobile Native Hosts（Android + HarmonyOS）

本轮为 `apps/mobile` 增加了自有原生宿主：`apps/mobile-hosts/android`（Kotlin/Gradle/AndroidX）与 `apps/mobile-hosts/harmony`（ArkTS/Stage/Hvigor），二者加载 `pnpm build:mobile` 产出的本地 bundle，不依赖 Lynx Explorer，也不复制 Web UI。根命令为 `mobile:android:apk`/`aab` 与 `mobile:harmony:hap`/`app`，详见 `docs/runbooks/mobile-native-hosts.md`。

已实测：Android APK/AAB 构建成功；HarmonyOS HAP/App Pack 在 DevEco 自动调试签名下构建成功、`hap-sign-tool verify-app` 通过，并在 nova 14（HarmonyOS 6.1）真机安装、启动、常驻；两个宿主都读取到打包进产物的本地 bundle（187528 字节）并触发 Lynx `onFirstScreen`/`onLoadSuccess`。

未完成/阻塞：共享 `main.lynx.bundle` 在运行时抛 `ReferenceError: discriminator is not defined`（Android 与 HarmonyOS 完全一致），Lynx 首屏后 WebView 白屏。解码 bundle 可见 `background-thread-script` 顶层使用未声明的自由变量 `discriminator`（zod discriminated-union 路径）；`packages/contracts` 源码用的是字符串字面量，故为移动端打包链路缺陷。修复该 bundle 后，P5.4 的 Mobile WebView/Lynx 真机离线重启验收才具备继续条件。

## 2026-10-04 Mobile Lynx runtime blocker 已关闭

基于master3ef33cf，Mobile从@eotion/contracts根入口取频道常量，意外加载Zod Sync/API schema；Lynx产物的discriminatedUnion初始化有未声明discriminator，旧nova14包本轮复现error201。已用@eotion/contracts/mobile隔离runtime-only协议，root重导出保持兼容，native runtime/host均未修改。contracts边界测试4/4、全要求构建/类型检查及SDK/API回归通过，独立review无blocker。

Android SDK API36、MuMu、HarmonyOS6.1 nova14都实际显示production登录页，无discriminator/error201，白屏消除。APK/HAP同88177B bundle，SHA256 0f98a277417b57bcb5fe5e4fed6b1ea22cba154ea8c87142bc4f9b2a22923664；解码和完整module graph确认无Zod/root，保留production URL/WebView/runtime marker。Android有非阻塞321/2298日志。Android输入和production认证错误响应已验证，nova14用户恢复用手机后未再操作；无测试账号/Session，Workspace/Page未验证。证据在忽略目录apps/mobile-hosts/release/runtime-verification/，正式边界与后续验收见docs/runbooks/mobile-native-hosts.md。本轮只关闭共享bundle blocker，不声明完整Mobile/P5 PASS。

## 2026-10-04 Harmony false-offline 已修复

nova14用户成功登录后显示离线，而MuMu正常。Harmony manifest缺ohos.permission.GET_NETWORK_INFO，设备已装HAP也只有INTERNET；官方ArkWeb FAQ确认缺网络状态权限可使navigator.onLine一直false。Web productSync在该值为false时于请求前退出，但auth.login仍可联网成功。只补GET_NETWORK_INFO后，HAP构建/签名/归档验证通过，覆盖安装保留Session，nova14同一页面由“离线 · 本地已保存”变为“已同步”，有前后UI layout/截图证据。runtime及Web同步逻辑均未变；version检查通过。正式说明见mobile-native-hosts runbook，证据位于忽略runtime-verification目录。完整Mobile/P5验收仍未整体关闭。

## Property Menu 共享 Popover（2026-10-12，NO PASS）

基线 d353e61；实现共享三项属性菜单、八类类型列表（不提交type mutation）、settings/header原span contenteditable rename、全局删除确认。既有select option与高级配置通过独立设置入口保留。

用户25分钟硬停止已触发，停止扩展。Web typecheck与diffcheck通过；Overlay共享popover定向2/2通过；属性定向最后落盘结果4失败，需续轮复验，不能宣称完成验收。失败名称：property menu keeps its focus；inline property rename；property schema mutations；edits versioned cells。详见 .agents/current-task.md 和 apps/web/test-results（ignored，可能被后续run覆盖）。截图仓库外 C:/Users/evanpatchouli/.codex/visualizations/property-menu，已视检桌面菜单、320类型列表、全局modal与右侧Drawer。

后续先复验真实caret末尾（Range collapse(false)可能anchor在span本身而非firstChild；不要在断言前手动改caret）、Name/名称和Deadline旧button选择器、嵌套options modal Escape只关闭顶层后属性面板仍可操作。不得实现Type Mutation、不得进入Final Acceptance/P9。

剩余legacy审计：A新增属性类型列表、Select Cell picker；B Relation复杂picker。本轮Property Menu已迁移。
