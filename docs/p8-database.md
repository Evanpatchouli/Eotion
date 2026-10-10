# P8 Database

P8 在 P7 Advanced Blocks 之后引入独立的结构化数据域。P8.1 Database Domain Foundation 于 2026-10-08 验收 PASS；P8.2 Inline Database + Table View、P8.3 Properties + Record Editing 与 P8.4 Views + Filter + Sort 于 2026-10-09 验收 PASS。P8.5 Advanced Properties 于 2026-10-10 验收 PASS / current；本轮不进入 P8.6。

| 阶段 | 范围 | 状态 |
| --- | --- | --- |
| P8.1 | Database / Property / Record / View、稳定 Block 引用、权限与原子创建 | PASS |
| P8.2 | Inline Database + Table View | PASS |
| P8.3 | Properties + Record Editing | PASS |
| P8.4 | Views / Filter / Sort | PASS |
| P8.5 | Advanced Properties | PASS / current |
| P8.6 | Database Acceptance | not started |

## 核心模型

`packages/domain` 定义 Database、DatabaseProperty、DatabaseRecord、DatabaseView；`packages/contracts` 提供严格的 runtime contract。服务端在 `server-domain` 使用四个独立 Mongo 集合：`databases`、`database_properties`、`database_records`、`database_views`。稳定 ID、workspaceId、version 与 timestamps 是领域边界，不把 persistence schema 暴露给客户端。

Database Block ≠ Database 数据本体。普通 Table Block 仍是一个文档内 grid，与 Database 无关联。

Database Block 沿用既有 Block props wrapper，只保存引用：

```ts
{
  type: 'database',
  props: {
    node: {
      type: 'eotionDatabase',
      attrs: { databaseId: 'database-id', viewId: 'view-id' }
    }
  }
}
```

Block 的 ID/pageId/parentBlockId/orderKey 继续由现有模型维护。properties、records、views 不进入 `props.node`。同一 Database 可以有多个引用，每个引用选择属于该 Database 的 View。

Property 支持 title、text、number、checkbox、select、date，以及 P8.5 的 relation、rollup、formula。Property ID 是 Record properties 的键；select 值是稳定 option ID，date 是有效的 YYYY-MM-DD。每个 Database 恰好一个 title Property。P8.3 中 title 由关联 Page.title 投影，Record 持久化 properties 不再保存 title 副本；其他可写字段可以缺失，显式清空删除键。Rollup/Formula 只保存配置，读取时计算。没有 people、files 或 property 插件系统。View 只有 table；P8.4 增加独立 AND 筛选、多级排序和列配置。

## Record 与 Page

Record 的结构化值保存在 `properties`，正文保存在 `pageId` 指向的既有 Eotion Page 中。Page 必须已存在且属于同一个 Workspace，不再造正文 Block 系统。正文编辑继续使用现有 Page/Block 能力。Record 创建同时创建对应 Page，事务失败全部回滚；P8.3 新建流程先输入非空标题，再一致创建两者。有关联 Record 的 Page 禁止删除，避免产生失效正文引用；解除关联/Record 删除业务操作留到后续阶段。

## 权限、生命周期与一致性

所有业务服务使用既有 WorkspacePermissionService，继承 Workspace owner 权限。Database / Property / Record / View 的读写按 workspace 与 database 作用域查询，跨 Workspace Database/Block 引用、Record/Page 关联以及不属于 Database 的 View 均拒绝。

删除 Database Block 仅删除文档引用；删除包含引用的普通 Page 也不删除 Database、Property、Record 或 View。没有最后一个引用删除触发的清理，没有 Database 删除 UI/业务操作。

原子创建由 `DatabaseService.createInPage` 在同一个 Mongo transaction 中创建 Database、默认 title Property、默认 Table View 和 database Block。失败全部回滚；Mongo 不支持事务时显式失败，不进行不可靠写入。Database 的其他新增写入同样要求事务。

## Editor、MCP 与同步边界

P8.1 建立可保存稳定引用的节点；P8.2 在同一个 Web editor 中提供 `/database` 创建与 linked view 绑定入口，复用到 Electron / Mobile WebView。Database 数据由应用服务读取，节点仍只保存稳定引用。

既有 MCP `eotion_get_page` 只返回 database Block 的稳定 databaseId/viewId，以及现有通用 Block 字段；不返回数据库记录、editor AST 或 persistence schema。没有新增 MCP tools，database Block 不开放 MCP write。

Database 四类实体目前属于 server-domain。version 从 1 开始；P8.3 schema/cell 修改使用条件更新与事务，完整 Database Local-first 协议仍不在本轮范围。Workspace snapshot 与既有 Page/Block oplog 只携带 database Block 引用，不携带数据库数据。客户端离线可保留已有引用并编辑周边正文，不能离线创建 Database 或编辑结构化值。后续 Database sync 必须另行定义操作、版本与冲突语义。

## P8.1 验证

验证环境为隔离的本机 MongoDB 单节点副本集，测试为每轮创建并清理独立数据库；没有使用生产数据。Browser 插件未列出，产品验证使用仓库已有 Playwright。

