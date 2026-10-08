# P8 Database

P8 在 P7 Advanced Blocks 之后引入独立的结构化数据域。P8.1 Database Domain Foundation 于 2026-10-08 验收 PASS；P8.2 Inline Database + Table View 于 2026-10-09 验收 PASS，是当前已交付阶段。本轮只到 P8.2，不进入 P8.3。

| 阶段 | 范围 | 状态 |
| --- | --- | --- |
| P8.1 | Database / Property / Record / View、稳定 Block 引用、权限与原子创建 | PASS |
| P8.2 | Inline Database + Table View | PASS / current |
| P8.3 | Properties + Record Editing | not started |
| P8.4 | Views / Filter / Sort | not started |
| P8.5 | Advanced Properties | not started |
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

Property 第一版支持 title、text、number、checkbox、select、date。Property ID 是 Record properties 的键；select 值是稳定 option ID，date 是有效的 YYYY-MM-DD。每个 Database 恰好一个 title Property，Record 必须包含非空 title 值；其他字段可以缺失或为 null。没有 relation、rollup、formula、people、files 或 property 插件系统。View 第一版只有 table，没有 filter/sort 表达式。

## Record 与 Page

Record 的结构化值保存在 `properties`，正文保存在 `pageId` 指向的既有 Eotion Page 中。Page 必须已存在且属于同一个 Workspace，不再造正文 Block 系统。正文编辑继续使用现有 Page/Block 能力。P8.2 的最小 Record 创建同时创建对应 Page，事务失败全部回滚；不实现完整属性编辑。有关联 Record 的 Page 禁止删除，避免产生失效正文引用；解除关联/Record 删除业务操作留到后续阶段。

## 权限、生命周期与一致性

所有业务服务使用既有 WorkspacePermissionService，继承 Workspace owner 权限。Database / Property / Record / View 的读写按 workspace 与 database 作用域查询，跨 Workspace Database/Block 引用、Record/Page 关联以及不属于 Database 的 View 均拒绝。

删除 Database Block 仅删除文档引用；删除包含引用的普通 Page 也不删除 Database、Property、Record 或 View。没有最后一个引用删除触发的清理，没有 Database 删除 UI/业务操作。

原子创建由 `DatabaseService.createInPage` 在同一个 Mongo transaction 中创建 Database、默认 title Property、默认 Table View 和 database Block。失败全部回滚；Mongo 不支持事务时显式失败，不进行不可靠写入。Database 的其他新增写入同样要求事务。

## Editor、MCP 与同步边界

P8.1 建立可保存稳定引用的节点；P8.2 在同一个 Web editor 中提供 `/database` 创建与 linked view 绑定入口，复用到 Electron / Mobile WebView。Database 数据由应用服务读取，节点仍只保存稳定引用。

既有 MCP `eotion_get_page` 只返回 database Block 的稳定 databaseId/viewId，以及现有通用 Block 字段；不返回数据库记录、editor AST 或 persistence schema。没有新增 MCP tools，database Block 不开放 MCP write。

Database 四类实体目前属于 server-domain。version 从 1 开始，为未来冲突检测留下明确实体版本边界；本轮不提供实体更新/CAS 或完整 Database Local-first 协议。Workspace snapshot 与既有 Page/Block oplog 只携带 database Block 引用，不携带数据库数据。客户端离线可保留已有引用并编辑周边正文，不能离线创建 Database 或编辑结构化值。后续 Database sync 必须另行定义操作、版本与冲突语义。

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

## P8.2 Inline Database + Table View（current）

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

自动产品测试使用 mock transport 覆盖 Web 流程；事务、分页和权限由真实 Mongo/API 集成测试验证。移动端证据为 390px Chromium 响应式验收，不代替新的原生宿主/真机验收。Database 当前只提供 Table 与基础值读取，新记录默认“无标题”；schema/cell 编辑、Filter/Sort、其他 View、Database MCP、完整 Database offline/sync 均未开始。
