# P10 Database MCP Extension

状态：P10.1 契约已批准；P10.2 Read Tools 及验证修复已通过 `2aad764` 合入 master；P10.3 七写工具 Scope PASS 的历史交付保持。**P10.4 FINAL HOLD（2026-10-26），P10 未 COMPLETE**：本轮完整 Product508/511、独立Database252/254失败；API/包测试、真实Client74条、真实Web50条、Visual13/13通过。候选 `217f627` 未集成 master，完整证据与阻断见 [最终验收](verification/p10-final-acceptance.md)。版本保持 0.0.1 / build 2，P11.6 继续 HOLD。

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

P10.2 当时不包含数据库写工具；本轮 P10.3 新增下文七个写工具，沿用前十一工具契约。P10.3 Scope PASS 不代表 P10 COMPLETE，也不解除 P11.6 HOLD。

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
- 保存的 View 配置非法时先返回冲突，临时条件不能掩盖坏配置。只有旧 View 缺少 `config` 字段时使用默认配置；显式 `null` 不属于缺省兼容。
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
- 所有工具成功结果 DTO 在实际序列化为 UTF-8 JSON 后上限为 1 MiB；过大响应拒绝返回。协议同时携带结构化结果与文本 JSON，完整 HTTP 响应包含两份 DTO 和封装开销，沿用 P6 的大小定义。
- Record 文本和 Select options 沿用现有领域契约，不额外缩小合法值范围；实际输出仍受上述字节上限约束。新读取工具超限返回 `LIMIT_EXCEEDED`，P6 工具保留既有通用错误语义。
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

P10.2 已完成上述自动化及真实 MCP Inspector 验收并合入 master；本轮继续执行原 P6/P10.2 回归，不按历史“实施中”状态重复实现。

## P10.3 Write Tools 契约

所有输入对象均严格拒绝未声明字段，身份仅取自验证后的 MCP Token。新工具不接受实体 ID、orderKey、userId、createdAt/updatedAt 或持久化内部字段；Record、Page、Property、View 的新 ID 由应用服务生成 UUID，Record Page 顺序使用现有 `nextOrderKey`。Select option 的业务 ID 沿用现有定义和引用规则。

共用必填输入：

```ts
type Scope = {
  workspaceId: StableId
  databaseId: StableId
  expectedDatabaseVersion: Version
  idempotencyKey: string
}
// StableId：1–256字符、首尾无空白；Version：正 safe integer。
// idempotencyKey：trim 后1–128字符；name/title：trim 后1–200字符。
```

| 工具 | 除 Scope 外的完整输入字段 | 严格成功输出 |
| --- | --- | --- |
| `eotion_create_record` | `title: string`, `properties?: Record<StableId, Value>` | `{database: DatabaseSummary, record: RecordDto}` |
| `eotion_update_record_cell` | `recordId: StableId`, `propertyId: StableId`, `value: Value`, `expectedRecordVersion: Version`, `expectedPageUpdatedAt?: ISO datetime` | `{database: DatabaseSummary, record: RecordDto}` |
| `eotion_create_property` | `name: string`, `type: PropertyType`, `options?: {id: StableId, name: string}[]`, `config?: PropertyConfig` | `{database: DatabaseSummary, property: PropertyDto}` |
| `eotion_update_property` | `propertyId: StableId`, `expectedPropertyVersion: Version`, `name?: string`, `options?: {id: StableId, name: string}[]`, `config?: PropertyConfig`；至少一个 patch 字段 | `{database: DatabaseSummary, property: PropertyDto}` |
| `eotion_create_view` | `name: string`, `type: 'table'\|'list'\|'board'\|'timeline'`, `config?: ViewConfig` | `{database: DatabaseSummary, view: ViewDto}` |
| `eotion_update_view` | `viewId: StableId`, `expectedViewVersion: Version`, `name?: string`, `config?: ViewConfig`；至少一个 patch 字段 | `{database: DatabaseSummary, view: ViewDto}` |
| `eotion_rename_database` | `name: string` | `{database: DatabaseSummary}` |

值及配置复用现有 domain validator：

