# 当前任务：P10.4 Database MCP Final Acceptance（已收口 / FINAL HOLD，2026-10-29）

起始工作树干净，HEAD `1950ec233bb9563395d4cbbe81fdf9538d9c7acf`（含 P10.3 三提交），从此创建 `codex/p10.4-database-mcp-final-acceptance`。本地 master/origin/master 为 `bdd6748ace0bb6880981257b9b64bcbdb16c517c`，共同祖先 `2aad764`；候选领先三个 P10.3 提交，master 另有两个部署提交，互不包含，不自动合并。版本固定 0.0.1 / build 2，P11.6 HOLD 不变，不恢复启动专项，不进入 P12/P15，不 push/merge/tag/Release/发布。

| 单元 | 模式 / 评级 / 执行者 | 验收 |
| --- | --- | --- |
| A1 | investigate / S0 scout | 复用 P10.3 Evidence Pack，映射 A–E 到实际测试/Client/Product，列出最少缺口 |
| A2 | decide / S2 主 Agent（只在必要时） | 未定契约或真实失败根因，形成紧凑 Brief 后降级 |
| A3 | execute / S1 fast_worker | 按 Brief 补必要回归、验收 harness、范围内最小修复；不新增产品/API/模型 |
| A4 | verify / S0 scout | 同一冻结源码的全部强制命令、真实隔离 Mongo / Client / Web 组合链路、环境预检和清理 |
| A5 | review / 独立 reviewer | 唯一一次最终独立 review：权限/CAS/session/旧 receipt/replay/unknown/P6/P10.2/证据 |
| A6 | execute / 主 Agent | 正式报告、文档/任务/交接同步、证据 SHA、最终 diff 和本地逻辑单元提交 |

所有数据库验证显式使用本轮自有隔离 Mongo；记录端口、PID+出生身份、数据库名和清理，不连接用户原数据库。Token 不写仓库或原始日志。完整 Product 保持原集合/正式配置，一次命令；Visual 先正式环境预检，环境不符记录阻断，不修改黄金环境/flags/阈值/快照。历史/中间失败独立保留，不拼接不同源码状态。只有全部强制门槛通过且无 blocker 才标 FINAL PASS，否则 HOLD。

当前：A1–A6已完成，唯一最终独立review未发现新的P10范围产品缺陷或证据阻断，支持FINAL HOLD。候选代码`217f6273fae46a554f910fe2f4b4146338d9e68c`，生产/正式配置相对1950ec2无改动；本地测试提交`d42b122`、真实验收harness提交`217f627`。正式报告 `docs/verification/p10-final-acceptance.md`。10月29日恢复仅完成原始证据换行/长路径无损打包、478文件冻结校验与Git收口，没有重跑测试或恢复P11.6专项。

- 全部强制命令已真实执行：typecheck/API-Web build、Domain92/Contracts29/SDK24/Storage7、API Domain16/HTTP43/MCP50/Performance1、version/diff通过；API final-r2同一hash、Web215原文件前后不变。
- 真实构建API Client+Inspector最终74条PASS（5轮中4轮harness失败均保留），真实无mock Web/API/Mongo/MCP最终50条PASS（2轮harness失败/1轮中间PASS/1轮最终PASS），九写真实standalone拒绝且八集合快照不变；旧P6 runner真实产生的receipt fixture已重放验证。
- 完整Product一次原14集合508PASS/3FAIL，独立Database252PASS/2FAIL，均exit1；后两项是前者子集。Visual正式环境匹配13/13，未改快照/阈值/flags。P10.4 FINAL HOLD、P10未COMPLETE；不为取得通过修改Timeline或恢复启动专项。
- 自有后端Mongo63687、Client52092、Web56863及API/Web进程均退出，随机库删除；10月29日自有端口仍无监听。验收时已有27017/PID4796早于本轮，未连接/修改/停止。314个原件映射、Git归档blob与解压SHA一致；中间打包失败、历史测试失败和原TEMP证据均保留。
- 当前 master仍bdd6748，与候选分叉，未merge/push/发布；0.0.1/build2、P11.6 HOLD不变。最终文档证据提交SHA以Git交付为准，完成后停止，不自动接续修复或下一Phase。

---

# 历史任务：P10.3 Database MCP Write Tools（Scope PASS，2026-10-23）

起始 `master/2aad764`，工作树干净；在 `codex/p10.3-database-mcp-write-tools` 实施。P10.2 已随 2aad764 合入，以下旧“未合并/实施中”记录仅为历史。版本固定 0.0.1 / build 2；P11.6 HOLD，不重启启动诊断；不进入 P10.4 / P12 / P15，不 push/merge/发布。

| 单元 | 模式 / 评级 / 执行者 | 产出 / 验收 |
| --- | --- | --- |
| W1 | investigate / S0 scout（两个独立边界） | Database 领域写入与 CAS/session 证据；MCP receipt/transport/测试环境证据 |
| W2 | decide / S2 主 Agent | 七工具严格 Schema、空值、CAS、事务/幂等及版本推进 Implementation Brief |
| W3 | execute / S1 fast_worker | session-aware 领域 seam、最小 rename、成功回执及 MCP adapter/契约测试，按写入范围串行 |
| W4 | execute / S1 fast_worker | 真实 Mongo/MCP 回归、失败注入与真实客户端验收 harness |
| W5 | verify / S0 scout | 定向回归、完整最小门槛、隔离 replset/standalone 与构建 API 的真实 Client 链路 |
| W6 | review / 独立 reviewer | 一次最终独立复核，修复 blocker，正式文档/交接与最终 diff、按逻辑单元提交 |

所有测试仅用自有隔离 Mongo，绝不连接用户原数据库。

## 当前进度

- W1–W6实施、验证与唯一一次独立review均完成；七工具按下方Brief交付，未增加HTTP/SDK/模型/同步协议，原P6/P10.2兼容。正式结果与范围见 `docs/p10-database-mcp.md`；本地领域提交 `3faadd2`、MCP/回归提交 `4fc4aee`，本文档/证据独立提交SHA及最终工作树见Git/交付消息。不push/merge/发布。
- 最终独立完整门槛 `Eotion-P10.3-full-gate-r2-final-20261023`：pnpm typecheck/build:api exit0、Domain16/16、HTTP43/43、MCP50/50、version:check/diff --check exit0；所有测试fail/skip/cancel0，17个代码/配置/脚本SHA256前后一致。不拼接首轮通过结果。
- 构建API+官方SDK Client最终第三轮独立PASS，42条验收记录（含七DB和两P6写工具真实standalone拒绝、全业务快照不变、网络响应丢失和真实API重启后原keyreplay）。证据 `C:/Users/31250/AppData/Local/Temp/eotion-p103-client-up3AMo`；自有API/Mongo全部退出，随机库已删除，无明文Token日志。
- 独立review唯一生产finding（P6 unknown commit误报事务能力不足）已修复，并以真实transaction提交后模拟ACK丢失覆盖create/update_page与create_record：旧编译handler红1/0/1、修复绿1/1/0，首次green夹具版本错误单独留档，最终用独立Database。reviewer已核对最终7门槛与Client，确认无剩余blocker，支持Scope PASS。
- 失败/中间记录均保留：新增集成R1–R5测试夹具/错误码断言问题，R6完整1/1；Client首轮date-only/timezone夹具与shutdown ECONNRESET误判，第二轮40条通过；首轮完整门槛在review修复前到Domain/HTTP通过后暂停。日志/原字节SHA压缩归档在 `docs/verification/evidence/p10-3-mcp-write-tools/`，不将中间结果冒充终态。
- 隔离门槛Mongo51059/PID49968已按instance.json核出生身份后admin shutdown，进程与监听退出；清理前发现并只删除自建探针库（最初dropDatabase参数误用导致未删除），之后仅admin/config/local，证据final-gate-cleanup.json。原27017从未连接/操作。
- **P10.3 Scope PASS，无范围内未完成项。** 完成本地提交后停止，等待P10.4指令；P10未COMPLETE，P11.6 HOLD、0.0.1/build2保持，不进入P12/P15。

