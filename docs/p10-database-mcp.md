# P10 Database MCP Extension

状态：P10.1 最终契约已批准；P10.2 Read Tools 实施中。P10.2 在完成自动化与真实客户端验收前不得标记 PASS，亦不改变版本号。

## 范围

本阶段继续复用现有 Database / Property / Record / View 领域模型、权限检查、查询引擎和版本栅栏。MCP 不直接访问 MongoDB Repository，不创建第二套 Filter / Sort 引擎。

保留 P6 六个既有工具：
- `eotion_list_workspaces`
- `eotion_list_pages`
- `eotion_search_pages`
- `eotion_get_page`
- `eotion_create_page`
- `eotion_update_page`

P10.2 新增五个只读工具：
- `eotion_list_databases`
- `eotion_get_database_schema`
- `eotion_query_database`
- `eotion_get_record`
- `eotion_resolve_relation_records`

P10.2 不实现任何数据库写工具。Record / Property / View 写入、持久化幂等回执和数据库重命名属于后续 P10.3。

## 工具契约

### `eotion_list_databases`

输入：`workspaceId`、可选 `cursor`、`limit`。

返回有界数据库摘要列表与 `nextCursor`。默认页大小 25，最大 100。游标遵守现有数据库列表的稳定 ID 约束。

### `eotion_get_database_schema`

输入：`workspaceId`、`databaseId`。

返回数据库摘要、Properties、当前所有 Views 和能力描述。Properties 最多 100 项，Views 最多 100 项。读取期间若检测到数据库版本变化或配置无效，拒绝返回混合版本的 Schema。

当前 View 类型为 `table`、`list`、`board`、`timeline`。这只表示读取现有通用 View；不代表 Gallery / Calendar / Chart 已实现。

### `eotion_query_database`

输入：`workspaceId`、`databaseId`、`viewId`，可选 `cursor`、`limit`、`filters`、`sorts`、`propertyIds`。

返回数据库摘要、保存的 View 摘要、所选 Properties、Records、`nextCursor` 与 `effectiveQuery`。

规则：
- 未提供 `filters` / `sorts` 时，使用保存的 View 配置。
- 提供 `filters` 时，整体替换本次查询的 Filter；未提供则保留保存的 Filter。
- 提供 `sorts` 时，整体替换本次查询的 Sort；未提供则保留保存的 Sort。
- 空数组表示本次查询明确不使用对应条件。
- 临时配置只影响当前查询，不更新保存的 View。
- Filter / Sort 必须通过现有领域层的属性类型与操作符校验。
- 默认页大小 25，最大 100；Filter 最多 20 条，Sort 最多 10 条，Properties 投影最多 100 个 ID。
- 若指定 `propertyIds`，输出只包含所选属性，并自动包含 Title Property；查询内部仍使用完整属性集合完成过滤、排序与派生值计算。
- 查询游标绑定 Workspace、Database、View、Database/View 版本、有效 Filter / Sort 配置和锚点 Page 版本。下一页请求必须重复相同的临时 Filter / Sort；更换条件后复用旧游标会返回冲突。Property 投影不改变排序或分页，因此不参与游标哈希。
- 查询复用 `DatabaseService.getViewRecords`。不得改用无界的 `listRecords`，不得在客户端重排当前页。

### `eotion_get_record`

输入：`workspaceId`、`databaseId`、`recordId`。

返回单条 Record 的稳定投影，包含 Page 标题对应的 Title Property、Record 版本和 Page 版本。Formula / Rollup 派生读取遵守现有快照事务与数量限制。

### `eotion_resolve_relation_records`

使用严格的 `mode` 联合类型：
- `search`：可选搜索词、游标和结果上限，搜索目标数据库中的候选记录。
- `resolve`：根据不超过 50 个唯一 Record ID 解析 Record ID、Page ID 与标题。

候选结果最多 50 条，搜索遵守现有 5000 候选记录扫描上限。目标数据库和记录必须属于当前用户可访问的工作区。

## 安全与错误

- 用户身份只能来自已验证的 MCP Token，不接受调用方传入的 userId。
- 每次调用都校验 Workspace 权限、Database / View / Record 归属。
- 缺失对象与无权访问统一为不泄露对象存在性的 `NOT_FOUND`。
- 读取工具将领域异常映射为 `INVALID_ARGUMENT`、`NOT_FOUND`、`CONFLICT`、`UNAVAILABLE`、`LIMIT_EXCEEDED` 或 `INTERNAL`。
- 所有工具输出上限为 1 MiB；过大响应拒绝返回。
- MCP 工具注解不替代服务端权限检查。

## P10.2 验收门槛

至少完成：
- MCP 合约测试：严格输入、输出形状、Filter / Sort 约束和上限。
- 真实 MCP Client 集成测试：数据库列表、Schema、Record 读取、Relation 搜索/解析。
- Table / List / Board / Timeline 四种 View 的查询。
- 临时 Filter / Sort 替换语义、保存配置不变、跨页游标一致性和查询条件变化后的游标冲突。
- 越权访问不泄露 Workspace / Database / Record 信息。
- 响应大小限制、派生属性读取、数据库版本并发冲突。
- 既有 P6 六工具保持名称、Schema 和语义兼容。

验收命令应至少包括：

```bash
pnpm typecheck
pnpm build:api
pnpm --filter @eotion/api test:domain
pnpm --filter @eotion/api test:http
pnpm --filter @eotion/api test:mcp
```

完整阶段还需使用真实 MCP Inspector / Codex Client 验收。仅构建成功不等于 P10.2 PASS。
