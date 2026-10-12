# P9 Multi-View

P8 Database 已 COMPLETE / SEALED。P9 在同一 Database 数据模型上增加呈现能力；P9.1A / P9.2 / P9.3 已完成，Web 支持 Table / List。P9.4A 建立 Board config/domain foundation；P9.4B 保护 Board grouping Property 的删除与改型；P9.5A 增加 Board renderer；P9.5B-1 增加显式 Card 分组修改；P9.5C-2 增加 Board grouping settings。

## P9.1A — Generic View Records Read Foundation

基线：master `13053793ffa4683e3ffdb6d7f1f512f270ebc499`。

### 读取契约

`GET /api/workspaces/:workspaceId/databases/:databaseId/views/:viewId/records`

查询使用 `DatabaseViewRecordsQuerySchema`：`limit` 默认 50、范围 1–100；可选 opaque `cursor`，最长 16,384 字符；拒绝未知字段。Filter / Sort 从已保存的 View config 读取，不作为请求参数。

返回 `DatabaseViewRecordsResponse`：`database`、`view`、`properties`、`records`、`nextCursor`。没有新增 Table 专属字段。Records 沿用现有 `DatabaseTableRecord` 投影类型，包括关联 Page 的 `pageVersion`、唯一标题源 Page.title 和只读派生属性。

SDK：`client.databases.getDatabaseViewRecords(workspaceId, databaseId, viewId, window?, signal?)`。

### 共享实现与兼容

`DatabaseService.getViewRecords()` 持有唯一读取流程。Legacy `getTable()` 委托该方法，`/table` endpoint 和 SDK `getDatabaseTable()` 的路径与返回结构保持不变。`DatabaseTableQuery` / `DatabaseTableResponse` 及其 runtime schemas 保留为 generic 契约的兼容别名；两条路径使用相同校验和 cursor 编码，可互相继续分页。

读取继续执行 Workspace permission、Database/View scope validation、有界 Property/Record loading、服务端 Filter 与 multi-sort、cursor decode/encode、Database/View version 与 config hash fence、Page.title projection、Relation/Rollup/Formula projection 和读取末尾版本复查。Derived read 的事务递归直接进入 generic 方法。权限、事务、错误文本和分页一致性保证保持 P8 行为。

### 本阶段边界

P9.1A 交付时 `DatabaseView.type`、Mongo enum 与创建契约仅支持 `table`；P9.2 的类型扩展见下文。不修改 Web、renderer、View selector、`queryTableWindow` 或 cursor helper，不增加 List/Board UI、分组或新同步能力。P8 已接受的 derived Filter/Sort 限制与跨请求无 snapshot 保证继续适用。

### 验证

定向 HTTP 回归验证 legacy/generic 数据与分页等价、title/Relation/Rollup/Formula 投影、Filter 与 multi-sort、scope 隔离，以及独立 Database version、View version、config hash fence。Contracts / SDK 增加 generic seam 回归，既有 Table 测试保留。

Contracts / SDK 各 23/23，两包 typecheck 通过；API 目标依赖闭包编译与 HTTP/service 测试 13/13 通过，独立 review 无 blocker。HTTP fixture 直接装载生产 HttpApiModule，保留真实权限守卫和所有原 Table 断言。完整 API build/typecheck 因未变的 MCP 源/依赖环境问题失败；没有修改 MCP 或依赖。实际命令与限制见 `.agents/handoff.md`。

## P9.2 — View Type Foundation

基线：master `8c6a7fe25f5879ad82ac43041ab62cdc06f052fe`。

### 类型与 API 契约

Domain 导出 `DATABASE_VIEW_TYPES = ['table', 'list', 'board'] as const` 和 `DatabaseViewType`。`DatabaseView.type`、创建请求的 runtime enum 与 Mongo enum 共享同一类型集合。创建 View 必须显式传入合法 type，`createView()` 原样持久化；创建 Database 的默认 View 仍为 `table`。更新 View 仍只支持原有 name/config，不提供更换类型接口。