```ts
type PropertyType = 'title' | 'text' | 'number' | 'checkbox' | 'select' | 'date'
  | 'relation' | 'rollup' | 'formula'
type Value = string | number /* finite */ | boolean | null | StableId[]
  | { start: string; end?: string; timeZone?: string }
type PropertyConfig = { targetDatabaseId: StableId }
  | { relationPropertyId: StableId; targetPropertyId: StableId;
      aggregation: 'count' | 'count_values' | 'sum' | 'avg' | 'min' | 'max' }
  | { expression: FormulaExpression; resultType: 'string' | 'number' | 'boolean' | 'date' | 'null' }
type ViewConfig = {
  filters: DatabaseFilter[]
  sorts: DatabaseSort[]
  visibleProperties: StableId[] | null
  propertyOrder: StableId[] | null
  options?: Record<string, unknown>
}
```

`FormulaExpression` 为已有 AST；Date、Select、Relation、Formula/Rollup 配置、依赖图和引用保护均以既有领域契约为准。创建 Select 必须提供 options（可为 []），其他类型不接受 options；Relation/Rollup/Formula 必须提供对应 config，基础类型不接受 config。Relation 最多50个唯一 Record ID；Filter 最多20项、Sort 最多10项且属性不重复，列配置最多100个唯一属性 ID。View.options 外层保留未知 JSON 扩展；已知 Board/Timeline 配置继续按实际 View 类型校验。Property/Date/Formula 对象及 ViewConfig 顶层拒绝未知字段，不引入第二套校验模型。

输出复用 P10.2 的严格业务投影，完整字段如下；未列字段拒绝，`?` 字段缺省时不输出，不返回 Mongo/fence/receipt 内部字段。

```ts
type DatabaseSummary = {
  id: StableId; workspaceId: StableId; name: string; version: Version
  createdAt: string; updatedAt: string
}
type PropertyDto = {
  id: StableId; databaseId: StableId; workspaceId: StableId
  name: string; type: PropertyType; version: Version
  createdAt: string; updatedAt: string
  options?: {id: StableId; name: string}[]
  config?: Record<string, unknown>
}
type ViewDto = {
  id: StableId; databaseId: StableId; workspaceId: StableId
  name: string; type: 'table' | 'list' | 'board' | 'timeline'; version: Version
  createdAt: string; updatedAt: string; config?: ViewConfig
}
type RecordDto = {
  id: StableId; databaseId: StableId; workspaceId: StableId; pageId: StableId
  properties: Record<StableId, Value>; version: Version
  createdAt: string; updatedAt: string; pageVersion: string
}
```

### 省略、空值、CAS 与关联修改

- `create_record` 原子创建 Record 与 `role: database-record` 的 Page；省略 properties 使用空初始值。Title 唯一持久来源是 Page.title，不能在 properties 中另写 Title。Formula/Rollup 初始值和后续 Cell 写入均拒绝；返回记录继续复用已有服务端派生投影。
- `update_record_cell` 必须提供一个 value，仅更新一个 Record 的一个属性；沿用通用单 Cell mutation，不使用 P11 batch/context 调度。可空值用 null 清除，Relation 用 [] 清空；Text 的空字符串是合法值，Title 空白/null 拒绝。除 Database/Record CAS 外，Title 必须校验 expectedPageUpdatedAt；普通 Cell 沿用原有行为，不额外使用 Page CAS。
- Property 的 name/options/config 省略则保留；options/config 提供时完整替换。Select 的 [] 表示清空选项，保留同事务 Record 值和 View Filter cleanup；config:null/options:null 拒绝。重复 Title、数量限制、Relation 目标重定向及派生依赖保护照常执行，update 不接受 type。
- View 创建省略 config 使用既有默认值；更新省略 config 保留原配置。提供 config 时完整替换，必须提供四个通用字段；空 filters/sorts 表示清空，visibleProperties/propertyOrder 的 null 保留既有默认列语义。config:null/options:null 拒绝。完整替换需带回需要保留的 options 扩展，传入的未知扩展原样保存；仅改 name 不覆盖 config。update 不接受 type。
- 每个首次成功写入使 Database version +1；新 Record/Property/View version 为1。单 Cell 更新使 Record version +1（含同值更新，沿用现有单 Cell 语义）；Title 还单调推进 Page.updatedAt，普通 Cell 不改 Page。Property/View 更新使相应实体 +1，Select cleanup 实际修改的 Record/View 各 +1。rename 只更新 Database.name/version/updatedAt，不连带改 Page 标题、View 名称或正文。
- 所有创建工具显式使用调用方 expectedDatabaseVersion；不会读取最新版本替代陈旧意图。Replay 返回首次 DTO，不推进版本。属性/记录/Page/View 的真实归属在 replay 前复核，缺失与越权均为 NOT_FOUND。