| 验证 | 结果 |
| --- | --- |
| `pnpm --filter @eotion/domain test` | 23/23 |
| `pnpm --filter @eotion/contracts test` | 10/10 |
| Storage / SDK 源码测试 | 7/7、18/18 |
| `pnpm --filter @eotion/api test:domain` | 4/4；contracts 收紧后 Database 定向复跑 2/2 |
| `pnpm --filter @eotion/api test:http` | 26/26，含真实 sync/receipt 与 File 回归 |
| `pnpm --filter @eotion/api test:mcp` | 30/30，含真实 MCP get_page Database 引用输出 |
| Database placeholder + P7 relevant product | 49 个不同用例通过（P7+桌面 48/48，Database 桌面/移动补测 2/2） |
| 旧编辑器 / 附件 / sync 产品回归 | 最终 fixture 下完整重跑 110/110；相关产品合计 159 个不同用例通过 |
| `pnpm typecheck` | Web / Desktop / API 通过 |
| `pnpm build:web` / `pnpm build:api` | 通过；Web 条件导出修复后重新 build 通过 |
| `git diff --check` | 通过 |
| 独立 review | MCP fixture blocker 修复后最终复核无 blocker；引用/事务/Page fence/叶节点身份映射已检查 |

产品验证发现并修复了既有 BlockIdentity 对 nodeSize=1 叶节点使用 offset+1 的映射错误：其锚点会落到下一 sibling，身份修复时可能重分配原 Block ID。叶节点改用 offset 并显式采用右侧关联；非叶继续使用内部位置。Database、divider、image、file 的 ID 保真纳入产品回归。Contracts 使用 domain 的条件子路径导出，Web dev 读取 TS 源码，API CommonJS 读取 dist。

API tests 覆盖 workspace ownership、跨 workspace/missing/mismatched view 拒绝、Toggle summary 递归引用校验、Record/Page 同 workspace、关联 Page 删除防护、共享引用与最后引用移除不清理数据、创建失败回滚和无事务时 503/零写入。Domain/contracts 覆盖属性类型、title invariant、select option ID、合法日期、稳定 ID/version 与严格 shape。

P8.1 交付时仅提供应用服务与 contracts，没有 Database HTTP/SDK CRUD、Slash 创建或结构化编辑 UI。P8.2 新增的最小入口见下文。已有 Block HTTP/sync 入口仍可保存合法引用。部署需 Mongo replica set/sharded transaction 支持；初始 version 不代表已经实现实体更新或冲突协议。

附件回归首轮发现测试 fixture 与既有 P7 hardening 不一致：同 BrowserContext 的 tab 会命中合法 IndexedDB cache，而非法快照应验证首次加载；两个非法场景改为隔离 context，明确断言快照校验错误且编辑器不存在。另为首项成功图片上传/重载测试显式提供 tinyPng 响应，消除已记录的远端图片未 mock 竞态；不改变上传 URL、持久属性、重载等断言。两项定向重复 6/6 通过，独立 review 确认未削弱安全/成功路径断言。

最终执行 `pnpm --filter @eotion/web exec playwright test tests/product-editor.spec.ts tests/product-sync.spec.ts tests/product-attachments.spec.ts --workers=1`：110/110、exit 0。独立 review 最终 0 blocker；没有开始 P8.2。

## P8.2 Inline Database + Table View（交付时行为）

在页面根级的独立空行输入 `/database`，选择“创建新数据库”、输入名称并提交。服务端复用 `DatabaseService.createInPage`，同一 Mongo transaction 创建 Database、默认 Name/title Property、默认 Table View 与 database Block。已有正文不会因为命令被替换；Toggle 的真实子块也可以插入，Toggle summary、引用、列表项、表格 cell 与代码块不提供该命令。

同一入口选择“链接现有数据库”，有界列出当前 Workspace 的 Database，再选择其已有 Table View。服务端创建当前页面的新引用 Block，绑定原 databaseId/viewId；不复制 Property、Record 或 View。多个页面/Block 可以绑定相同 Database/View。删除和重排继续使用既有 Block UX；删除最后一个 Block 也不清理数据库。

Table 在正文画布内显示 Database 名称、View 名称、列标题及 Record 行，展示 title/text/number/checkbox/select/date 基础值（select 显示 option 名称）。支持空表、加载、错误、重试和“加载更多”，单次 UI 请求 25 条 Record；追加加载失败保留已有行，用同一 cursor 重试。列通过块内横向滚动保持可读，页面本身不横向溢出。点击块标题可按既有 Block 选择/删除方式操作。没有 spreadsheet 管理页、Property schema 编辑或 cell 编辑。

“+ 新建记录”仅以默认“无标题”创建 Record 与对应的普通根级 Page；二者在同一事务中提交，任何失败全部回滚。title 值仍以 title Property ID 为键，正文仍是该 Page 的原有 Block 模型；同一个 Database 的当前引用收到创建事件后重新读取记录。点击 title 打开 `pageId` 指向的普通 Page，继续使用现有正文编辑器。Page 重命名不会自动改写 Record 的 title Property；结构化标题/属性编辑留 P8.3。

### HTTP / application 边界

以下最小接口沿用 Cookie Session、SameOriginGuard 与 Workspace owner 权限；没有新增 MCP Tool：