View 创建、列表及 records 响应保留持久化 type。Generic `getViewRecords()` 接受三种合法 View，继续使用相同 Property/Record 数据、Filter/Sort 与分页流程；legacy `getTable()` 保持委托。没有新增 renderer 字段，Database Block 仍只保存 `{ databaseId, viewId }`。`linkInPage()` 与现有 Web 链接入口暂保留 table 限制，随后续 View UI 阶段接入新类型。

### 配置扩展与 Property repair

```ts
interface DatabaseViewConfig {
  filters: DatabaseFilter[]
  sorts: DatabaseSort[]
  visibleProperties: string[] | null
  propertyOrder: string[] | null
  options?: Record<string, unknown>
}
```

`options` 是可选的 View-specific 扩展对象；仅检查其为非 null、非数组的对象，保留内部未知 key/value，包括嵌套字段。顶层其余字段仍严格校验，既有 Filter/Sort/列配置与 Property reference 校验沿用原 validator。本阶段没有 Board/List/Calendar options 语义，不验证 `groupByPropertyId`，不建立 Property dependency 或 Capability Registry。

Property 删除、select option 清理和属性类型变更修复 config 时先展开已有 config，再更新受影响的通用字段。`options` 原样保留；未来 options 中的属性 ID 不会被本阶段清除或校验。后续 View Domain 必须另行定义这些引用的生命周期。

历史 `{ type: 'table', config: { filters, sorts, visibleProperties, propertyOrder } }` 继续合法；缺失 config 仍由 repository 投影原默认配置。默认配置不补 options，不更新历史文档，不运行 migration。Web、Table renderer、View selector、Product/Visual tests 均未修改；List/Board UI 留待后续阶段。

### 定向验证

Domain 35/35、Contracts 23/23 通过；两包与 SDK typecheck 通过。API Database HTTP/service 两文件及真实依赖闭包 scoped TypeScript compile 通过，真实 Mongo 测试 13/13、0 fail、0 skip，独立 review 无 blocker。

回归覆盖 Table 创建/读取、List/Board runtime validation 与 HTTP 创建/列表/records 的 type 保留、非法类型无写入、旧 config 无 options、嵌套未知 options 透传，以及 select option 清理、属性类型变更与属性删除后的 options 保留。首跑的旧 View 数量断言因新增 Board fixture 失效，改为核对三个确切 ID 后同组通过。未运行 Web Product、Visual 或 Final Acceptance；完整 API build/typecheck 沿用 P9.1A 已记录的环境限制，本轮未执行。

## P9.3A — List View Renderer Foundation

List View 在 `apps/web` 中按 `DatabaseView.type === 'list'` 选择独立的 `DatabaseListView` renderer。`DatabaseNodeView` 继续持有既有 loading、分页、刷新、Page.title projection、Filter/Sort、relation title resolve、record opening 和 Table editing 生命周期；List renderer 只负责纵向记录展示与打开记录，不新增 Database 模型或编辑架构。

List 使用既有 records 响应中的 title property（服务端投影自 Page.title），并按 `visibleProperties` 过滤非 title 属性、按 `propertyOrder` 排列。`visibleProperties === null` 时展示 title 之外最多三个已排序属性。Desktop / Tablet 保持 title 与属性横向布局，沿用既有 `<768px` Phone 断点切换为单列记录项。Table renderer 的 DOM 与交互未改。

定向 Web 验证：List renderer targeted product regression 1/1；既有 Table root/nested reference regression 1/1；既有 Phone Table overflow regression 1/1；Web typecheck 通过。未运行完整 Product、Visual 或 Final Acceptance；未实现 View Selector、View creation UI、Board、MCP 或 Local-first。

## P9.3B-1 — View Selector Integration

