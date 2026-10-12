# P9 Multi-View

P8 Database 已 COMPLETE / SEALED。P9 在同一 Database 数据模型上增加呈现能力；P9.1A 已完成，P9.2 建立 View 类型与配置扩展边界，Web UI 继续沿用现有 Table。

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