- `GET /api/workspaces/:workspaceId/databases`：Database 列表，ID keyset cursor。
- `GET /api/workspaces/:workspaceId/databases/:databaseId/views`：已有 Table View，最多 100 个；超限明确拒绝。
- `GET /api/workspaces/:workspaceId/databases/:databaseId/views/:viewId/table`：Database/View/Property + 有界 Record window；view 必须属于该 Database/Workspace。
- `POST /api/workspaces/:workspaceId/pages/:pageId/databases`：原子创建 Inline Database。
- `POST /api/workspaces/:workspaceId/pages/:pageId/database-links`：绑定现有 Database/View 的 Block。
- `POST /api/workspaces/:workspaceId/databases/:databaseId/records`：原子创建最小 Record/Page。

列表/Record 查询默认 limit 50、最大 100，cursor 为稳定 ID；Mongo 查询本身应用 limit+1。Table Property 最多读取 101 个用于检测超限（最多允许 100 个），不无界返回 schema。API 复用领域服务/仓储与引用校验，Vue NodeView 通过 Web application service + 最小 typed SDK 读取数据，不直接访问 persistence。没有公开 Property CRUD、完整 Database SDK、filter/sort 或其他 View 类型。

### Local-first 与恢复

创建/链接需要在线：先 flush 当前正文与既有 Page/Block oplog，并确认同步完成，再请求原子服务端创建。请求期间冻结编辑和导航，避免目标位置变化。成功后使用服务端相同 Block ID、parentBlockId、orderKey 与 databaseId/viewId 插入现有编辑器并保存本地；后续普通 `block.upsert` 使用现有幂等路径。服务端已成功但本地保存失败时明确提示继续保存同一个引用，不删除已创建数据或伪造成功。

创建响应丢失时按本次固定 Block ID 查询既有 Block API，核对引用及位置后恢复同一个引用。无法确认提交结果时明确提示联网并刷新确认，暂时阻止同一页面再次创建/链接数据库；周边正文继续编辑与本地保存。Record 创建同样按本次 Page ID 核对事务结果，未知结果暂时阻止同一 Database 的所有引用再次新增。上述防重复状态仅在本次客户端会话中保存，跨应用重启的幂等恢复协议留到后续阶段。Record POST 成功后页面列表刷新失败单独提示“记录已创建”，不把刷新失败当成创建失败。

Database 数据仍只从服务端读取，不进入 LocalStore、Page snapshot、Page MCP read 或 Block props。断网后页面/稳定引用和周边正文继续既有本地保存；Table 的失败/离线状态独立展示。已经读取的表格只属于本次内存，不代表 Database 已离线同步。Mongo 不支持事务时创建明确失败；Database 的完整 offline/sync 协议没有开始。

### P8.2 验收

| 验证 | 结果 |
| --- | --- |
| Domain / Contracts / SDK | 23/23、12/12、19/19，通过 |
| API domain / HTTP / MCP | 4/4、26/26、30/30，通过；独立本机 Mongo replica set，零 skip |
| Database 产品回归 | 20/20，通过；含 slash、原子引用、linked、多引用、分页/追加失败、Record/Page、标题缓存刷新、认证切换、离线正文、reload、390px |
| 完整产品回归（含 P7） | 最终单 worker 231/231，通过，exit 0 |
| `pnpm typecheck` | Web / Desktop / API 通过 |
| `pnpm build:web` / `pnpm build:api` | 通过；Web 保留既有大 chunk 提示，不影响构建 |
| `pnpm --filter @eotion/web test:visual` | 7/7，通过；陈旧 Connectivity 单图夹具维护见 `design/visual-acceptance.md` |
| P8.2 视觉检查 | Desktop Light/Dark、空表、错误、390×844 初始及横向滚动截图已人工检查；页面无横向溢出 |
| 独立 review | 初轮的未知提交重复创建、记录成功后刷新误报已修；最终定向复核 0 blocker |
| `git diff --check` / UTF-8 无 BOM | 通过 |

自动产品测试使用 mock transport 覆盖 Web 流程；事务、分页和权限由真实 Mongo/API 集成测试验证。移动端证据为 390px Chromium 响应式验收，不代替新的原生宿主/真机验收。P8.2 交付时只提供 Table 与基础值读取，新记录默认“无标题”；当时 schema/cell 编辑尚未开始。P8.3 行为见下文，Filter/Sort、其他 View、Database MCP、完整 Database offline/sync 仍未开始。

## P8.3 Properties + Record Editing

### 属性与 typed value contract

Table 支持新增 text、number、checkbox、select、date 属性；所有属性可重命名，非 title 属性可删除。每个 Database 恰好一个 title，不能创建第二个或删除它，只允许修改显示名称。类型不可转换。列菜单显示基础类型并提供相应操作，继续使用 Quiet Studio 的正文内 Table。

| 类型 | 写入值 | 清空 |
| --- | --- | --- |
| title | trim 后非空文本，最多 200 字符 | 不允许 |
| text | string | null，删除属性键 |
| number | finite number | null，删除属性键 |
| checkbox | boolean | API 可用 null 删除键，UI 一键写 true/false |
| select | 当前 options 中的稳定 option ID | null，删除属性键 |
| date | 有效日历日期 YYYY-MM-DD | null，删除属性键 |