基线：`38b3ac54c43b30cef918641b8afa7599f81441b8`。本阶段接入既有 Database Block View Selector 与 P9.3A 的 Table/List renderer，不新增 View 管理能力。

Selector 打开时通过 product database service 的 `listProductDatabaseViews()` 读取 server `DatabaseView` entity；不在前端维护 view registry，也不从 renderer 推断 View。列表中的当前项由 Block attrs 的 `viewId` 高亮。点击 View 只执行 `updateAttributes({ viewId })`，保留 `databaseId`、Block identity、Page tree 与 Page snapshot 结构不变；已有 standalone Database route 的 `onViewChange` 路由入口保持原行为。

新的 `viewId` 由 `DatabaseNodeView` 既有 watch 触发 records reload，records 响应中的 `view.type` 继续选择现有 Table renderer 或 `DatabaseListView`。Selector 关闭、Table/List 切换、nested Database Block 与 Editor/NodeView identity 均复用既有 lifecycle；Phone 继续使用既有 `<768px` 两行 header，不新增 breakpoint。Create/Rename/Delete、Board、Calendar、Gallery、MCP、Local-first 与 Database domain 均不在本阶段。

定向 Web 验证：View Selector integration（Table + List、当前高亮、`viewId` 往返、nested block、Editor identity）1/1；Phone selector breakpoint 1/1；既有 View lifecycle 1/1；List renderer 1/1；long-name Phone header 1/1；共 5/5。Web typecheck 与 `git diff --check` 通过。未运行完整 Product、Visual 或 Final Acceptance；未发现 Create View 或 Board blocker。

## P9.3B-2 — Create List View

基线：`a9217b6496ce3d97f6f3999055c081fab5deb488`。Create View 沿用既有 `createProductDatabaseView()` / `POST .../views` API；View Selector 保留原有 Table 创建入口，并新增 List 创建入口。两者都创建新的 `DatabaseView`，不复制 Database、不创建新的 Database Block、不修改 Page Tree 或 snapshot。

新建 List 显式传入 `type: 'list'`，使用 `DEFAULT_DATABASE_VIEW_CONFIG`（`filters: []`、`sorts: []`、`visibleProperties: null`、`propertyOrder: null`，不增加 List 专属 options），成功后复用既有创建完成路径，只更新当前 Database Block 的 `viewId`。既有 watch 触发 reload，响应中的 `view.type` 进入 `DatabaseListView`；切回 Table 仍使用原 renderer 与 block reference。Rename/Delete、View settings、Board、Calendar、Gallery、MCP 与 Local-first 仍不在范围内。

定向 Web 验证：Table 创建回归、List 创建（View 数量/type/default config/block viewId/List renderer）、Table/List selector、nested block、Phone selector 共 5/5；Web typecheck 与 `git diff --check` 通过。未运行完整 Product、Visual 或 Final Acceptance；未发现 View CRUD 或 Board blocker。

## P9.4A — Board Config Foundation

基线：`e15d6d1b9f3519f0cb6d16f937209c98bc0d1370`。Board 继续使用同一个 Database / Property / Record 数据域与 `DatabaseView`，通过既有 `POST .../views` 创建 `type: 'board'`；不新增 Board Database、Record、Column 或专属创建 API。

### 配置模型与验证

```ts
interface DatabaseBoardViewOptions extends Record<string, unknown> {
  groupByPropertyId?: string
}
interface DatabaseBoardViewConfig extends DatabaseViewConfig {
  options?: DatabaseBoardViewOptions
}

const boardConfig: DatabaseBoardViewConfig = {
  filters: [],
  sorts: [],
  visibleProperties: null,
  propertyOrder: null,
  options: { groupByPropertyId: 'status' },
}
```

通用 `DatabaseViewConfig.options?: Record<string, unknown>` 保持可扩展，不限制未来 key 或嵌套字段。Board 可以不带 options，或使用 `options: {}`；本阶段不要求创建时已有 groupBy。`groupByPropertyId` 是 Property 的稳定 ID，不是 option ID 或显示名称。