## Implementation Brief（W1 完成，W2 冻结）

没有发现与本轮七工具范围冲突的更早正式写入契约；P10.1/P10.2 仅预留写入。以下为新增 MCP 契约，不新增 HTTP/SDK、持久字段或同步协议。

### 严格输入/输出

共用字段 S = `workspaceId,databaseId,expectedDatabaseVersion,idempotencyKey`。ID 为非空、首尾无空白、最长256字符的稳定字符串；version 为正 safe integer；key trim 后1–128字符。name/title trim 后1–200字符。所有对象顶层 strict；Property config / Formula AST / Date / Filter / Sort 的未知字段继续由现有 domain validator 严格拒绝，只有 View.options 按既有契约开放未知扩展 JSON。

| 工具 | 输入（除S外；?表示可省略，禁止未列字段） | 严格成功DTO |
| --- | --- | --- |
| eotion_create_record | title, properties?: Record<PropertyId,Value> | {database,record} |
| eotion_update_record_cell | recordId, propertyId, value, expectedRecordVersion, expectedPageUpdatedAt?: ISO datetime | {database,record} |
| eotion_create_property | name, type: title/text/number/checkbox/select/date/relation/rollup/formula, options?: [{id,name}], config?: 既有PropertyConfig | {database,property} |
| eotion_update_property | propertyId, expectedPropertyVersion, name?, options?, config?；至少一个patch字段 | {database,property} |
| eotion_create_view | name, type: table/list/board/timeline, config?: 完整ViewConfig | {database,view} |
| eotion_update_view | viewId, expectedViewVersion, name?, config?；至少一个patch字段 | {database,view} |
| eotion_rename_database | name | {database} |

DTO 的 database/property/view/record 复用 P10.2 严格业务投影（不含 persistence/fence 字段）；record 包含 properties（Page.title 的 Title投影及现有派生投影）、pageId/pageVersion/Record version，不新增第二份持久标题。新Record/Page/Property/View ID由应用服务生成UUID；Record Page orderKey用既有nextOrderKey规则；Select option ID保留既有业务定义输入，更新完整options按ID保留/清理引用。调用方不能指定新实体ID、orderKey、userId、时间或内部字段。

Value = string（无额外长度限制）| finite number | boolean | null | 最多50个唯一稳定Record ID | {start,end?,timeZone?}；合法性由现有Property/Date/Relation validator决定，不复制日期模型。Formula/Rollup不可写，Title初始值只使用title字段；初始properties中的Title和派生值拒绝。options无额外100项限制；输入与最终成功DTO各自按JSON UTF-8字节最多1MiB。

### 省略、null、空集合与版本

- create_record省略properties等于空初始值；null清除可空非Relation值，Relation清空用[]；Title拒绝null/空白。单Cell不支持省略value；更新Title必须Page CAS，普通Cell传Page版本不参与校验，沿用领域语义。
- Property的name/options/config省略保留；options提供时完整替换（[]清空Select并触发既有cleanup）；config提供时完整替换，null拒绝，不支持类型转换；无config类型不能添加config。重复Title、类型/config/引用/依赖/数量限制全部复用现有领域检查。
- View省略config保留（create使用既有默认）；提供config为完整替换，必填filters/sorts/visibleProperties/propertyOrder；[]明确清空对应列表，visibleProperties/propertyOrder的null沿用默认投影语义；config:null/options:null拒绝。options中的未知扩展原样存取；完整替换时调用方应带回需要保留的options；仅改名绝不覆盖现有config。type在update输入中拒绝，不做View类型转换。
- 每次新成功写入Database version+1；新Record/Property/View version=1。单Cell使Record+1，即使值相同也沿用既有单Cell语义；Title额外推进Page.updatedAt，普通Cell不改变Page。updateProperty/View各自实体+1；Select cleanup中实际受影响的Record/View各+1。rename只推进Database version/updatedAt；不改Page/View/正文。Replay返回首次DTO且不推进任何版本。

### 应用/事务/回执边界

- 将P6的canonical hash、事务/replay/duplicate处理提取为共用McpMutationService，仍写原mcp_mutation_receipts，只扩展tool枚举，不改唯一键/旧hash算法/无TTL/committed-only语义；DocumentMutationService内部复用且保持P6工具契约。
- DatabaseService六写方法增加session-aware内部调用通道，provided session必须处于事务；HTTP不传session仍走原transact。createRecordPage额外内部CAS参数只给MCP，不改HTTP输入/返回。补最小renameDatabase领域入口与repository CAS名称更新；adapter不访问repository。
- 新DatabaseMcpMutationService组合共用runner与DatabaseService/PageService，生成ID/orderKey、转交全部领域检查。数据库写权限/真实Database及目标Property/View/Record/Page归属由DatabaseService.assertWriteScope在replay前校验；不先验证CAS。create_record与create_view显式传客户端Database版本，绝不读最新版本替代。
- 顺序：strict输入及1MiB输入检查 → receipt唯一索引ready、replica set/mongos能力确认（standalone任何业务写前拒绝）→ 一个snapshot transaction中复核当前权限/scope → 持久receipt查询/hash比较/replay → 领域CAS/校验/所有关联写入和版本推进 → DTO严格parse与实际JSON大小检查 → 同session保存成功receipt → commit → 返回DTO。
- (userId,tool,key)全局持久唯一；canonical hash包含tool及完整规范化输入（scope、目标、业务参数、CAS）。同key不同payload冲突，同payload在CAS前replay；并发duplicate仅在重查当前权限/scope后返回已提交相同hash回执。失败已回滚无成功receipt/key占用。未知commit不写失败/pending、不声称回滚；客户端只可用原key/原payload重试或读取状态，绝不自动换key。
- View/property生命周期、Relation advanced fence、Formula/Rollup读取投影均保留原领域实现；无View context调度承诺。P11 batch pending/uncertain identity与MCP成功receipt严格分开。

### 文件/验收