缺失字段代表未设置，text 的空字符串是合法文本值；UI 空输入以清空处理。数值 0 与 boolean false 是实际值。Server 根据实际 Property 校验值，拒绝未知属性、非法数字、无效日期、已删除 option 或跨 Database 的值。请求使用明确的 typed contract，不允许对象、数组或任意 JSON 作为 cell value。

Select option 使用稳定 ID 和显示名称（沿用既有 `name` 字段），支持创建、重命名、删除。重命名保留 ID；删除 option 在同一事务中清除引用该 ID 的 Record value。日期只表示日历日期，没有时间、时区、范围、提醒或循环。没有颜色扩展。

### 标题与新建记录

Page.title 是唯一持久化标题来源。Record.properties 不保存 title 副本；服务端读取 Table 时，将 Page.title 投影到 title Property ID，并返回 `pageVersion`（Page.updatedAt）。旧数据中遗留的 title key 不参与展示，后续写入清除副本。非标题值仍属于 Database Record。

Table 修改 title 通过同一 Mongo transaction 条件更新 Page 和 Record；任一步失败全部回滚。Page 编辑器沿用既有本地优先改名与同步，Table 刷新后读取已同步的 Page.title。标题单元格编辑与打开 Record Page 的入口分开。Table 标题写入前同步当前待提交 Page 操作，写入后读取服务端 snapshot 更新本地 Page 展示，不能通过 LocalStore.upsertPage 重新制造一份标题 mutation。

新建记录先输入非空标题，确认后才创建 Record + Page；空输入或取消不发送创建请求，不默认生成“无标题”。未知提交结果继续沿用 P8.2 的会话内确认与防重复机制。

### HTTP、权限与并发

新增最小 HTTP/SDK/application 入口，继续通过 HTTP → DatabaseService → domain validation → repository。Cookie Session、SameOriginGuard、Workspace owner 权限及 Workspace/Database 作用域查询保持一致。

- `POST .../databases/:databaseId/properties`：新增属性，携带 expectedDatabaseVersion。
- `PATCH .../databases/:databaseId/properties/:propertyId`：name/options 修改，携带 Database 与 Property 预期版本。
- `DELETE .../databases/:databaseId/properties/:propertyId`：删除属性并清理所有相关 Record value，携带相同版本条件。
- `PATCH .../databases/:databaseId/records/:recordId/cells/:propertyId`：修改一个 typed value，携带 Database/Record 预期版本；title 额外携带 expectedPageUpdatedAt。

所有写入要求 Mongo transaction。Database version 是 schema/cell 的共同条件更新边界，每次修改递增；已有 Property 与 Record 修改同时校验并递增自身版本。删除属性或 option 导致的值清理会递增受影响 Record 版本。事务写冲突或过期版本返回冲突反馈，客户端读取最新状态后由用户重试，不无条件覆盖旧快照。Record/Page/property 必须属于请求 Workspace/Database。

### 在线编辑与交互边界

Database schema/cell 只在线编辑，断网时明确只读，不进入 LocalStore、Page/Block oplog 或 snapshot，也不缓存未提交 mutation 冒充同步。Page/Block 继续既有 Local-first。Page 标题的多端离线同步仍继承既有 Page last-writer 语义，本轮未引入新的 Page 冲突协议或多人 CRDT；Database cell 写入使用 Page 时间戳防止旧 Table 覆盖新标题。

文本/数字编辑支持 Enter 保存、Escape 取消及 blur 保存；checkbox 一键切换，select 使用选项 popover，date 使用原生日期输入。错误在 Database 内反馈，保留草稿供重试。所有 linked 引用收到数据修改通知后重读同一份服务端数据，并保留已加载的分页深度。Mobile 复用同一 Web Table 编辑器；宽表的横向滚动仍局限在块内。

已知范围限制：只支持 Table 和六种基础类型，没有类型互转、Filter、Sort、其他 View、Relation/Rollup/Formula、Database MCP、完整 Database offline sync、导入、批量编辑或复杂 spreadsheet shortcuts。跨应用重启的未知 Record 创建幂等恢复仍是 P8.2 的后续边界。Database 使用共同 version，修改不同单元格也可能发生需要刷新重试的冲突；没有字段级合并。删除属性/option 会扫描该 Database 的现有 Record 并在事务内逐条清理受影响记录，大表成本随记录数增长；只改 option 名称且 ID 集合未减少时跳过扫描。Mobile 验收使用响应式 Chromium，原生宿主真机验收不在本轮新增范围。

### P8.3 验证

| 验证 | 结果 |
| --- | --- |
| Domain / Contracts / SDK | 23/23、12/12、19/19，通过，零 skip |
| API domain / HTTP / MCP | 4/4、27/27、30/30，通过；隔离本机 Mongo replica set，零 skip |
| Database 产品回归 | 26/26，通过；六种编辑/清空/非法值、schema/select lifecycle、标题双向读取、title-first 创建、分页、linked、reload、错误重试、offline、390px、IME |
| 完整产品回归 | 237/237，通过；Database 26 项与其余 211 项分组执行，均使用单 worker、最终源码与独立持有的 Vite 服务 |
| Storage | package 7/7，浏览器 IndexedDB / Electron SQLite / Desktop sync 11/11，通过 |
| `pnpm typecheck` / Web build | 最终源码验证通过；Web 保留既有大 chunk 提示，不影响构建 |
| API build | 通过 |
| Visual | 7/7，通过，无基线更新；P8.3 Desktop Light/Dark cell/property/select 与 390×844 编辑/popover 截图已人工检查 |
| 独立 review | 发现的问题已修复并补回归；最终定向复核 0 blocker |
| `git diff --check` / UTF-8 无 BOM | 通过 |