`validateDatabaseViewConfig(config, properties, viewType = 'table')` 先执行既有 Filter / Sort / 列配置与同库属性校验，再仅对 Board 的自有 `options.groupByPropertyId` 执行分组语义校验：ID 必须是非空、首尾无空白、最长 256 字符的字符串；必须能在当前 Database / Workspace 的 properties 中解析；目标必须为 `select` 且存在合法 options 数组。空 options 数组合法。显式 null、undefined、非法 ID、未知 Property、其它类型或跨库引用拒绝。Table / List 的 options 继续沿用 opaque 语义。

API create 使用请求 type，update 与 generic records read 使用持久化 View type；创建/更新无效配置返回 400，读取已失效的 Board 配置沿用既有 409。Records response contract 同样使用返回的 View type 校验。创建/更新请求的通用 shape contract 不读取 schema；引用语义由 service 按当前库校验。默认 config、历史缺省配置、权限、事务、分页与 cursor fence 保持。

### Property repair 与阶段边界

Property 删除、select option 清理和 type change 的 repair 继续展开已有 config，仅修复原通用 Filter / Sort / 列字段，完整保留 options（含 groupByPropertyId 与未知字段）。本阶段不建立 Board dependency，不新增 delete/type-change conflict，也不自动清除 grouping 引用。

因此删除或改型 grouping Property 后，保存的 grouping ID 仍保留；后续 Board config 写入与 records read 会按当前 schema 拒绝失效引用。该生命周期策略留给 P9.4B，本阶段不声明完整 Board dependency 已完成。Board renderer、Kanban columns、View selector / Create Board UI、drag、MCP 与 Local-first 均未开始；不运行 Web Product、Visual 或 Final Acceptance。

### 定向验证

Domain 35/35、Contracts 24/24 与两包 / SDK typecheck 通过。API Database HTTP/service 两文件及真实依赖闭包 scoped TypeScript compile 通过；真实 Mongo 测试 13/13，0 fail、0 skip。回归覆盖 Board 创建/读取、select grouping、缺省 groupBy、非法 ID / text / number / missing / 跨库属性、PATCH 按持久化 type 校验、无效创建的事务回滚，以及 option cleanup / type change / delete 真实重写 config 后的 View version 与 options 保留。首跑发现新增 Board 测试 ID 与既有 fixture 重复；修正为独立 ID 后同组全通过，未修改产品错误处理或原断言。

独立 review 无 blocker。`git diff --check` 与 UTF-8 无 BOM 检查通过；未运行完整 API build/typecheck（沿用 P9.1A 已记录的 MCP/Zod 环境限制），未运行 Web Product、Visual 或 Final Acceptance。scoped 命令与后续边界见 `.agents/handoff.md`。

## P9.4B — Board Property Dependency

基线：`a344268135e45f49d06d230222dc0a6cf1df5cd7`。Board 分组依赖直接使用既有 `DatabaseView.config.options.groupByPropertyId`，不增加 Entity、Column、Group、dependency 表或 API。

Property 删除以及 `select` → 非 `select` 的类型变更，在现有事务内查询相同 Workspace / Database 下 `type === 'board'` 且 grouping ID 等于 Property ID 的 View。命中返回 `409 Conflict`，错误为 `Property is used as Board grouping property.`。检查早于 Database version / reference fence / Property / Record / View 写入；拒绝时原有实体、版本与 config 保持。不会自动清空 grouping ID，用户可先通过现有 View update 显式更换或移除分组，再修改 Property。View 创建/更新与 Property mutation 继续共用 Database version CAS 和 snapshot transaction。

同类型 no-op、Property 重命名以及 select option mutation 继续沿用已有行为。删除 select option 仍清理引用该 option ID 的 Record value，并修复受影响的 Filter；grouping ID、Sort、列配置与未知 options 保持。Record 值缺失的分组呈现留给后续 Board renderer。