生产：server-domain/services/{database,document-mutation,mcp-mutation,database-mcp-mutation}.service.ts、database/mcp receipt repository与schema、server-domain.module.ts；MCP新增write contract并注册七工具（旧十一工具不变），read contract仅导出可复用DTO schema。测试：新增契约/真实MCP集成、完整18工具清单、真实standalone与构建API Client harness；不写新HTTP/SDK/UI。

最小门槛：先定向MCP contracts/写入及原P6回归；随后pnpm typecheck/build:api、API test:domain/test:http/test:mcp、version:check、diff --check。隔离Mongo replica set+构建API+官方真实SDK Client完成Schema→Record→Cell/Title→Property/View→rename→读回→replay/stale CAS；真实standalone无业务写。覆盖七工具成功/输入/不存在/跨scope/越权、全工具replay/hash冲突、并发/重启/响应丢失、receipt与DTO失败回滚、Select cleanup/Relation/Date/派生拒绝、P6/P10.2兼容。一次最终独立review，按独立逻辑单元提交；P10.3 Scope PASS不等于P10 COMPLETE，不解除P11.6 HOLD。

---

# 历史任务：P10.2 独立验证与代码审查（2026-10-22）

## 2026-10-23 提交与推送授权

用户在验证报告后明确要求“提交并推送”，授权将下述已验证的十三个文件作为同一修复单元提交并推送到 `codex/p10.2-database-mcp-read-tools`。该指令覆盖此前仅针对本批补丁的“不自动提交/推送、等待用户决定”；不授权合并 PR、修改 master、解除 draft、升级版本或发布。提交前复核工作树范围、HEAD/远端与七个代码/测试文件冻结哈希，均与验证结果一致，无新增用户改动；只更新交付授权文档，不重复运行未变化源码的完整测试。交付 SHA、推送状态与最终工作树以 Git 及最终回复为准；P11.6 继续 HOLD，交付后停止。

验证目标：`codex/p10.2-database-mcp-read-tools` / `890f478b90ed4906e908a92f11f05724efed60ad`。
起始工作树干净；本地 HEAD 与 `git ls-remote` 返回的目标远端 HEAD 一致，master 为 `c574b4104baeae527d77a500463f779c55845a7b`。

| 单元 | 模式 / 角色 | 验收 / 状态 |
| --- | --- | --- |
| V1 | investigate / 主 Agent | 工作区、分支、远端、PR 与规则核对完成 |
| V2 | review / reviewer | 原实现及末态最小修复已独立复核，当前补丁无未解决 blocker |
| V3 | review / 主 Agent | 领域/游标/权限审查及最终源码 Inspector 42/42、真实 standalone 负向 3/3 完成 |
| V4 | investigate → verify / S0 scout | 原提交基线、两组红绿与最终五项完整门槛均已执行，终态全部通过、0 skip/cancel |
| V5 | decide → execute / 主 Agent + S1 fast_worker | 六行生产修复、完整工具清单和回归已验证；2026-10-23 用户授权本批提交推送，原提交验收 FAIL |

2026-10-22 验证阶段不自动 commit / push / merge / 发布；其后的提交推送授权见上文，仍不得修改 master。修复前先记录问题与证据，修复后重跑受影响验证。P11.6 保持 HOLD，不进入 P10.3 / P12。

## 修复前审查证据

- P1 测试阻断：`apps/api/src/modules/mcp/mcp.test.ts:893-895` 与 `mcp-write.test.ts:181-184` 的工具清单仍期待六工具，而服务实际注册十一工具；首次完整 MCP 运行已复现这两项失败（32/34，exit 1），仅更新完整清单，不删断言。
- P2 输出不兼容：`mcp-database-read.contract.ts:36,97` 给 Select options / Record string 新增 100 / 20,000 限制，但 `packages/contracts/src/index.ts:265-284` 和 `packages/domain/src/database.ts` 允许更大合法值；导致未达 1 MiB 的合法读取在输出 parse 时误报 INTERNAL。最小修复为去掉这两个额外限制，继续检查真实序列化 DTO 字节，并补真实 MCP 回归。
- P2 资源限制遗漏：`mcp.service.ts:176-183` 的 `eotion_list_workspaces` 是唯一未调用 `assertMcpResultSize` 的成功结果路径，与 P10 所有工具 1 MiB 上限不符。最小修复仅补同一 DTO 大小检查，保留 P6 schema 与原通用错误语义，不截断结果。
- 文档：`docs/runbooks/testing.md` 的 MCP 段仍只描述 P6，收口时补 P10 读取覆盖；复核确认原段未列四文件清单，不将此前协作摘要中的“漏文件清单”当作缺陷。
- 验收缺口：原新增用例未运行覆盖新工具大小错误、合法长值、派生读取和读取中版本冲突；需实际补验证，不从 happy path 推断通过。

首次验证环境：Node 24.22.0 / pnpm 10.34.2；独立 TEMP MongoDB 8.2.3 replica set（55882，`eotion_p102_890f478b`），已确认 PRIMARY 与事务 probe。原用户 Mongo 27017 不触碰。原始日志根：`C:/Users/31250/AppData/Local/Temp/Eotion-P10.2-890f478b-verify-20261022`。

首次结果：typecheck / build:api exit 0；Domain 16/16、HTTP 43/43、MCP 32/34（两处旧六工具清单断言），测试 skip 0。真实 Inspector 2.12.0（Streamable HTTP）已发现十一工具，并用真实领域服务创建的 101 选项 Select 复现 Schema 工具返回 INTERNAL（`inspector-baseline-r4/03-schema.stdout.json`，客户端 exit 5）。临时验收脚本前两次 fixture/CLI 输出读取错误已纠正，保留各次独立日志，不将其计为产品缺陷。

新增回归在未修复生产代码上实际运行：41 项，32 通过 / 9 失败 / 0 skip（`06-test-mcp-regression-red.log`，exit 1）；八项具体边界失败加父集成用例聚合失败。包含超大 Workspace 未拒绝、101 options / 20,001 字文本被拒，以及 >1 MiB Record 实际 INTERNAL 而非 LIMIT_EXCEEDED。随后仅对生产代码做三行修复：移除两处额外 max，补 Workspace DTO guard。测试保留完整十一工具清单及 P6 原行为，未删断言或跳过测试。正在执行修复后的定向与完整验证。

后续明确失败（修复前记录）：真实 Inspector 将保存的 View.config 设为 null，query 带 filters:[]/sorts:[] 仍成功，违反非法保存配置不得静默忽略；证据 `inspector-null-config-probe/null-saved-config.stdout.json`（实际客户端 exit 0，预期冲突 exit 5）。`DatabaseView` / domain validator 只允许 config 缺省为 undefined，P8 文档仅承诺旧 View 缺少字段的默认兼容；repository `database.repository.ts:328` 的 `?? DEFAULT` 先掩盖 null，`DatabaseService:138,356` 又有同类回退。拟最小修复只对 undefined 使用默认值，保留并拒绝 null；补缺省兼容/null拒绝回归，重新验证。此前三行修复的 MCP 41/41 与 Inspector 38/38 仅为中间结果，不据此宣称最终 PASS。

## 最终验证结果（本地未提交修复工作树）