### 单事务与持久成功回执

`DatabaseMcpMutationService` 组合现有 DatabaseService/PageService 和共用 `McpMutationService`。DatabaseService 的 session-aware 内部通道要求活动事务，既有 HTTP 未传 session 时保留原事务行为；rename 通过最小领域服务/repository CAS 入口实现，MCP adapter 不访问 repository。没有新增 HTTP/SDK、管理 UI、离线队列或同步协议。

执行顺序为：严格输入与输入大小检查 → 唯一回执索引就绪/确认 replica set 或 mongos → 一个 snapshot transaction 内重新校验写权限与 scope → 查询回执并比较 payload hash（在业务 CAS 前 replay）→ 领域校验、CAS、关联写入、版本推进 → 严格成功 DTO 投影与 UTF-8 JSON 大小检查 → 同 session 保存成功回执 → majority write concern commit → 返回。

复用 P6 的 `mcp_mutation_receipts`，只扩展 tool 枚举，保留 `(userId, tool, idempotencyKey)` 持久唯一索引和 canonical SHA-256 算法。Hash 包含完整规范化输入的 Workspace/Database scope、目标、业务参数与 CAS；同 key 同 payload 返回首次成功 DTO，不同 payload 冲突。并发重复键仅在重新校验当前权限/scope 并读到相同 hash 的已提交回执后 replay。P6 旧回执、无 TTL、只保存 committed 的行为保持；没有 P11 batch 的 pending/uncertain 身份或状态拼接。

任何业务、DTO、大小或回执保存失败均由同一 Mongo transaction 回滚，不在事务外补成功回执。已确定回滚不占用 key。真实 standalone 在业务写入前明确拒绝。无法确认 commit 结果时返回 UNAVAILABLE 并说明结果未确认，不能据此称已回滚，也不自动换 key 重发；仅用原 key/原 payload 重试或读取状态。只有“未确认”的情况使用该提示，普通事务能力不足明确要求 replica set/mongos。

输入参数与最终成功 DTO 分别按实际 JSON UTF-8 字节检查，最大均为1 MiB（1,048,576 bytes）。合法长 Text 和超过100个 Select options 不增加额外 MCP 长度/数量限制；领域限制及总字节预算仍适用。DTO 的 Schema parse 和大小检查在业务提交前执行。协议同时返回 structuredContent 和文本 JSON，完整响应包含两份 DTO 及封装开销。

所有新工具为 `readOnlyHint:false`、`idempotentHint:true`、`openWorldHint:false`；三个创建工具及 rename 为 destructiveHint:false，Cell/Property/View update 因可清除旧值或配置为 true。Annotations 不能代替权限、CAS 或幂等。业务错误沿用 INVALID_ARGUMENT、NOT_FOUND、CONFLICT、UNAVAILABLE、LIMIT_EXCEEDED、INTERNAL，响应不泄露堆栈或对象存在性。

范围仅上述七工具；没有 Database 创建/删除、Record/Property/View 删除、类型转换、正文编辑、附件、renderer 专用工具或自动依赖调度。Database 继续 online read/write，不进入 Page/Block LocalStore/oplog。

## P10.3 验收结果

**Scope PASS，完成后停止，等待 P10.4 指令。** 七个新增工具均交付，P6 六工具与 P10.2 五工具保持兼容；tools/list 在原集成、新写入集成与构建 API Client 中逐项断言完整十八名称。P10.3 没有范围内未完成项；P10 Final Acceptance 和 P11.6 的既有 HOLD 继续独立保留。