没有 Board dependency 的 Property delete/type mutation 保持原行为；Table / List 的同名 `options.groupByPropertyId` 仍是 opaque 字段，不参与保护。既有 Property repair 保留 `filters`、`sorts`、`visibleProperties`、`propertyOrder` 与 `options` 的既定修复规则。依赖判断采用 scope 内的存在性查询，不枚举 View 或增加额外数量上限。

本阶段只处理依赖生命周期；Board renderer / UI / drag / MCP 均未开始。不运行 Web Product、Visual 或 Final Acceptance。
定向验证：API Database HTTP/service 真实依赖闭包 scoped TypeScript compile 通过，真实 Mongo 测试 14/14、0 fail、0 skip。新增回归覆盖 Board delete/type 409 与无写入、多个 Board 引用、显式释放依赖、无依赖 mutation 成功、Doing option 删除后的 Record cleanup 与 Board records 可读、Table/List opaque options 及原 View repair。一次独立 review 无 blocker；diff / UTF-8 无 BOM 检查通过。未执行完整 API build/typecheck（继承既有 MCP/Zod 环境限制），未运行 Web Product、Visual 或 Final Acceptance。

## P9.5A — Board Renderer Foundation

基线 `73f1762d2c860f1c8d96ff9548cdb569950d8bca`。`DatabaseNodeView` 按 records 响应的 `view.type` 路由 Table / List / `DatabaseBoardView`；Table 继续保持原有内联 DOM，不重写父组件。Board 是独立只读展示组件，接收既有 records、properties、config、formatValue，通过 openRecord 事件调用既有 openRecordPage / Record Drawer 流程。

`config.options.groupByPropertyId` 解析当前库 select Property，每个 option 按 schema 中的顺序形成一列（包含空列），以稳定 option ID 匹配 Record value。列内保留 generic records 返回的排序顺序，不做二次过滤、排序或请求。缺失/null/未知 option 值进入“未分组”列，只有存在这类已加载记录时才出现；其 Vue key 与真实 option ID 隔离。缺省 groupBy 显示“尚未配置分组属性”，不自动选择或写回配置。空 options 合法，仍可显示已有未分组记录。

卡片标题读取 title Property ID 下的服务端 Page.title projection，不读取 Record.title 副本。非 title 属性遵循 visibleProperties（null 表示全部）和 propertyOrder（未指定的属性按 schema 顺序补齐）。标题始终显示，点击复用既有记录打开方式。Board 不提供属性/标题 inline mutation、drag、select value 修改或 settings。

读取完整复用 product database loading：现有 loadProductDatabaseTable → SDK legacy /table → getTable → getViewRecords；没有 getBoardRecords 或专属 endpoint。Filter/Sort/projection、25 条分页、加载更多/refresh、权限和 cursor/version fence 保持。列记录数只表示当前已加载窗口，不声明全库总数。Database Block / Page snapshot 仍只有稳定引用，切换 renderer 不 remount Editor/NodeView，也不替换记录 Drawer 或丢失 draft。

Desktop / Tablet 在 Board 内局部横向滚动，列保持可读宽度；Phone 沿用 `<768px` 断点堆叠单列，不使页面横向溢出。没有新增 breakpoint。Board 创建/分组配置 UI、drag/mutation、MCP、Local-first 留待后续阶段。

定向验证：Board 三项（renderer/分组/投影/配置/Filter/Sort/Tablet/Phone/记录打开、Table/List 往返与 Drawer draft、缺省 grouping/空 options）+ 既有 List、Table root/nested、Phone Table、Phone Filter/Sort snapshot draft 共 8/8，通过（workers=1，retries=0）。Web typecheck 通过，独立 reviewer 无 blocker。未运行完整 Product suite、Visual Acceptance 或 Final Acceptance。
## P9.5B-1 — Board Card Mutation Foundation