Web 产品回归使用 mock transport；typed validation、Workspace/Database 隔离、版本冲突、标题同步与事务回滚另由真实 HTTP/Mongo 集成测试验证。移动端证据为 Chromium 响应式编辑验收。以上为 P8.3 交付时的验收：P8.3 PASS，当时 P8.4–P8.6 not started；当前阶段见顶部状态与下文。

## P8.4 Views + Filter + Sort（PASS / current）

同一个 Database 支持多个 Table View。records / properties 共享，View 名称与 `config` 独立持久化。配置包含 AND `filters`、按优先级排列的 `sorts`、`visibleProperties` 和 `propertyOrder`。列配置为 null 时分别表示全部列、schema 顺序；显式显示列表必须包含 title，列顺序可为子集，其余列按 schema 顺序补到末尾。配置只影响展示，不修改 Property schema。旧 View 没有 config 时读取为默认配置。

### Filter operator matrix

| Property | Operators | Value |
| --- | --- | --- |
| title / text | is、is_not、contains、does_not_contain、is_empty、is_not_empty | 文本；空值 operator 无 value |
| number | eq、ne、gt、gte、lt、lte、is_empty、is_not_empty | finite number；空值 operator 无 value |
| checkbox | checked、unchecked | 无 value；分别匹配 true / false |
| select | is、is_not、is_empty、is_not_empty | 当前合法 option ID；空值 operator 无 value |
| date | is、before、after、is_empty、is_not_empty | 合法 YYYY-MM-DD；空值 operator 无 value |

最多 20 条 AND 条件，文本条件值最多 2000 字符，不支持 OR、嵌套组、相对日期或表达式。缺失、null、空字符串视为空值；0 与 false 是实际值。带值比较只匹配非空值，空值需用明确的空值条件。文本匹配区分大小写，使用二进制规则，不把用户文本当正则表达式；select 比较稳定 ID，option 改名不改变匹配。

### Sort 与有界查询

最多 10 条排序，不允许重复 Property，按用户配置顺序依次生效。title/text 与 date 按二进制字符串排序，number 按数值，checkbox 为 false < true，select 按稳定 option ID。所有方向都将空值放在末尾；最后追加 Record ID asc 作为确定性 tie-break，无配置时直接按 Record ID asc。

有 Filter/Sort 的 Table 查询从服务端持久化 View 配置生成已校验的 Mongo aggregation。按 Workspace/Database 约束记录、关联同 Workspace 的 Page 并投影权威标题，再过滤、排序和分页；不会先读一页再由前端筛选。没有 Filter/Sort 时保留既有 ID 索引分页快路径：先取最多 limit + 1 个 Record，再批量读取这些 Page，列配置不触发全库 join。默认路径发现窗口内缺失关联 Page 时明确拒绝查询，避免静默缩短窗口或漏掉下一页。

每次默认 50、最大 100，UI 每次 25，仓储只返回 limit + 1。有限长度游标绑定 Workspace/Database/View、Database/View 版本、配置 hash、最后 Record ID 和该 Record 的 Page version，服务端读取锚点排序元组后执行 keyset 查询；不在游标中保存任意长度的文本值，也不允许任意 Mongo expression。配置、Database 数据或锚点 Page 变化后需从首窗重新加载。排序确定性保证数据不变时跨页无重复/遗漏，不代表并发 Page 改名时的跨请求快照隔离。

### View 生命周期、linked view 与并发

View 可以创建、重命名、切换和删除；每个 Database 至少保留一个 View。删除采用 fail-closed：仍被任意持久化 Block（含递归 node content）引用的 View 返回冲突，用户先切换或移除引用并完成同步，再删除。不会自动改写其它 Page/Block。引用写入与 View 删除在事务内竞争同一个内部引用 fence，防止检查之后插入新引用。离线旧引用恢复仍须通过服务端引用校验。

删除当前 View 前，UI 先选择另一个 View 并等待当前引用同步完成；其它 Block 仍有引用时保留 View，显示解除引用后重试的提示。删除过程中及失败提示以用户、Workspace、Database 和 Block 限定的会话内状态跨编辑器重建保留，重载不持久化该状态。创建响应不确定时按固定 View ID 重读列表核对；删除响应不确定时重读列表确认，不乐观移除 View。

Block 只保存 databaseId/viewId。切换 View 改变当前 Block 的引用，沿用 Page/Block 保存与同步；View 配置修改是在线 typed API。相同 viewId 的引用共享配置，不同 viewId 的引用独立配置。Record 或 schema 修改后，当前已加载的同 Database 引用按各自配置重新查询，并保留已加载分页深度；结果变少时自然缩短。配置重载后保留。