最终完整门槛为一次独立的 `r2-final`，各命令显式使用自有隔离 replica set，全部退出码0；17个源码/配置/脚本 SHA256 在运行前后相同。没有把修复前的门槛部分结果拼成终态。

| 命令 | 最终结果 |
| --- | --- |
| `pnpm typecheck` | PASS |
| `pnpm build:api` | PASS |
| `pnpm --filter @eotion/api test:domain` | 16/16 PASS |
| `pnpm --filter @eotion/api test:http` | 43/43 PASS（18 + 1 + 24） |
| `pnpm --filter @eotion/api test:mcp` | 50/50 PASS（包含新增6个写契约测试及真实写入集成） |
| `pnpm version:check` | PASS，0.0.1 / build 2 |
| `git diff --check` | PASS |

所有最终测试 fail/skip/cancel 均为0。原始命令摘要与源码冻结校验见 [Final gates summary](verification/evidence/p10-3-mcp-write-tools/final-gates-summary.json)；完整 stdout/stderr/exit 压缩日志及其原始字节 SHA 见 [Final artifacts](verification/evidence/p10-3-mcp-write-tools/final-artifacts.json)。

真实客户端使用官方 `@modelcontextprotocol/client` 的 Streamable HTTP Client，连接独立进程启动的构建产物 `apps/api/dist/main.js`；最终一次 **PASS，42条验收记录**，不是42个独立 Node test。通过现有 HTTP 仅准备账号、Workspace、宿主页与空 Database，全部新增写入验收通过真实 MCP tools/call，不直接写数据库代替验收。链路覆盖 Schema/版本 → Record/Page 创建与读回 → 普通 Cell/Title → Property 创建/更新 → Table/List/Board/Timeline 创建和 View 更新 → Database rename/读回 → 同 key replay/不同 payload 冲突/stale CAS；还创建101 options、写入20,001字符文本及合法 Date/Relation，并读取 Formula/Rollup。

该链路通过自定义 SDK fetch 在收到并读完成功 HTTP 响应后故意抛网络丢失错误，随后用原 key replay；重启真实 API 后仍得到首次 DTO且无重复 Record。自有 Mongo 先以 replica set 运行，正常 shutdown 后以同一自有 dbpath、无 replSet 参数重启；hello 确认真实 standalone。七个 Database 写工具全部 UNAVAILABLE，P6 create/update_page 保留原事务能力拒绝提示，八个业务集合的完整快照（含实体、版本、成功receipt及P11 receipt集合）保持不变。只读 Mongo 审计确认 Record 不存第二份标题、Page/Record 数量无重复。最终自有 API/Mongo 全部退出，随机 fixture 数据库删除，Token不写入日志；详见 [Client summary](verification/evidence/p10-3-mcp-write-tools/final-client-summary.json) 与 final-artifacts 中的完整 transcript。

可重复入口：`node scripts/verify-p103-mcp.mjs`（先 `pnpm build:api`；需要 mongod，可用 P103_MONGOD 指定路径；脚本自建随机端口/数据库，不连接用户原 Mongo）。完整门槛日志根为 `C:/Users/31250/AppData/Local/Temp/Eotion-P10.3-full-gate-r2-final-20261023`；最终 Client 为 `C:/Users/31250/AppData/Local/Temp/eotion-p103-client-up3AMo`。仓库压缩副本保留原始字节 SHA，临时原件不删。

独立 reviewer 发现并闭合唯一生产问题：共享 runner 将 UnknownTransactionCommitResult 转为 unconfirmed 503 后，P6 原 writeError 误报需要 replica set。现已区分“提交结果未确认，使用原 key/同 payload 重试或读取”与普通 standalone；真实 transaction/receipt 已提交后注入该标签，覆盖 P6 create/update_page 与 Database create_record。旧编译 handler 红1/0/1，修复版绿1/1/0，原 key replay 的实体/版本/持久DTO均不重复。最终独立 review 无剩余 blocker；证据见 [Review regression artifacts](verification/evidence/p10-3-mcp-write-tools/review-regression-artifacts.json)。