基线 `90f8d9d0fe0db4030cbd588881298f0c5d7cab23`。Card 使用共享 select picker 显式选择目标分组，不实现拖拽。仅当当前 Board 的 `groupByPropertyId` 指向 select Property 时开放操作；选择稳定 option ID，未配置或非 select 引用不可 mutation。已确认值是 picker 与列位置的唯一显示来源。

复用 `updateProductDatabaseRecordCell` → SDK `updateDatabaseRecordCell` → `PATCH .../records/:recordId/cells/:propertyId`，携带现有 Database/Record version CAS。修改的是 Record.properties[groupByPropertyId]，不写 View config、不增加 Board/moveCard API。沿用 application service 的在线/auth/workspace gate、数据库 mutation serialization 和成功后的 Database updated 通知；已加载 Views 重读原窗口，继续服务端 Filter/Sort/projection/分页语义。

父 NodeView 在提交前复核当前 View type、分组 Property、Record、option、可编辑/在线状态；提交期间禁用分组操作。成功后通过既有 records refresh 将 Card 放入目标列；失败保留已显示 records/config 并显示错误，错误处提供“刷新记录”入口，用户可明确刷新后重试；409 不自动重读或覆盖当前状态。没有 optimistic update、rollback UI 或离线写入。Page/Block snapshot、LocalStore/oplog、Editor/NodeView identity、Record Drawer 和 draft 生命周期保持。

本轮不实现 Drag、Board position、WIP limit、Card customization、MCP 或后续 mutation 能力。不运行 Full Product、Visual 或 Final Acceptance。
定向验证：新增 mutation 5/5，既有 Board/Table/List/Phone/snapshot/cell failure 回归 10/10，Web typecheck、diff 与 UTF-8 无 BOM 检查通过。覆盖 select 分组写入/目标列/其他记录与 config 保持、linked Table/List、非 select 不可操作、失败原状态、409 显式刷新与新 CAS 重试，以及 mutation 后 Editor/NodeView/Drawer/draft identity。独立复核无剩余 blocker。

## P9.5B-2 — Board Drag Mutation Foundation

基线 `23f3b0a1c0a232309611709632633f4a817d7545`。Desktop Card 使用原生 HTML5 drag/drop；drag session 仅属于当前 Board 组件，列提供目标高亮。Select option ID 是目标值，“未分组”列始终可见（含空列），目标值为 null。Phone 继续通过共享显式 picker 完整修改分组，沿用既有 `<768px` 布局，没有 touch drag framework 或新 breakpoint。

拖拽与 picker 共用 `changeBoardGroup(recordId, optionId: string | null)`，仅将目标转成已有 grouping Property 的 cells PATCH，携带 Database/Record CAS。非 null 必须匹配当前 select option；当前缺失/null/未知 option 值归为未分组，同分组 drop 为 no-op。没有 Board API、position、ordering、optimistic move 或 rollback；pending 禁用操作，成功 records refresh 后移动，失败/409 留在原列并提供显式刷新重试。

本地 Board cell mutation 期间将数据库通知延后；成功主动 refresh 前消费已有通知，避免 self-notify 触发第二次完整窗口刷新。刷新期间收到的新通知在 mutation 完成后继续处理，linked Table/List 和真正的 external update 保持可刷新。异步写回仍检查 user/workspace/database/view scope，不重建 Page、Editor、NodeView 或 Drawer。

本轮仅 Drag foundation；不运行 Full Product、Visual Acceptance、Final Acceptance，不进入 Board settings、动画、reorder、MCP 或 Database local-first。

定向验证：最终组合 15/15（workers=1 / retries=0），Web typecheck、diff 与 UTF-8 无 BOM 检查通过，独立 review 无 blocker。实际请求计数覆盖唯一 cells PATCH、正常成功只增加一次 Board records GET；暂停成功后的 records GET 并发送 external event，验证读取完成后继续补刷和新值显示。另覆盖原生 drag、pending、不分组 null/picker、同列 no-op、失败/409重试、linked Table/List、Phone layout/picker、Editor/NodeView/Drawer/draft 与 snapshot。中间一次 draft 断言出现原标题，后续单独及最终组合通过，原断言保持。