View create/update/delete 沿用 Cookie Session、SameOriginGuard、Workspace owner 权限与 Database 作用域，写入要求 Mongo transaction。更新/删除携带 expectedDatabaseVersion 与 expectedViewVersion；过期版本返回 409，不无条件覆盖草稿。服务端按当前 schema 校验 Property ID、operator/type、value、option ID、列集合与 title invariant，拒绝跨 Database/Workspace 注入。

### Property 变化与同步边界

删除 Property 在同一事务中清理所有 View 的相关 Filter、Sort、显示列和列顺序，并递增受影响 View version。删除 select option 同事务移除带有已删除 option ID 的 Filter，保留无 value 的空值条件，并继续清理 Record value；Property/option rename 保留稳定 ID，不改变引用。

Page/Block 继续 Local-first；Database/View/Filter/Sort online-only，离线 Table 只读、不可配置。没有 Database oplog 或完整 offline sync。MCP get_page 仍只返回稳定 databaseId/viewId，不自动暴露配置或 records，也没有新增 Database MCP tools。本轮仅 table 与六种基础 Property，不包含 Board/Calendar/List、Relation/Rollup/Formula、分组/聚合、导入或 P8.5。

已知规模边界：最多 100 个 Property / View；动态 Filter/Sort 使用聚合，不承诺任意规模的索引覆盖查询。安全删除 View 的递归引用检查扫描当前 Workspace 的 Block；Property/option 清理继续扫描该 Database 的 Record。没有持久化列宽或跨客户端实时 Database 推送。移动端复用 Web UI，390px Chromium 验收不代替原生宿主真机测试。

### P8.4 验证

| 验证 | 结果 |
| --- | --- |
| Domain / Contracts / SDK | 24/24、12/12、20/20，通过，零 skip；SDK typecheck 与缺少创建版本号的负向编译检查通过 |
| API domain / HTTP / MCP | 5/5、27/27、30/30，通过，零 skip；隔离本机 Mongo replica set |
| 默认查询成本 | 500 条 Record 的真实 Mongo profiler 回归通过；首、次页的 Record / Page 读取均受 limit + 1 约束，默认窗口孤儿 Page 返回冲突 |
| 完整产品回归 | 239/239，通过，零 skip；Database 28 项与其余 211 项，最终源码与 fresh Vite、单 worker 完整执行 |
| Storage | package 7/7、完整 IndexedDB / Electron SQLite / Desktop sync 11/11，通过，零 skip |
| `pnpm typecheck` / Web / API build | 最终源码通过；Web 保留既有大 chunk 提示 |
| Visual | 7/7，通过，无基线更新；Desktop Light/Dark 与 390×844 View / Filter / Sort / 列设置截图已人工检查 |
| 独立 review | 默认查询成本、SDK 入参类型与特殊 option ID 清理问题已修复；最终定向复核 0 blocker |
| `git diff --check` / UTF-8 无 BOM | 通过 |

Web 产品测试使用 mock transport，真实 operator、权限、版本、游标、引用竞争与事务清理由 HTTP/Mongo 集成测试覆盖。Database 离线测试维护为断网前加载真实 IndexedDB 读取 helper，避免断网后动态加载开发模块；仍验证本地引用、正文和 oplog，不模拟离线写入成功。首轮旧编辑器 retry / Electron restart 用例各出现一次超时，两类定向重复各 6/6 通过；没有修改对应产品代码或削弱断言。完整 Storage 复跑 11/11、产品最终完整复跑 239/239 通过。日志与人工视觉截图保留在 ignored `test-results/p84-validation/`、`test-results/p84-visual/`。

P8.1–P8.4 PASS，P8.4 为 current；P8.5–P8.6 not started。本轮到此停止。

## P8.5 Advanced Properties

P8.5 在相同 Database Domain 上增加单向 Relation、Rollup 与 Formula；沿用唯一 Web UI、Workspace 权限、typed HTTP/SDK 和 Mongo transaction。没有新增 People/Files、双向或自动 reciprocal Property、其它 View、分组、aggregation footer、Database MCP、导入或 Database offline sync。P8.6 不开始。

### Relation schema、identity 与删除

```ts
{ type: 'relation', config: { targetDatabaseId: 'database-id' } }
// Record.properties[propertyId]
['target-record-id-1', 'target-record-id-2']
```

所有 Relation 统一为 multi relation，持久化值只有 Record ID 数组；不保存标题、label、Page 内容或 Record snapshot。最多 50 个稳定 ID，重复拒绝，保留输入顺序；空关系为缺失值或 `[]`。每个 target Record 必须真实存在、属于指定目标 Database 和当前 Workspace。允许自数据库关联、Record 指向自身以及纯 Relation 图环；关系图本身不参与计算环限制。

删除 Record 的 domain 操作携带 Database/Record 预期版本，在同一 Mongo transaction 删除该 Record 并清理当前 Workspace 所有 incoming Relation 中的对应 ID，递增受影响 Record 版本。不会删除 Record 对应的 Page、其它 Record 或 target Database。清理无法在成本上限内安全完成时整体失败，不留永久 dangling relation；本阶段不新增 Record 删除产品入口。