失败及中间结果按原样保留：

- 新写入集成 R1–R5各1项失败，分别为缺省空属性对象、SDK输入拒绝与handler错误格式、把旧Record版本构造成0、Property数量限制错误码、View数量限制错误码的测试夹具/断言问题；R6完整1/1通过，随后新增unknown回归在终态完整50项中验证。没有删除业务断言或跳过用例。
- 第一轮真实Client的date-only误带timeZone被领域正确拒绝；harness将正常shutdown的ECONNRESET误报清理失败，实际自有进程/库均已清理。修正后独立第二轮40条通过；最后增加P6 standalone兼容两项后的独立第三轮42条为本次终态，未拼接前轮。
- unknown回归首次green因夹具提前推进主Database版本失败，改为独立fixture Database后完成上述红绿；首次构建的session Promise类型错误及所有日志同样保留。旧/修复编译产物及SHA用于可审计对照，最终dist恢复修复版并在完整门槛重新正常构建。
- 首轮完整门槛在Domain16/HTTP43通过后因review修复暂停，不能归属终态；最终r2-final从typecheck重跑全部命令。早期记录入口为 [Intermediate artifacts](verification/evidence/p10-3-mcp-write-tools/intermediate-artifacts.json) 和 review-regression-artifacts。

已知边界继续遵守上述工具范围：owner-only 工作区权限，写入要求 replica set/mongos，Database online read/write，无批量/删除/类型转换/正文或附件工具，无View context自动调度承诺。未重跑完整 P11.6 或启动专项诊断，未进入 P10.4/P12/P15，未修改版本或发布。

本地代码提交：`3faadd2`（领域/session/成功receipt/rename与P6错误兼容）、`4fc4aee`（七工具、契约/回归和真实Client脚本）。文档与上述证据作为独立逻辑单元提交；最终文档SHA见Git。工作分支 `codex/p10.3-database-mcp-write-tools`，不自动push、merge、tag/Release或发布。

## P10.4 最终验收（2026-10-26，HOLD）

本轮从包含 P10.3 的 `1950ec2` 创建 `codex/p10.4-database-mcp-final-acceptance`，重新验证最终代码候选 `217f6273fae46a554f910fe2f4b4146338d9e68c`。master为`bdd6748`，有两个独立部署提交，双方未相互集成；未自动merge或修改master。候选只新增回归、真实验收harness与文档证据，产品/API/模型/协议/依赖/正式Web配置均未改变。

补齐十八工具完整Schema/annotations快照、真实旧P6 runner产生的回执重放、多字节UTF-8成功DTO失败回滚、嵌套JSON键序幂等及写后query cursor拒绝。正式本轮typecheck、API/Web构建、Domain92/Contracts29/SDK24/Storage7、API Domain16/HTTP43/MCP50/Performance1、version/diff均通过。独立构建API官方Client+Inspector74条通过，包含两协议、九写真实standalone快照不变、响应丢失/真重启重放；无route mock的构建Web/API/Mongo/MCP50条通过，覆盖标题同源、四View、Web外部写后CAS/cursor拒绝与刷新持久性。

完整Product一次原集合执行508 PASS/3 FAIL（511），独立Database252 PASS/2 FAIL（254），均exit1；后者失败为前者子集。两项Timeline Frozen用例分别为projection缺失/窗口线索和菜单locator歧义；完整Product另有P11.6 arrange reload后Fallback table而无Timeline，根因未知，独立spec通过不豁免完整门槛。Visual正式环境预检匹配、13/13通过，未修改快照/阈值/flags。

完整矩阵、每轮中间失败、原始日志SHA、真实链路范围、服务端口/PID出生身份与清理、独立review和交付状态均见 [P10.4 Final Acceptance](verification/p10-final-acceptance.md)。所有自有Mongo/API/Web已退出，测试库删除；原数据库未触碰。**P10.4 FINAL HOLD，不标P10 COMPLETE**；P11.6 HOLD不变，不恢复历史专项，不切0.0.2，不发布，交付后停止。