- `pnpm typecheck`：exit 0（`15-typecheck-final.log`）。
- `pnpm build:api`：exit 0（`16-build-api-final.log`）。
- API `test:domain`：16/16，exit 0（`17-domain-final.log`）。
- API `test:http`：18 + 1 + 24 = 43/43，exit 0（`18-http-final.log`）。
- API `test:mcp`：43/43，exit 0（`19-mcp-final.log`）。最终所有测试 skip/cancel 0；汇总 `final-after-null.summary.json`，不以先前 08–12 的中间结果替代终态。
- Null 配置回归：旧代码 43 项 41 通过 / 2 失败（null 子例和父聚合失败）；缺少配置及大小子例实际均已执行通过。三处仅 undefined 默认的修复后，43/43 通过（`13-null-config-red.log` / `14-null-config-fixed.log`）。
- 真实 MCP Inspector 2.12.0（进程外 CLI / Streamable HTTP）最终一次 42/42，harness exit 0；预期工具错误的 CLI exit 5 也按实际响应断言，原始结果见 `inspector-final-r2/summary.json` 与逐项 stdout/stderr。包含四 View 保存 Filter/Sort、临时查询/投影、Formula/Rollup/Timeline Date+Dependency、权限等价、游标作用域与版本、读间真实 mutation 冲突、损坏/null 配置和缺省兼容、实际序列化大小错误；Token/fixture DB/API 已清理。
- 真实独立 standalone Mongo 负向：3/3，launcher/Node exit 0；基础 get_record 成功，Formula get_record/query 均 UNAVAILABLE 且脱敏；未 mock 事务能力，hello 确认非 replica set。首次 launcher 启动退出未启动 API，修正 TEMP 启动参数并记录 stderr 后完整通过，不归因为产品缺陷。证据 `standalone-negative/summary.json`；自有 57170/PID42600、Token/fixture DB/API 已清理。
- 最终独立复核未发现新的 blocker；`git diff --check` 通过；七个代码/测试文件与冻结的 `final-source-sha256.json` 均一致。生产改动仅六行，未更改模型、工具范围或已批准查询语义。
- 最终远端复核：PR #1 仍 open/draft/unmerged；目标远端/HEAD 仍 `890f478b90ed4906e908a92f11f05724efed60ad`；master 仍 `c574b4104baeae527d77a500463f779c55845a7b`。**指定提交验收 FAIL**，本地修复验证通过不能归属原提交。没有 commit/push/merge/发布，等用户决定是否提交补丁；P11.6 HOLD 不变。
- 清理：55882/PID21064 按已核对的 birth 身份正常 admin shutdown，进程和监听均消失，关闭前仅 admin/config/local 系统库；`cleanup.json` 为直接证据。原 27017/PID4948 保持监听且未连接/触碰。两轮自有 API、临时 Token/数据库及 sync 生成的 SQLite 测试文件均已清理；未删除原始证据。

以下为实现阶段与更早任务的原始记录，验证结论另行记录，不继承其正确性假设。

---

# 历史任务：P10.2 Database MCP Read Tools（2026-10-22）