删除 Relation Property 只删除配置及 source Records 中该属性的值，不删除目标数据。若被 Rollup/Formula 引用则拒绝，先修改依赖。修改目标 Database 前必须清空已有关系，不能偷偷删除关系值。Database 删除仍无产品/业务入口；未来必须先解除所有 Relation Property 引用，禁止隐式 cascade 整个关联数据库。

Relation picker 通过有界 `record-options` 查询搜索、分页选择目标 Records；`record-options/resolve` 有界批量解析已选标题。展示动态读取的 `Page.title`，写入仍只提交 Record ID；不会引入标题双写。

### Rollup aggregation matrix

```ts
{
  type: 'rollup',
  config: { relationPropertyId: 'relation-id', targetPropertyId: 'target-property-id', aggregation: 'sum' }
}
```

| 目标类型 | aggregation |
| --- | --- |
| title/text/number/checkbox/select/date | count、count_values |
| number | sum、avg、min、max |
| relation/rollup/formula | 全部拒绝 |

`count` 是关联 Record 数；`count_values` 统计非空目标值（null/缺失/空字符串不计，0/false 计入）。数值聚合忽略空目标值，全空/空关系返回 null；count/count_values 返回 0。除法溢出、非有限数值不生成 Infinity/NaN。date 的 min/max 本阶段延期；不提供 show_original/show_unique/percent_checked/median/range。

Rollup 必须依赖本数据库的 Relation Property，target Property 必须属于 Relation 声明的同 Workspace 目标 Database。只允许基础目标属性，不能继续跨数据库派生链，采用 fail-closed 保证无计算环。只持久化 config，读取时计算，不向 Record.properties 回写结果。

### Formula AST 与类型

Formula config 为 `{ expression, resultType }`，resultType 为 string/number/boolean/date/null。表达式是严格 shape 的小型 AST，未知字段、未知操作或任意代码均拒绝：

| kind | 字段/语义 |
| --- | --- |
| literal | value；date literal 额外 `valueType: 'date'`，日期必须 YYYY-MM-DD |
| property | propertyId，本数据库稳定 ID |
| binary | operator、left、right；+ - * / == != > >= < <= and or |
| unary | operator: not、operand |
| if | condition、then、else |
| call | name: empty/concat、args |

算术只接受 number；and/or/not 与 if condition 只接受 boolean；比较支持同类型 number/string/date，==/!= 允许与 null 比较。if 分支必须同类型或一个为 null。text/title/select reference 为 string，date 为 date，checkbox 为 boolean，number/rollup 为 number；其它 Formula 引用其声明且验证过的 resultType。Relation 仅允许用于 empty，不可作算术/比较值或直接 Formula 结果。concat 只接受 string/null，null 视为空字符串；不做隐式数字、布尔或日期转换。

空 property 值传播为 null；算术/顺序比较遇 null 返回 null；==/!= 对 null 使用显式相等语义。boolean and/or 遵守确定性短路；if condition 为 null 时结果为 null。empty 判断 null/空字符串/空 Relation 数组，0/false 不为空。除零、非有限计算和超限输出返回 null。Formula 无时钟、随机、网络、JS eval、Function、vm 或 Mongo $where。

### Dependency graph 与只读

Schema 创建/修改时验证整个本数据库 Property dependency graph 与 Formula 结果类型：Formula 边来自全部 property references，Rollup 边指向 Relation。完整拒绝自引用、多属性环及超过依赖深度的 DAG，不因属性列表顺序改变结果。Rollup 的跨库目标限定基础属性，无法安全证明的派生链直接拒绝。删除被 Formula/Rollup 使用的 Property 返回依赖错误，不重写 AST；schema/option/config 变更也不能破坏已有 graph。

Rollup/Formula 的 Record cells 只读：UI 展示计算结果，HTTP/domain 拒绝 PATCH 派生值；创建 Record 也不允许提交派生结果，stored-value validator 拒绝任何派生键。编辑入口只修改 schema/config。Page.title 继续为唯一标题持久化来源，Formula/Rollup 的 title 输入从 Page 投影读取。

### Filter/Sort、权限与一致性

Relation 支持 is_empty/is_not_empty，依据 ID 数组为空与否；不按 title 筛选，不支持 contains/does_not_contain。Relation 不支持 Sort。Rollup/Formula 本阶段只展示结果，不支持 Filter/Sort；非法 View config 明确拒绝，不 silently ignore，也不先分页后进行派生筛选。六种基础属性保持 P8.4 的服务端 filter → sort → paginate、empty 与 Record ID tie-break 契约。

所有跨库目标按当前 Workspace 查询，复用现有 WorkspacePermissionService；无法借 targetDatabaseId/targetRecordId/targetPropertyId 读取外部 Workspace。Schema/cell 保持 Database/Property/Record version CAS，写入仍要求 Mongo transaction。内部 Advanced Reference fence 让 source/target schema 变化、Relation 编辑与 target 删除竞争同一目标 Database 文档，防止检查后新建引用或删除目标的竞态。计算读取使用一致的事务快照；结果不 materialize，也无需缓存 invalidation。

### Query bounds、产品与边界