## P9.5C-1 — Board View Creation Entry

基线 `a70c8b9a41de42d3b38ac5997d33df314867edff`。既有 View Selector 创建区域新增“新建看板视图”，沿用 Table/List 的 `createView(type)`、`createProductDatabaseView()` 与 `POST .../views`，提交 `type: 'board'`。默认名称为“看板 N”，配置严格使用 `DEFAULT_DATABASE_VIEW_CONFIG`：`filters: []`、`sorts: []`、`visibleProperties: null`、`propertyOrder: null`，不补 options 或 groupBy，不猜测已有 select Property。

成功后复用 `switchView(created.id, true)`，当前 Database Block 仅更新 `viewId`；既有 watch 重读 records 并进入 `DatabaseBoardView`，显示“尚未配置分组属性”。无 select Property 也允许创建。Database、Records、Page、Block 不复制；Editor/NodeView 与记录 Drawer 生命周期沿用已有流程。Table/List 创建语义保持，Phone 复用原 View menu 与两行 header。

确定性 4xx 创建失败清除待创建请求，后续点击按当前选择的类型重新创建；提交结果未知时保留原 ID 的同类型重试，阻止改点其它类型误用旧请求，并提示先重试原类型视图。

本轮只开放创建入口。Grouping settings 与无可用 select Property 的设置 UX 留给 P9.5C-2；不修改 Board config Domain/API、renderer 或 drag，不运行 Full Product、Visual 或 Final Acceptance。

定向验证 9/9 加原有 Table 创建生命周期 1/1，通过（workers=1 / retries=0）。覆盖唯一创建 POST/type/default config、当前 Block 与 linked 引用、数据无复制、Editor/NodeView/Drawer/draft/snapshot、390px 无 select 创建与入口可访问，以及确定性失败和未知结果的跨类型重试保护。Web typecheck、diff 与 UTF-8 无 BOM 检查通过；独立复核无剩余 blocker。

## P9.5C-2 — Board Grouping Settings

基线 `bfe51bf85ada8677b7e26cd504366097d217c12d`。Board 的现有 Database View Settings 新增仅对 `view.type === 'board'` 显示的“分组属性”入口，继续使用现有 `DatabaseSettingsSelect` 与 Overlay；Table / List 的设置菜单不显示该入口，Phone 继续使用既有 `<768px` bottom drawer。

候选属性严格取当前 Database 的 `type === 'select'` Properties，首项为“未设置”。保存复用 `saveViewConfig()` → `updateProductDatabaseView()` 与现有 `expectedDatabaseVersion` / `expectedViewVersion` CAS、409 刷新和 notification flow。写入只更新 `config.options.groupByPropertyId`，展开并保留 `filters`、`sorts`、`visibleProperties`、`propertyOrder` 及未知 options；清除时删除该 key，其他 options 保持不变。保存成功后直接更新当前 View config，Board 使用既有 records 立即按新属性重算列，不修改 Record。

没有 Select Property 时设置仍可打开并显示“没有可用的选择属性”，不会创建 Property；离线时 selector 与保存按钮不可写。共享 `viewId` 的 Block 通过同一 View config 收敛，不同 `viewId` 保持独立。未新增 Board API、settings endpoint、Property mutation、renderer、drag、MCP 或 local-first 能力。

定向验证新增 3/3，并与相邻回归组合 13/13 通过（workers=1 / retries=0）：覆盖候选过滤、View config 字段/unknown options 保留、Status → Priority、清除 grouping、Record 不变、shared/independent View、Table/List 隔离、无 Select、390px/离线只读与 View 409 conflict。Web typecheck 通过；未运行 Full Product、Visual Acceptance 或 Final Acceptance。
