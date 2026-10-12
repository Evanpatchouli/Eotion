# P9 Multi-View

P8 Database 已 COMPLETE / SEALED。P9 将在同一 Database 数据模型上增加呈现能力；当前仅开始 P9.1A，不增加 View 类型或 Web UI。

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

`DatabaseView.type`、Mongo enum 与 create/update View 仍仅支持 `table`。不修改 Web、renderer、View selector、`queryTableWindow` 或 cursor helper，不增加 List/Board、分组或新同步能力。P8 已接受的 derived Filter/Sort 限制与跨请求无 snapshot 保证继续适用。

### 验证

定向 HTTP 回归验证 legacy/generic 数据与分页等价、title/Relation/Rollup/Formula 投影、Filter 与 multi-sort、scope 隔离，以及独立 Database version、View version、config hash fence。Contracts / SDK 增加 generic seam 回归，既有 Table 测试保留。

Contracts / SDK 各 23/23，两包 typecheck 通过；API 目标依赖闭包编译与 HTTP/service 测试 13/13 通过，独立 review 无 blocker。HTTP fixture 直接装载生产 HttpApiModule，保留真实权限守卫和所有原 Table 断言。完整 API build/typecheck 因未变的 MCP 源/依赖环境问题失败；没有修改 MCP 或依赖。实际命令与限制见 `.agents/handoff.md`。