Domain 常量约束 Relation 最多 50、AST 最多 128 节点/16 深度、Property 依赖最多 16 深度、Formula 字符串最多 20000 字符。递归 evaluator 有 guard，concat 在分配结果前检查长度；不会允许受控 AST 的组合仍造成无限输出增长。候选和标题解析每次最多 50，候选 search 最多 200 字符，Table window 沿用最多 100。派生读取最多 100 个 source Records、所有 Rollup 合计最多 5000 个 distinct target Database/Record 对；legacy listRecords 读取派生值超出 100 行时明确拒绝，使用 Table 分页入口。

Workspace 的 relation/rollup 依赖扫描最多 1000 个 Property（查询 limit+1 检测超限）；Record 删除按来源 Database 分组读取，总共最多扫描 10000 个 source Records，逐行合并所有 incoming Relation 清理并只更新一次。Property/option 删除、Relation retarget 和 legacy listRecords 的 Record 扫描最多 10000。查询在 Mongo 层限制返回数量，超限整体 fail-closed，不截断清理结果后继续删除；没有无限量无命中反向关系扫描。所有上限由 domain 共享常量定义，contracts/server 使用相同 Relation 上限。

Relation 候选无 search 时先做 ID 索引 limit+1，再关联 Page；search 时只在游标后的最多 5000 个候选 Record 内执行 title 查询，候选超限明确拒绝，不能只查一个不完整子集假装搜索全库。候选 search 为转义的字面文本，不执行用户正则。

Table 保留 Quiet Studio 视觉，新增 Relation 目标配置、Rollup 顺序配置（Relation → target → aggregation）与轻量 Formula 编辑、属性插入、类型/错误反馈。已选 Relation 可添加/移除、搜索、加载更多及错误重试；Table cell 预览前三个标题和 +N，picker 有界展示全部已关联 Records。每次表格标题解析只处理可见列，最多 500 个 ID / 10 个请求、并发 3，剩余关联通过 picker 查看，不显示永久 loading。刷新重读标题；当前客户端的目标 Database mutation 同时刷新依赖它的 Table 派生值。派生 cells 只读，相同数据库的 linked Views 继续共享服务端数据。

Page/Block 继续 Local-first；Database 及高级属性仍 online-only，离线只读，无 Relation offline queue、Database oplog 或 Formula replication。现有 Page MCP 仍只携带 databaseId/viewId；没有新增 Database MCP Tool，也不向 eotion_get_page 自动加入 schema、records、relations 或派生结果。

已知性能边界：读取时计算优先 correctness，尚无 materialized cache、target 索引规划或跨客户端实时 Database 推送；跨库写入可能因共享 fence 冲突并需要重读/重试。390px Web 响应式验收不代替原生宿主真机测试。

### P8.5 验证

测试使用隔离本机 MongoDB 8.0.32 单节点 replica set，不使用生产数据；真实权限、CAS、scope、引用竞争、清理与读取投影由 Mongo/API 集成测试验证。Web 产品测试使用 mock transport；Browser 插件未提供，沿用仓库 Playwright。

| 验证 | 结果 |
| --- | --- |
| Domain / Contracts / SDK | 30/30、15/15、21/21，通过，零 skip；含 enum 数组/对象拒绝与禁止转换 hook 执行 |
| API domain | 9/9，通过，零 skip；含跨 Workspace、Relation 生命周期、自关联/特殊 ID、5001 目标预算与两组引用删除竞争 |
| HTTP / MCP | 27/27、30/30，通过，零 skip；HTTP 含真实 sync SQLite transport 与 File lifecycle |
| Database 产品定向 | 32/32，通过；含 relation picker、跨库组合、linked 派生刷新、Page.title 改名、reload、390px、offline、error/retry |
| 完整产品回归 | 全新 Vite 243/243，通过，零 skip；严格 enum 最后修复后 Database 32/32 再次通过 |
| Storage | package 7/7、IndexedDB / Electron SQLite / Desktop sync 11/11，通过 |
| Desktop 相关 UI | Browser / Electron titlebar 2/2，通过 |
| typecheck / Web / API / Desktop build | 最终源码通过；Web 保留既有大 chunk 提示 |
| Visual | 7/7，通过，没有更新 baseline；Desktop 高级列/linked 计算数据、390px picker 与 Formula 配置/保存截图已人工检查 |
| 独立 review | 0 merge blocker；最后常量/严格 enum 校验与测试增量再次复核通过 |
| diff / 编码 | git diff --check 通过，UTF-8 无 BOM |

Desktop node 单测 12/17：4 项既有 SQLite legacy block props fixture 不符合当前 validator，1 项 Windows 临时目录清理 EPERM；相关实现、测试、Block validator 与本轮基线 HEAD 的文件 hash 一致，EPERM 单项隔离仍复现，没有修无关基线。产品早期两项附件夹具各一次超时，均隔离 3/3 通过，相关附件源码/测试与 HEAD 一致，未修改断言；一次源码热更新期间的整轮回归出现服务模块状态分离，4 项既有创建防重复测试失败，采用无源码变化的全新 Vite 完整复跑确认，不将它们当作基线忽略。

P8.1–P8.5 PASS，P8.5 为 current；P8.6 not started。日志保存系统 Temp 的 p85-validation，人工截图保存本任务仓库外的 p85-ui 目录。本轮到此停止。