P10.1 最终契约已获用户批准。当前在独立分支 `codex/p10.2-database-mcp-read-tools` 实施只读工具；草稿 PR：[P10.2: add database MCP read tools](https://github.com/Evanpatchouli/Eotion/pull/1)。本地 Windows / WSL 工作树未连接到当前执行环境，不能推断用户本地是否存在未提交改动。

## 当前范围

- 新增 `eotion_list_databases`、`eotion_get_database_schema`、`eotion_query_database`、`eotion_get_record`、`eotion_resolve_relation_records`。
- 复用现有 `DatabaseService.getViewRecords`，临时 Filter / Sort 分别整体替换对应保存配置，不修改 View。
- 支持 Table / List / Board / Timeline；保持 P6 六工具兼容。
- 不做 Database / Record / Property / View 写工具，不做数据库删除，不改版本。
- P11.6 保持 HOLD，不调查；不进入 P12。

## 工作单元

- [x] 只读审计远端 master、领域服务、MCP 契约、测试与相关文档。
- [x] 增加五个工具的输入/输出契约及读取服务。
- [x] 增加契约测试与 MCP 集成测试。
- [x] 更新 Roadmap、P10 契约文档与检索索引。
- [ ] 在具备项目依赖和 Mongo 测试环境的机器执行 typecheck/build/domain/http/mcp。
- [ ] 真实 MCP Client 验收与独立 review。

## 验证边界

远端 master 基线为 `c574b4104baeae527d77a500463f779c55845a7b`。本次实现提交位于独立分支与草稿 PR，未合并。当前环境没有项目本地 clone，且无法从 npm registry 下载 pnpm/依赖；未执行任何测试或构建，不能标记 PASS。仓库树中未发现 GitHub Actions workflow，当前实现 commit 没有状态检查。

以下保留前一项 P11.6 任务的历史取证记录，不代表重新启动该任务。

---

# 历史任务：P11.6 启动故障专项诊断（取证结束，HOLD不变）

2026-10-22 最终实验已结束，不再启动测试。R5原目标A三次通过，R1单例通过；B脚本前5为111/111、历史实际前7为363/365（theme启动buffer与菜单定位）、实际前13为496/497（菜单定位）；R1/R5目标通过。C14文件各独立runner全部完成，只有Database252/254（Frozen内容、属性菜单），其余文件通过，所有workers1/retries0；不拼成完整Product。D原前94项一次有限复验94/94、worker0且实际顺序逐项一致，无稳定最小因果前缀。

已捕获同类启动错误，但模块为theme.ts、请求未进Vite首middleware，App未挂载；底层资源来源仍未知。R1未复现，缺原失败trace，无共同根因证据；无生产修复Brief。报告：docs/verification/p11-6-startup-forensics.md。自有服务/runner/采样器退出，7179无监听、1466 PID+birth身份无残留；用户服务未终止，最终7173也无监听。源码/原spec/config/旧验收/版本审计通过，0.0.1/build2和P11.6 HOLD不变。

本轮独立review完成，两个提交前P2（生成副本/Windows长路径）均闭合，无新P1/P2。14副本已SHA安全清理；归档缩短路径保留原映射，误归属fastctx132次观测已排除派生统计，原始记录不改。三组SHA核验通过，原14文件无诊断env仍收集511项。按已授权范围仅提交诊断工具/报告/证据并推送origin/master，交付SHA以Git与最终回复为准；此后停止，不新增实验/修复/发布。以下为过程历史。

2026-10-22 用户撤回停止指令并明确“继续工作”：恢复剩余实验。旧批已按用户停止要求终止所有自有进程，未提交/推送；不覆盖旧批。恢复fetch后HEAD/origin仍d71a5bf，源审计14原spec/生产/正式配置无改动，版本检查通过。C前2spec完整通过，C03 editor仅23项完成后中断，不计完整；新子目录resume-20261022从editor整文件重跑至C14。随后至多一次prefix94有限复验和一次最终独立review。原提交/推送授权保留，完成诊断材料后推送并停止，P11.6 HOLD不变。

2026-10-21：用户授权调查 R5 ERR_NO_BUFFER_SPACE 与 R1 历史白屏；不改生产代码、业务断言、timeout/retry/flags、版本或 P10，不重跑完整 P11.6，不发布。P11.6 HOLD / 0.0.1 build 2 不变。

起始 fetch 后 master / HEAD / origin/master 均 d71a5bf680061a4ab06e2e38323be840cdccebe2，工作树干净。

| 单元 | 模式 / 等级 | 验收 |
| --- | --- | --- |
| F1 | investigate / S0 scout | 复用历史证据、SHA与实际spec/worker上下文 |
| F2 | decide / S2 主Agent | 临时非阻塞请求/CDP/DOM/Vite/Windows观测边界 |
| F3 | execute / S1 fast_worker | 诊断spec副本、fixture/config/reporter，不改原测试 |
| F4 | verify / S0 主Agent | R5独立/累计前缀/14独立，R1独立与原顺序前缀；每runner独立 |
| F5 | investigate / S2 主Agent | 只按直接证据归因；未复现不称已修 |
| F6 | review / reviewer | 一次独立证据审查、SHA/diff/自有进程清理、诊断提交推送后停止 |

证据根：docs/verification/evidence/p11-6-startup-forensics-20261021/。7173原有用户Vite PID58068保留；本轮使用原Vite配置的VITE_PORT=7179及对应baseURL，仅隔离端口，不添加Chromium flags。原始证据不可覆盖。下文为历史任务记录。

# 历史任务：P11.6 时间线创建与日期配置漏项已补齐（Scope PASS）

## 2026-10-21 用户授权的新工作

补齐正式 Timeline 创建入口与日期属性配置，从正式 UI 验证创建、使用、刷新恢复，补回归并写回 P11.6 报告。P11 Final 既有 HOLD 保留；不升级版本或发布。

Work Units：
- S0 investigate：定位创建/配置 contract 与可复用 UI（scout）。
- S0 investigate：定位产品回归和隔离真实 API/Mongo E2E 基础（scout）。
- S2 decide：主 Agent 冻结最小 UI、日期源配置和 identity/CAS invariant。
- S1 execute：按 Brief 实现入口与配置、回归测试及报告。
- S0 verify：定向回归、typecheck/build、正式 UI 全链路。
- Review：最终一次独立复核；按独立逻辑单元提交。

实施与验证已完成：正式菜单创建、日期源单列/双列配置、显式新增日期、已有 Timeline 日期编辑；
复用 View CRUD/CAS，保留 options；补 unknown 同 ID 恢复和 offline/late response fence。
真实 E2E 发现并修复新建 Database 临时只读导致 viewBusy 非响应式缓存，已有 observer ref复用。
产品定向12/12及旧创建菜单补充8/8、真实构建 Web/API/Mongo E2E 1/1（R5/R6均PASS）、Web typecheck/build、API build通过。
证据位于 docs/verification/evidence/p11-6-timeline-entry/；隔离Mongo与API/Web已关闭，用户Vite保留。
正式报告顶部记录漏项、红绿证据、补验边界；原P11.6 HOLD和0.0.1/build2保持。
最终独立review已完成，无新增P1/P2 blocker；实现提交03bfd6d，文档与证据独立提交，无版本升级/推送/发布。

以下为前次验收历史记录。

## 最后用户指令：提交并推送已验收成果

用户在HOLD汇报后明确授权提交/推送并重组最终汇报。按实现98ba631、视觉893e8e8、文档证据
三个逻辑单元保存；版本0.0.1/build2和P11.6 HOLD不变，不发布。最终交付SHA以包含本记录的
文档提交及最终回复为准，推送后核对HEAD=origin/master且工作树干净。以下“不提交/dirty”
是授权前历史状态，不能作为当前禁令。P10及两个启动问题仍未解决，不得宣称Final PASS。

## 2026-10-21 最终交付状态（以下过程按历史保留）

完整R5：Product505/506（1FAIL）、独立Database249/249、Visual13/13、logic/theme92/92；
worker1/retries0、skip/flaky0。Web/API typecheck/build、后端分层242/242及version check通过。
四旧视觉分别裁定C、C+B、C+B、C并仅更新对应四图；P11.5历史9/13保留。
Offscreen与最低未排期安排已补齐。AF竞态和dirty标题覆盖产品缺陷均已修并有红绿回归。
R5唯一失败为启动必需module ERR_NO_BUFFER_SPACE、App未mount；该次阶段已定位但资源来源
未定，R1无trace白屏仍独立unknown，不冒称同因或已修。P10缺失按用户裁定继续Final HOLD，
不扩展P10/P15。最终17项矩阵/原始证据见docs/verification/p11-6-timeline-final-acceptance.md。
临时Mongo、Vite与runner均退出，指定临时端口无监听；用户Mongo未触碰。
版本0.0.1/build2；master/ff0901c，未提交改动保留；不提交/推送/发布/进入其他阶段。
最终独立review与Git审计在验收报告顶部记录。只有用户后续明确指示才继续处理HOLD。

## 2026-10-21 恢复执行

前一R3在18/503已记录通过后中断，Product无最终summary；typecheck/build/logic92已完整，
不把部分Product计完整门禁，原因未知，原日志归档final-web-r3-interrupted。旧自有进程恢复时已
不在，7173/7176/55479均无监听；用户Mongo服务不触碰。新自有Vite7173/PID33692独立启动。
Chrome外部更新155.0.8059.85→156.0.8078.47，原preflight正确阻断。TEMP两轮诊断26PASS非正式gate；
13actual重复稳定，四已更新图与155golden精确同；六Timeline对155实际图一张同、五张各1pixel且
strict0，Mobile旧golden差为已审offscreen变化。另3旧图RGB/BGR RAM诊断strict残差0，无直接155raw，
不声称完全同或156新增。主Agent逐图审13actual及5三联，独立review认可仅更新环境browserVersion，
不改任何PNG/阈值/flags。R4现按正常preflight从头完整6gate运行，Product503/Database246按实计。
P10缺失及一次未归因首屏white仍Final HOLD；不commit/push/升级/发布。

## 2026-10-20 用户续推授权

优先解决四旧视觉差异及完整Product/Database失败，再补Timeline内未排期安排。
用户已明确：P10缺失仍须列Final HOLD；本轮不扩展工具。版本0.0.1/build2不变，全部强制门禁和独立review认可前不commit/push/publish。
接续工作树保留上轮改动，HEAD仍ff0901c；不覆盖历史红证据。

| 续推单元 | 认知 / 等级 | 产出 |
| --- | --- | --- |
| R1 | investigate / S0 | 旧视觉glyph因果证据、环境复现与逐项裁定，不重复无结论GPU实验 |
| R2 | investigate / S0 | Product编辑/选区/持久化共同根因、布局与About独立问题 |
| R3 | decide / S2 主Agent | 按真实证据冻结最小修复Brief，执行再降S1 |
| R4 | execute / S1 | 视觉/产品测试阻断修复；随后补未排期安排，复用generic CAS/atomic policy/receipt |
| R5 | verify / S0 | 定向红绿后完整Product/Database/visual及相关后端、build/typecheck/version，不拼接全绿 |
| R6 | review / 独立reviewer | 一次末态review、证据/矩阵更新与服务清理；全满足前保留未提交 |

新TEMP证据根：`C:/Users/31250/AppData/Local/Temp/eotion-p116-resume-dfbb4269eb4c4a6794279c34f3d9ba5d`。

续推最新：四visual已逐项C/B裁定并精准更新4图，完整13/13；未排期安排10例及真实HTTP空值
级联/回滚通过，backend242/242已停Mongo。R1完整Product495/496、DB238/239；R2完整
Product494/496、DB239/239、visual13/13，红历史全保留。白屏原因未知，current/baseline各单1+
fullsync42通过也不称已修。R1 coarse坐标过期加trial ready；R2 coarse实际是Escape关闭setup，
已改现有关闭按钮tap；均不放宽手势断言。R2还真实捕获title输入被双RAF autofocus抢到body。
产品focus guard已apply PageView/EotionEditor/Overlay+私有scope helper；7新回归旧代码2PASS5FAIL→
新代码7PASS，原identity/coarse各repeat3合6PASS，Web typecheck通过，相关scope验证进行中。
下一步final-web-r3完整6门禁（新增7后预期Product503/Database246，按实际计数），独立终审及清理。
7176已关闭，7173自有listener PID53028仍运行；P10缺失及未归因白屏仍Final HOLD，不提交推送。

## 前次验收：HOLD（保留原始结果）

起始 master / HEAD / fetch 后 origin/master：`ff0901c7545c9bc1addad9114cc1d41492a52eb3`；工作树干净。
版本冻结 0.0.1 / build 2；只在所有强制门禁及独立 review 满足后提交推送，结束后停止。
不更新版本、依赖或 lockfile，不创建 tag/Release，不访问用户数据库。

| 单元 | 模式 / 等级 / 角色 | 产出与顺序 |
| --- | --- | --- |
| U1 | investigate / S0 scout + 主 Agent 图像复核 | 四组原三图均已逐项视检；正式repeat2稳定8FAIL，Mobile toolbar/Desktop Settings部分B已证，余字形C未定，各项HOLD，无快照更新 |
| U2 | investigate / S0 scout | §24缺口：offscreen未实施；Unplanned无Timeline内安排，Table workaround不算；grouping/行重排用户已明确后置 |
| U3 | decide / S2 主 Agent | 报告内Brief冻结；复用既有coordinates/viewport/row window，不改持久模型/调度/API |
| U4 | execute / S1 fast_worker | Offscreen已实施；3/3定向+角点增补1/1/typecheck通过，三项新增focus/touch P2修复并独立复核；生产代码已冻结 |
| U5 | verify / S0 scout + 主Agent接续 | 正式完整Product476/486、独立Database226/229、visual9/13，均workers1/retries0；生产theme2/2、后端全门禁、Web/API typecheck/build/version通过；12唯一失败current4/12、ff5/12，定向不替代完整结果 |
| U6 | review / reviewer + 回退独立reviewer + 主Agent | 三新P2已闭合，最终独立终审认可HOLD、无新确定代码P1/P2或报告blocker；四视觉、Unplanned、P10前提及完整门禁失败仍HOLD；按提交门禁未commit/push，版本0.0.1/build2 |

本轮临时证据根：`C:/Users/31250/AppData/Local/Temp/eotion-p116-c91e3284da1d43a4a12362d3f2d4e690`。
P11.5 原始9/13保留，不继承例外。详见 `docs/verification/p11-6-timeline-final-acceptance.md`。
2026-10-20收口：HEAD/origin/master均ff0901c，工作树保留本轮未提交改动（不满足用户提交条件）。
自有Mongo54463与Web7173均已关闭，7173/7176/4175/54463无监听；证据见报告与git-final/service-cleanup JSON。
停止在P11.6 HOLD，不升级、不tag/Release、不进入其他阶段。

## 历史：P11.5 Responsive + Visual Polish — COMPLETE / PASS（Scope，用户接受旧视觉例外）

基线（2026-10-19）：master，fetch后HEAD/origin/master均为
`a94f0cc4ee7dfd994b5073370f15bef23b49393c`，工作树干净；0.0.1/build2不变。
仅P11.5，完成后停止，不启动P11.6/tag/Release。

| 单元 | 模式 / 等级 / 角色 | 验收 / 状态 |
| --- | --- | --- |
| U1 | investigate / S0 scout | renderer触控布局Evidence Pack；完成 |
| U2 | decide / S2 主Agent | 下列Brief；已冻结 |
| U3 | execute / S1 fast_worker | 实施完成，含Bar主题几何/状态断言6/6；末修后加原B真touch与D键盘合8/8 |
| U4 | execute / S1 fast_worker | 六新图PASS；Tablet与Phone末修均先看live actual再最小更新；最后visual9/13，旧4与a94 actual字节相同 |
| U5 | verify / S0 scout + reviewer | logic/theme92/92、typecheck/version通过；最终production build+2theme通过；完整三批224/226、225/226、226/226均保留；末修P2已独立复核修复，0新增未修P1/P2 |
| U6 | execute / S1 主Agent | 用户明确接受旧4视觉例外并回复“提交”，已授权分单元提交推送；实现363ac66、视觉721e139，最终文档SHA/远端/干净工作树见交付核对；测试端口均已停 |

2026-10-19用户确认：在明确询问是否接受四项已证旧视觉差异为例外并提交推送后，回复
“提交”。据此P11.5 Scope PASS，自动visual仍9/13，不更新旧七图；P11.6不启动。

## P11.5 Implementation Brief（修改前）

- 原生横滚、共享row geometry、48px行/32pxBar、44px触控point及Frozen<=700px
  仅标题列已存在。保留单renderer/P9 fence/持久配置。
- Header的420px窗口媒体查询改为Timeline root container query；紧凑时period
  独占一行，navigation与scale同一行且互不挤压。
- 初始真实PNG证明Month36px minor ticks被完整月日标签覆盖；minor day改locale日号，
  标签宽度约束在tick内，保留major年月、tick边界/密度/geometry/budget。
- dependency管理26px与未排期打开32px可在coarse下扩大；日期handles 10x32px、
  connector28x20px先保留仲裁，避免覆盖Bar主入口/相邻行，记录例外及真实touch命中。
- generic Database继续拥有首次loading/error/retry/offline与staleReadonly；
  refreshLoadedWindow保留已有DOM，补充受现有requestEpoch保护的轻量刷新提示。
  不造loader服务，不改变receipt三态/零重试。
- 复用Quiet Studio token；主题不改几何/状态。真实浏览器核对原生底部scrollbar，
  需要时补充可见样式。禁止Domain/Date wire/Relation/API/SDK/MCP/版本/标题同步改动。

验收：1440x900、1024x900、390x844、360x800的Light/Dark，手机hasTouch/isMobile及
pointer:coarse；navigation/scale/scroll/无全页overflow/Frozen同步/配置不变/主题几何不变。
touch覆盖tap open、move/resize提交取消、connector创建、line单次选择删除、短Bar/point/
相邻行/边缘命中及清理。状态覆盖loading/refresh/reconnect/空库/全未排期/混合/error/retry/
offline/pending，既有C/D回归继续保护receipt与staleReadonly。

视觉6张：Desktop L/D、Tablet L、Phone L/D、空或未排期；固定时间/zh-CN/Asia-Shanghai/
reduced-motion，先检视PNG再建立最小基线。既有7张基线不更新。自动比图、功能测试、Agent
视检分列。最终完整Database单worker零重试一次运行并保留原始日志，全部Timeline logic/
P11.3/4专项、visual/theme、typecheck/build/version/diff及独立review；不启动Mongo/P11.6。

## 历史：P11.4D Dependency Final Acceptance — COMPLETE / PASS（Scope）

## D 阶段范围与基线（2026-10-19）

仅执行 D1–D4；完成后停止，不进入 P11.5 / P11 Final / 发布。版本保持 0.0.1 / build 2。
开始分支 master，工作树干净；HEAD 与 fetch 后 origin/master 均为
`2f84ef5ca560bbcd6e8afa06b14ab1d8252bb743`。

| 单元 | 模式 / 等级 / 角色 | 产出 | 状态 |
| --- | --- | --- | --- |
| D1a | investigate / S0 scout | connector、目标、focus、取消 fence Evidence Pack | 完成 |
| D1b | decide / S2 主 Agent | 最小键盘创建 Implementation Brief | 已冻结，见下 |
| D1c | execute / S1 fast_worker | 键盘创建与 Web 回归 | 5f7f56c；15/15 PASS，真实silent readonly修复/三尺寸L-D视检完成 |
| D2a | investigate / S0 scout | receipt 三态反馈问题证据 | 已确认两条 not_committed 成功刷新分支缺提示 |
| D2b | execute / S1 fast_worker | 已确认未提交反馈与边界回归 | a1c2f4f；Web 12/12 PASS，修前缺提示红证据保留 |
| D3a | decide / S2 worker | 混合精度既有契约与 Implementation Brief | 已冻结，见下 |
| D3b | execute / S1 fast_worker | Domain 与真实 HTTP 精度回归 | 965fa0e；Domain92/92、真实HTTP18/18、API build/typecheck通过 |
| D4 | verify / S0 scout + independent reviewer | 分层矩阵、完整 Database Web、review、文档 | 首220/221的双status回归已由1e30603修复；定向13/13、最终完整221/221，0skip；独立review Scope PASS/0blocker |

Evidence：Dependency 永久关系仍是 self Relation Cell；active Date/create 复用 generic
cell-mutations 与同 mutationId 整批 receipt。手动 Separate Start/End 继续只读；D3 仅收口
自动调度两个合法 Date Cell 的精度契约。不新增实体/API/候选查询/依赖，不削弱 lifecycle fence。
C 已证 PageView dirty-title 基线问题隔离，不改标题同步；完整 Database Web 单 worker、零重试，
保留实际结果。先做定向，再跑 A/B/C、P11.3、完整 Database、Domain/Contracts/SDK、隔离
Mongo/HTTP CAS/rollback/receipt、API/Web typecheck/build/version/diff check 与最终独立 review。

最终验证完成：Domain92/Contracts29/SDK24、Timeline logic88；真实Mongo Domain16/performance1/
HTTP18；Web最终221/221，P11.3合25、A8/B27/C14/D27全部通过；API/Webtypecheck/build及版本
门禁通过。Mongo61930/PID5360已退出、listener0；两轮Vite均已停、7173无监听。
版本0.0.1/build2，独立review0未修P1/P2。最后实现提交1e30603；最终交付为包含本记录的文档
提交，SHA见交付消息。仅D完成，停止；P11.5/P11 Final/发布未启动。

## 历史：P11.4C COMPLETE / PASS（Scope）

## D1 Implementation Brief（编码前冻结）

D1 定向真实失败补充：editor.setEditable(false) 未触发 Timeline writable prop，active preview
未取消（提交 liveguard 仍阻写）。reviewer进一步发现正式路径setEditable(...,false)不发update；
NodeView仅为Timeline通过MutationObserver观察Editor view DOM的contenteditable属性，初始同步
与变更同步reactive editable，卸载disconnect，并合入传入Timeline的writable。
不扩通用toolbar/Board行为；真实silent false→true及DOM属性回归必须保留，不用props注入替代。

- Enter/Space 在来源 connector 启动，捕获与 pointerdown 相同的 dependency snapshot。
- 焦点保持来源 connector；上下/左右方向键在当前 rendered scheduled、非自身、非重复边的目标间循环，Home/End 可选首末。初始选第一个合法目标；没有候选时明确提示且不提交。
- Enter/Space 再次确认，复用同一 mutateDependency；Escape 取消，0 mutation。Tab 离开取消，避免全局键盘劫持。
- 复用 previewEdge 与 geometry 显示目标，持久 aria-live 状态宣告来源/目标/快捷键/保存及结果；候选 Bar 有可见选择反馈。
- 成功/失败/取消后只在同一 scope、DOM root 有效且焦点仍由本交互占用或丢失时恢复来源 connector；不抢占用户已转移焦点，不把旧响应焦点带到新 View。
- 保留 pointer capture/cancel、scope/config/viewport/online/writable fence；监听 rendered source/target 消失和重复边变化，立即取消或清目标，确认前再次验证合法性。keyboard linking 与 Date drag/resize、pending 互斥。
- 不补取目标、不新增 API、不修改 Relation mapping；实现限 TimelineBar/Viewport/hook，Web真实交互回归沿用 product-database fixture。

## D2 Implementation Brief（调查已确认）

两条 active batch 的 not_committed receipt 分支，在 canonical refresh 后仍属当前 scope 时明确提示：
刷新成功为“提交结果已确认未执行，已刷新服务器最新内容。”；刷新失败保留现有未完成提示。
committed 不报事务失败，uncertain/receipt失败保持结果未知和只读，不 retry mutation。
补 Date/create 两路径三态、receipt失败、refresh失败、scope变化回归；不改通用后端或身份边界。

## D3 Implementation Brief（决策冻结）

P11.1 的同精度校验只约束单 Cell 内部；两个独立原生 Date Cell 合法，§21.2 不要求跨 Cell 同精度。
删除 planner 额外跨 Cell 拒绝；finish 使用 End Cell kind：datetime 精确 instant，date-only
为该 UTC 日期次日边界。先算 finish 再检查范围；date-only End 需 finish>start，datetime End 允许相等。
Start=date-only 时 required ceil 到 UTC 日初；Start=datetime、End=date-only 时正向 delta ceil
到整 UTC 日，再按 Start 自身时区应用 weekend。每 datetime Cell 按实际 elapsed delta 移其全部端点；
每 date-only Cell 按 Start 新旧 UTC 日期差移动，保留 shape/zone/ms/内部范围。
混合外层没有统一 elapsed duration；DST weekend 后仍保持每 Cell 内部范围与 UTC calendar span，
最终重新校验，越界失败整体回滚。普通同精度行为不变。
现有 renderer mixed=incompatible-kinds 未排期诊断保持，明确 server canonical 支持不等于混合 Bar
可视化或手动双 Cell 编辑。实现限 scheduling.ts、Domain测试、真实 HTTP Separate source Relation
create+context 回归及契约文档；不改 Date validator、Contracts、模型或接口。

## 当前范围（2026-10-19）

仅收口 P11.4C，不进入 D / P11.5 / P11 Final，不改版本。正式契约和验证矩阵见
`docs/verification/p11-4c-auto-shift-policies.md`；接续事实见
`docs/verification/evidence/p11-4c-resume-20261019.json`。

| 单元 | 模式 / 等级 / 角色 | 输出 | 状态 |
| --- | --- | --- | --- |
| R1 | investigate / S0 scout | standalone、Board dirty-title refresh 与 baseline 时序 Evidence Pack | 完成；4 条有效 trace 显示同一 refresh 回退机制，0 HTTP、0 rename、0 batch mutation |
| R2 | decide / S2 主 Agent | 区分旧 PageView 草稿覆盖与 C 范围；决定修复 null batch 语义 | 完成；旧 PageView 不扩 scope，显式 null P2 已修 |
| R3 | execute / S1 | null clear 修复、几何/选区/异步保存前置 | 完成：438e393、a1a7394、eefe67a、81ea2a9、4818059、618f7ec |
| R4 | verify / S0 主 Agent + reviewer | 最终回归、证据与独立 review | 完成；C 范围 0 未修 P1/P2 blocker，Scope PASS |

R1 的四条有效 trace 均从 dirty draft / `titleSaving=false` 开始，`sync.revision` 1→2 后触发刷新，最终 draft 回到 canonical 标题；PageView identity 稳定、page item identity 改变，0 HTTP、0 rename、0 cell mutation。Reviewer 认可 baseline 表现为同机制；不修无关 PageView。

最终验证：Domain86/86、Contracts29/29、SDK24/24、Timeline logic88/88；Mongo8.2.3 Domain16/16、HTTP17/17（矩阵父+8策略子例计9）；API/Web build、typecheck、version check通过。最终完整Web193/194（workers1/retries0），P11.3 25/25、A8/8、B27/27、C14/14。唯一standalone dirty-title失败已由四条current/baseline同机制trace隔离为既有PageView问题，不称完整Web全绿。原baseline完整177/180，原始失败与中间批次保留在报告。

P11.3B reload 的真实缺口已由独立探针闭合：末态poll读到seed Timeline时，本地仍Table且pending Table upsert；4818059顺序等待Table→Timeline，修后本地/服务端Timeline、pending=0。618f7ec等异步Review id，f4c77a4补真实HTTP策略矩阵。最终完整门禁日志web-release-gate.log。P11.4B connector keyboard create P2仍留D/P11.5，不在本轮处理。

隔离Mongo均已关闭：61703/PID32300/`eotion_p114c_6ca102e54b3b`、61070/PID37200/`eotion_p114c_nullfix_a11e705872`、63334/PID36848/`eotion_p114c_nullfix_789f057983`；自有7173/7193/7194/7196/7197已停。版本0.0.1/build2不变。

完成并停在C。D必须独立启动，入口为本报告、domain scheduling、generic cell-mutations/receipt、canonical graph/rollback HTTP测试和NodeView active Date/create adapters。既有PageView草稿覆盖另立问题，不扩本轮范围。

## 上轮完成记录：P11.4B

基线 `1eb5e5db5c29bd97aa3a13ea4c39812c80bcd64c`，分支 `codex/p11-4b-dependency-editing`，开始工作树干净。
只执行 B；不移动日期、不改版本、不进入 P11.4C/D。

| 单元 | 模式 / 等级 / 角色 | 输出 | 状态 |
| --- | --- | --- | --- |
| B1 | investigate / S0 scout | Relation wire/validation/serialization/CAS/transaction Evidence Pack | 完成 |
| B2 | decide / S2 主 Agent | semantic mapping、pointerdown capture、canonical failure recovery Brief | 完成 |
| B3 | execute / S1 fast_worker | pure mutation logic + 27 tests | 完成，25ba107 |
| B4 | execute / S2→S1 worker / 主 Agent | linking/selection/delete、NodeView adapter、touch与review修复 | 完成，aa77aa9/e464c2e/db3c3ea |
| B5 | verify / S0–S1 scout / fast_worker | Web/API/Mongo、100/500、visual与P11.3回归 | f13f3f8；B27/27、logic86/86；最终完整Database180/180 |
| B6 | review / reviewer | 最终独立生产/测试复核 | 完成，0 P1/P2 blocker |

## Evidence Pack / 冻结边界

- `DatabaseNodeView.setRelation` → `updateProductDatabaseRecordCell` → existing Cell PATCH → `DatabaseService.updateRecordCell/assertRelationValues`；无新后端路径。
- Relation为最多50个unique stable-ID `string[]`，append/filter保序；existing domain允许self/cycle，Timeline额外拒绝self/semantic duplicate，允许cycle。
- gesture永远predecessor→successor；depends-on修改successor Relation中的predecessor；blocks修改predecessor Relation中的successor；create/delete同一纯mapping。
- pointerdown捕获完整scope/user/workspace/database/view/block/epoch/root、property/config/direction、DB version、loaded owner candidates原Cell/Record version；release不取新版本。
- 单owner完整Cell PATCH，现有双CAS/事务；savingCell在await前阻断第二写入。409刷新不重试；unknown只比较canonical membership，刷新失败staleReadonly。
- canonical Relation→P11.4A projection是唯一永久graph。只链接rendered scheduled Bar及其同record控件，无N+1，无Date写入。
- Pointer Events create/cancel与Date drag/resize仲裁；触控delete primary/session/bounds fence，首tap仅选择，再tap删除并抑制compatibility click。
- offline不可编辑，active linking cancel；scope/config/property变更fail closed。Cycle scheduling semantics deferred to P11.4C Auto Shift Policies.

## 验证与证据

报告：`docs/verification/p11-4b-dependency-editing.md`；架构§29。
logic86/86；Domain48/48；Contracts25/25；隔离Mongo Domain16/16；HTTP31/31（增补前），增补Database HTTP5/5。
B Web27/27；首完整Database178/180（两个非Timeline失败），最终源定向2/2通过；最终完整180/180通过，首轮不稳定证据保留，不称基线缺陷。
100/500：10/50 edges，4/20 generic table reads，额外Record requests0；pointermove投影/geometry引用稳定，无关DOM/Vue更新0，preview layer Vue4。
主Agent已视检Desktop/390 Light/Dark与Dark preview/selection；真实coarse/CDP touch create/delete 2 Relation PATCH / 0 Date PATCH / pageerror0。
Web typecheck/build、version check通过；版本0.0.1/build2不变。Mongo已停，证据目录见报告。

未运行完整Product其他13文件、native真机、Web连真实API全链、正式FPS、P11.4C/D/P11.5/Final/发布。
下一阶段只能由独立任务进入P11.4C；精确入口见报告§6，禁止把B的single Cell PASS当作Date cascade授权。
