# P10.4 Database MCP Final Acceptance

验收运行：2026-10-26；中断恢复后的收口校验：2026-10-29。**P10.4 FINAL HOLD；P10 Database MCP 未 COMPLETE。** 本轮全部指定命令已执行；完整 Product 和独立 Database 两项强制门槛失败，不能用 MCP 局部门槛豁免。P11.6 HOLD、历史启动失败结论及 0.0.1 / build 2 保持。恢复后未重复测试；478个冻结文件仍逐字节匹配，最终只复核证据打包与Git状态。

## 1. 候选与集成边界

- 产品基线：`1950ec233bb9563395d4cbbe81fdf9538d9c7acf`，包含 P10.3 的 `3faadd2`、`4fc4aee`、`1950ec2`；起始工作树干净。
- 验收分支：`codex/p10.4-database-mcp-final-acceptance`，从上述提交创建；P10.4 任务计划提交 `a0e27f1`。
- 起始本地 master/origin/master：`bdd6748ace0bb6880981257b9b64bcbdb16c517c`。与产品基线共同祖先 `2aad764b1c5028c9ed2175da8f02d1871d42b2bc`；候选独有三个 P10.3 提交，master 独有 `6b7c446`、`bdd6748` 两个部署提交。互不包含，未 merge、覆盖或修改 master。
- 本轮只补测试、验收 harness、证据和文档；产品代码、公共 API、模型、协议、依赖、正式 Product/Visual 配置与版本不变。不 push/tag/Release/发布。
- **冻结代码候选：`217f6273fae46a554f910fe2f4b4146338d9e68c`**，包含本轮测试提交 `d42b122` 和真实验收 harness 提交 `217f627`。测试/正式配置/产品源码的最终校验见 [478 文件清单](evidence/p10-final-acceptance/final-source-manifest.json)；全部产品代码与正式配置仍和 `1950ec2` 相同。后续交付提交只增加报告、文档与证据，不改变该候选代码。
- 结论仅适用于上述候选，**未集成 master**。没有自动 push/merge；master 的两个部署提交不在此候选内。

## 2. 完整十八工具

| 来源 | 工具 |
| --- | --- |
| P6（6） | `eotion_list_workspaces`、`eotion_list_pages`、`eotion_search_pages`、`eotion_get_page`、`eotion_create_page`、`eotion_update_page` |
| P10.2（5） | `eotion_list_databases`、`eotion_get_database_schema`、`eotion_query_database`、`eotion_get_record`、`eotion_resolve_relation_records` |
| P10.3（7） | `eotion_create_record`、`eotion_update_record_cell`、`eotion_create_property`、`eotion_update_property`、`eotion_create_view`、`eotion_update_view`、`eotion_rename_database` |

新增静态 [完整 Schema/annotations 快照](../../apps/api/src/modules/mcp/fixtures/mcp-tools.snapshot.ts) 逐项包含名称、inputSchema、outputSchema 和 annotations；真实 HTTP 官方 Client 集成与该独立 fixture 比较，并显式核对四个 hint。没有删除、batch、类型转换、renderer 专用工具。

## 3. 环境与证据方式

- Windows / PowerShell 7，Node 24.22.0，pnpm 10.34.2；MongoDB 8.2.3；Chrome 156.0.8078.47，Playwright 1.63.0。Visual 仍以正式 globalSetup 的实际预检为准。
- 全部数据库操作仅使用本轮自建 Mongo 随机端口/dbpath/数据库；无 27017 连接或用户数据库操作。账号、Workspace、Page、空 Database 由正式 HTTP 准备；验收写入走真实 MCP tools/call。Mongo 直接访问只用于旧 receipt fixture 播种、失败注入、只读审计与本轮测试库清理，不替代 MCP 业务验收。
- backend 自有 replica set：端口 `63687`，PID `40268`，OS 出生时间 `2026-10-26T10:56:44.9869424+08:00`，set `p104_74a8b5b969`；hello PRIMARY 和真实 transaction probe 通过。各测试自行创建并删除随机库。
- 每个命令独立保留 stdout/stderr/exit/时间和源码 SHA；每次失败/中间轮单独保存。原始文件留在 TEMP，所需日志压缩归档并记录原字节与归档 SHA；不覆盖历史 P10.3 或本轮失败。
- 完整 Product 使用原 14-spec 集合和正式配置，一次命令、workers=1/retries=0。附加 JSON reporter/retain-on-failure trace 仅取证；独立 Database 结果不替代完整 Product。

## 4. 验收矩阵与直接证据索引

下列 PASS 对应本轮自动化/真实客户端通过的具体 MCP 契约。它们不改变完整 Product/Database 的 FAIL 或整体 HOLD。历史 P10.3 数字仅用于定位，未代替本轮运行。每行附实际运行日志，源码入口用于查看具体断言。

| 项目 | 当前自动化 / 真实链路位置 | 本轮重点 | 结果 / 本轮证据 |
| --- | --- | --- | --- |
| A1 十八名称、输入/输出 Schema、annotations、无额外工具 | [mcp.test.ts](../../apps/api/src/modules/mcp/mcp.test.ts)、完整快照、构建 API Client/Inspector tools/list | 完整对象逐项比较，不只比较名称 | PASS · [MCP日志][M] |
| A2 P6 原输入/输出/错误、旧成功 receipt | [mcp-write.test.ts](../../apps/api/src/modules/mcp/mcp-write.test.ts)、read/write contract tests、[旧 fixture](../../apps/api/src/modules/mcp/fixtures/p6-mutation-receipts.fixture.ts) | 旧 runner 实际生成 receipt；当前 tools/call 重放与冲突、后来修改不被覆盖 | PASS · [MCP日志][M] |
| A3 invalid/revoked Token、Host/Origin、敏感字段 | mcp.test.ts 的真实 transport/双用户/Token 用例；mcp-read.contract.test.ts | 不暴露 Token、持久化字段、堆栈；不存在与无权等价 | PASS · [MCP日志][M] |
| B1 Database/Schema/Record、Relation search/resolve、四 View | mcp.test.ts；mcp-database-read.contract.test.ts；构建 API/Inspector/Web harness | 四类型查询及真实 Web 读取 | PASS · [MCP日志][M] |
| B2 保存/临时 Filter、Sort 独立整体替换、propertyIds、Title、空结果与分页 | mcp.test.ts；database.test.ts；verify-p104-mcp.mjs | 不写回 View；临时查询分别保留未覆盖条件；跨页无重复 | PASS · [MCP日志][M] |
| B3 cursor scope/query/Database/View/Page fence、外部写入失效 | mcp.test.ts 的 query cursor、domain/HTTP Database tests、两个 P104 harness | 新增真实 MCP rename 后旧 cursor 拒绝；Web/HTTP 写入及旧 CAS/旧 cursor 组合 | PASS · [MCP日志][M] |
| B4 Formula/Rollup、Date range/timeZone、Relation 投影与读取预算 | mcp.test.ts、mcp-database-write.test.ts、database.test.ts、domain/contracts tests、构建 API Client | 复用现有派生快照/预算、日期模型、Relation 数量 | PASS · [MCP日志][M] |
| B5 legacy config、显式 null/非法配置、合法长文本/Select options | mcp.test.ts 的 missing/null/101 options/20,001 text/序列化大小子例 | 缺省兼容，坏配置不被临时条件掩盖；不加无依据限制 | PASS · [MCP日志][M] |
| C1 create_record 原子 Record/Page、无孤立或重复、Title 唯一持久来源 | mcp-database-write.test.ts；构建 API/真实 Web + 只读 Mongo 审计 | Record 不保存 Title 副本；Page/Record 同事务 | PASS · [MCP日志][M] |
| C2 单 Cell、Title Page CAS、派生只读、null/空串/Relation [] | mcp-database-write.contract.test.ts、mcp-database-write.test.ts、HTTP Database tests | 只更新单属性，普通 Cell 与 Page 版本边界不变 | PASS · [MCP日志][M] |
| C3 Property 类型/config、Select cleanup、Relation/Formula/Rollup 引用保护 | 同上及 database.test.ts | 七工具成功/非法参数/归属/CAS/读回，关联清理/版本同事务 | PASS · [MCP日志][M] |
| C4 四种 View、引用、name-only、config 替换、未知 options | 同上、构建 API/Web harness | name-only 保留 config，完整替换保留显式带回的扩展 | PASS · [MCP日志][M] |
| C5 rename 仅 Database | mcp-database-write.test.ts、构建 API/Web harness 的 Page/View/正文审计 | 仅 Database name/version/updatedAt 推进 | PASS · [MCP日志][M] |
| D1 当前权限、实体真实归属、replay 前重查、同错误 | mcp.test.ts、mcp-database-write.test.ts 的双用户/跨 scope/replay 拒绝；独立 Client 双用户 | 不能凭 receipt 绕过权限或泄露存在性 | PASS · [MCP日志][M] |
| D2 Database/Record/Property/View/Page CAS、HTTP/P6 外部变更、同版本竞争 | mcp-write.test.ts、mcp-database-write.test.ts、HTTP/domain tests、真实 Web | 一个合法竞争者成功，旧意图不自动 merge | PASS · [MCP日志][M] |
| D3 首次 DTO、实体后来变化、同 key 不同 payload/scope、canonical JSON | 两写集成；旧 fixture；新增 View.options 嵌套反序 replay | 不 bump、不覆盖当前值；有效另一个 scope 也发生 hash 冲突 | PASS · [MCP日志][M] |
| D4 并发同 key、网络响应丢失、API 真重启持久 replay | 两写集成、verify-p104-mcp.mjs | 使用原 key/payload；不换 key 创建 | PASS · [MCP日志][M] |
| D5 业务/关联/版本/DTO/成功 receipt 同事务及失败回滚 | 两写集成的业务、DTO parse、大小、receipt 保存失败注入；HTTP batch 原回归 | 同 session；原 key 可恢复重试，P11 receipt 独立 | PASS · [MCP日志][M] |
| D6 UnknownTransactionCommitResult | mcp-database-write.test.ts 中真实提交后 ACK 丢失标签注入（两 P6 + create_record） | 返回结果未确认，不声称回滚/事务不支持；原 key 安全确认 | PASS · [MCP日志][M] |
| D7 真实 standalone 九写前拒绝 | verify-p104-mcp.mjs，replset shutdown 后同自有 dbpath 无 replSet 重启 | hello 证明 standalone，九 tools/call，八集合实体/版本/两类 receipt 完整快照不变 | PASS · [Client][CL] |
| E1 输入/输出分别 1 MiB UTF-8 JSON | write contracts、read contracts、两写集成的真实 UTF-8 超限 DTO 回滚 | 新增字符数低于阈值、字节数超限；不是完整 MCP HTTP body 限制 | PASS · [MCP日志][M] |
| E2 属性/View/Relation/派生读取/分页与查询预算 | domain、HTTP、MCP contracts/集成与 database performance | 沿用现有数量与预算，不扩大产品范围 | PASS · [MCP][M] / [性能][PF] |

### 旧回执来源

[生成器](../../scripts/generate-p104-legacy-fixture.mjs) 取 `git show 2aad764:.../document-mutation.service.ts`，TypeScript 仅转译到内存，将测试 Nest 中注入的 create/update 绑定为该历史类实例。通过真实 HTTP/MCP Client 和 Mongo transaction 生成两个 committed receipt；权限、Page/Block、CAS、存储与传输均真实，未 mock 事务能力，未用当前 McpMutationService 生成回执。历史源 SHA256 为 `3c1aa5f82e052f16e822fc2796117c1b1cc9e9106cc99588bd933407c25a1aed`。

[来源记录](../../apps/api/src/modules/mcp/fixtures/p6-mutation-receipts.provenance.json) 与静态 payload/hash/result 一并固定。回归以现有用户身份播种历史 receipt，随后全走当前 tools/call；同时验证当前实体后来变更后仍返回首次 DTO、不覆盖当前状态。

## 5. 实际命令结果

| 命令 | 本轮结果 | exit |
| --- | --- | --- |
| `pnpm typecheck` | PASS（正式 api-final-r2；首次新增测试夹具类型错误另存） | 0 |
| `pnpm build:api` | PASS | 0 |
| `pnpm build:web` | PASS；Vite chunk size warning 保留 | 0 |
| `pnpm --filter @eotion/domain test` | PASS 92/92，fail/skip/cancel 0 | 0 |
| `pnpm --filter @eotion/contracts test` | PASS 29/29，fail/skip/cancel 0 | 0 |
| `pnpm --filter @eotion/sdk test` | PASS 24/24，fail/skip/cancel 0 | 0 |
| `pnpm --filter @eotion/storage test` | PASS 7/7，fail/skip/cancel 0 | 0 |
| `pnpm --filter @eotion/api test:domain` | PASS 16/16，fail/skip/cancel 0 | 0 |
| `pnpm --filter @eotion/api test:http` | PASS 43/43（18 + 1 + 24），fail/skip/cancel 0 | 0 |
| `pnpm --filter @eotion/api test:mcp` | PASS 50/50，包含本轮新增断言；fail/skip/cancel 0 | 0 |
| `pnpm --filter @eotion/api test:database:performance` | PASS 1/1，fail/skip/cancel 0 | 0 |
| `pnpm --filter @eotion/web test:product --workers=1 --retries=0` | **FAIL：508 PASS / 3 FAIL / 511，24.9m**；完整一次命令 | 1 |
| `pnpm --filter @eotion/web exec playwright test tests/product-database.spec.ts --workers=1 --retries=0` | **FAIL：252 PASS / 2 FAIL / 254，11.1m**；不替代完整 Product | 1 |
| `pnpm --filter @eotion/web test:visual --workers=1 --retries=0` | PASS 13/13；正式环境预检匹配，未改快照/阈值/flags/黄金环境 | 0 |
| `pnpm version:check` | PASS，0.0.1 / build 2 | 0 |
| `git diff --check` | PASS，收口再次检查 | 0 |

所有最终命令的 SKIP/CANCEL 均为0，Playwright FLAKY 为0（retries=0）；FAIL 不改记为 FLAKY。backend 汇总包含独立保留的首轮 typecheck 失败，正式终态使用 api-final-r2。[完整 backend 实际命令/退出码](evidence/p10-final-acceptance/backend/overall-final-summary.json)、[三项 Web 实际命令/结果](evidence/p10-final-acceptance/web-gates/summary.json)。Web 三命令实际附加 `--reporter=list,json --trace=retain-on-failure` 取证，原集合与正式配置未变；每轮独立保存 reporter JSON、stdout/stderr、失败 trace/error-context。完整 Product 是一次完整执行，没有分文件拼接。

## 6. 真实客户端与产品链路

- [构建 API 官方 Client + Inspector](../../scripts/verify-p104-mcp.mjs)：本轮第五次独立执行 **PASS，74 条验收记录，exit0**。[最终摘要](evidence/p10-final-acceptance/client-final/summary.json)、[完整 transcript][CL]。复用 P10.3 harness，新增独立 Inspector legacy/modern、P6 成功链、四 View/临时查询/分页、双用户与完整九写 standalone。记录条数是验收步骤，不是独立 Node test 数量。Inspector 2.12.0 实际协商 `2025-11-25` / `2026-07-28`；两个协议发现十八工具和读取 Schema，modern 创建 Record/get/replay。Token 仅经子进程环境传递，通用 wrapper 在内存追加 Authorization，未修改官方 CLI；其入口版本/SHA 和九次子进程退出码均记录。
- [无 route mock 的构建 Web/API/Mongo/MCP](../../scripts/verify-p104-web-mcp.mjs)：最终第四轮 **PASS，50 条验收记录，exit0**。[最终摘要](evidence/p10-final-acceptance/web-final/summary.json)、[完整 transcript][WB]。构建 Web/API 独立进程、Chrome 156：正式登录 → MCP 创建 Record/Property/四种 View → 普通 Cell/Title/Date 更新 → 页面刷新读取 → 正式 Record Host 编辑 Title → MCP/P6 同源读回 → 旧 CAS/旧 cursor 拒绝且当前值不变 → MCP rename/刷新 → 宿主页正文与 Database 引用、无 Title 副本/无重复审计。没有 route mock，也没有数据库直写代替 MCP 验收；按既有刷新机制，不承诺外部写入实时自动刷新。
- 浏览器错误全部保留：登录表单 POST201；登录前 `/api/auth/me` 恰好一次401，准确对应其唯一 console 项；登录后两次 `/api/auth/me` 200。该预期认证探测按请求 ledger 分类，其他 console/pageerror 均为0，没有笼统忽略401。

## 7. 历史与本轮失败

P10.3 的 Domain16/HTTP43/MCP50/Client42 是历史证据，未直接计成本轮终态。

1. 首次 P10.4 typecheck exit2：新增 Unicode DTO 注入测试缺少 ServerBlockRecord.createdAt/updatedAt，TS2352。分类为测试夹具缺陷；补合法时间字段后，从 typecheck 开始独立 api-final-r2 重跑，保留原失败日志。
2. backend 临时 runner 初次 URI 插值漏掉 `?directConnection` 分隔符；仅用于前五项不连接 Mongo 的包测试/构建，不作为数据库证据。真实事务 probe 与 API final-r2 均显式使用上文正确私有 URI，原环境错误记录保留。
3. 真实 MCP Client 四次中间 FAIL：临时过滤使用 Title 更新前文字；排序第一页预期写反；Inspector initialize 空输出被强制 JSON parse；随后 tools/list 空输出暴露 wrapper 未设置 argv[1]，官方 CLI isMain 未执行。均为 harness 错误；最后从官方 CLI 源码确认入口、修正 wrapper 后，真正得到两协议的 initialize/tools/list/tools/call JSON。首轮未捕获脚本 SHA，source-revision 如实记 NOT_CAPTURED，未补造；后续各轮原脚本/前后 SHA/原始日志保留。最终第五轮独立 PASS，不拼接中间结果。
4. 真实 Web 两次中间 FAIL：文本 locator 未打开正式 Record Host；未将预期登录前 auth/me401 console 与响应关联分类。第三轮已通过，随后补登录201/登录后auth/me200的 ledger，最终第四轮独立通过。所有失败截图/trace/原日志及中间 PASS 独立保存，没有修改产品或弱化领域断言。
5. 完整 Product 三项失败（原测试/配置未修改）：

   - `product-database.spec.ts:4667` Frozen Table projection：期望 timeline-bar 包含 `Shared notes A`，当前 snapshot 中是 offscreen jump 箭头。固定 10 月 13/15 日与当前日期/窗口相关，尚不能仅据此归因为产品缺陷。
   - `product-database.spec.ts:4930` Frozen property repair：`属性` locator 非 exact，同时命中 `属性`、`日期属性`，发生 strict mode violation。属于测试定位缺陷，范围在既有 Timeline 用例。
   - `product-database.spec.ts:12386` P11.6 arrange：`12413` reload 后 timeline 断言未出现。snapshot 有 Editor 和 Fallback table，trace 只有 Vite debug console，无已捕获的 HTTP >=400；**根因未知**。独立 Database 单命令中此项通过，只记录两种上下文结果，不据此豁免完整 Product 的失败，不认定为已修复或已定位启动根因。
6. 证据入库中间失败：原始辅助脚本EOF空行、原始CRLF和Windows长路径使暂存检查/入库失败。原件内容不改；敏感换行文本以gzip保存、10条长路径缩短并保留映射、证据目录单独禁用Git文本换行转换，未关闭diff/whitespace检查。三个backend主JSON另有明确标记的可读LF副本，原字节仍在gzip。原件SHA、Git index blob及解压SHA再次逐项一致；最终暂存检查通过。这是证据打包修正，不是产品修复或测试豁免。

本轮不恢复 P11.6 历史启动专项，不修改 Timeline renderer/原 Product 测试来取得 P10 绿灯；强制门槛未通过继续 HOLD。独立 spec、定向通过不替代完整 Product。

## 8. 冻结状态、清理与证据

- 最终 [478 文件 SHA 清单](evidence/p10-final-acceptance/final-source-manifest.json) 总 hash：`b634acd6d5cb1b9daa06074919bb6f93ae59b1894f864f6ae48ba5c2f3acb7c0`。API final-r2 各命令前后同一清单 hash `f7652aeecb3f32ccf869be2af1d85b52f965ec1e1060a21fe7f38bdd2367865e`；Web/共享包独立门槛 `8604650a6ee178c06aa6ac049bcca52633411c8b82cfd66b62b137de30df5a43`；正式 Web src/tests/config 215 文件前后0差异。三个 hash 范围不同，逐文件与末态对照，不把它们声称成同一个摘要。
- 最终 Client 脚本前后 SHA：`14162aef4c65ef8506e21b62e676bdb1f47837c71c10d04124ed0afa6ded5a27`；最终 Web 脚本前后 SHA：`54a0e006feb113018115a4945bb7cf80a9355c56d280c136a0509821512abb60`。两者最终均通过 node --check，代码均包含在候选217f627。
- backend 自有 Mongo63687/PID40268 按 OS 出生身份、exe、dbpath、replSet 核对后 admin shutdown；清理前只有本轮 UUID 库和系统库，删除本轮库后仅 admin/config/local，进程及监听已退出。[直接清理记录](evidence/p10-final-acceptance/backend/cleanup.json)。
- Client 最终 Mongo52092（PID12392 replset、PID36332 standalone）；API 初次52107/PID36904，重启52532/PID40740，standalone API54360/PID28120。其完整 OS birth/exit、随机库名及所有中间轮清理见各轮 summary/原始 Mongo/API 日志。九写 standalone 拒绝后八集合快照不变，最终数据库 drop，所有自有服务退出。
- Web 最终 Mongo56863/PID11080、API50062/PID43744、preview56862/PID39708，OS birth/exit 见 Web summary；随机库 `eotion_p104_9f8a9c673bb842b8` 已删除，三个服务均退出。Playwright 管理的7173在三命令后无监听；Visual 确切服务 PID/birth 未单独留存，未声称取得该项元数据。
- 10月26日验收时，原27017为既有 PID4796（出生10:23:39 +08，早于本轮），没有连接、停止或修改。临时原始证据保留，不删除原始失败；DB 数据文件不进入仓库。压缩日志/trace/截图及314个原件的SHA映射见 [artifacts.json](evidence/p10-final-acceptance/artifacts.json)，287个唯一归档目标共17,134,045 bytes；可读派生副本与打包元数据另列，不冒充原始字节。长路径证据通过manifest查询；10月29日再次确认本轮自有端口无监听。[最终完整性校验](evidence/p10-final-acceptance/final-integrity-audit.json) 已对478个源码文件、全部归档与Git暂存blob核对。

## 9. Review、限制与交付

唯一一次最终独立 review 已完成：[结论记录](evidence/p10-final-acceptance/final-review.json)。未发现新的P10范围产品缺陷或证据阻断；权限/真实归属、CAS、session/DTO/receipt、旧P6回执与unknown commit检查支持HOLD。review指出的三处日志链接已修正；后续仅做无损打包与机械SHA校验，没有第二次独立review。当前明确阻断为完整 Product 三项 FAIL 与独立 Database 两项 FAIL；后者两项是前者子集，不计成五个独立缺陷。缺少能安全归于 P10 的产品修复证据，不顺手修改 Timeline/历史启动问题。现有 owner-only、online Database、写入需要 replica set/mongos、无 TTL committed receipt 等限制保持；Inspector 复跑需本机安装入口或 P104_INSPECTOR 指定，不引入仓库依赖。

**最终门槛结论：HOLD，不是 FINAL PASS，不是 P10 COMPLETE。** 仅对候选217f627生效，master未集成；P11.6 HOLD与历史启动故障结论不改，版本仍0.0.1/build2。所有指定命令和真实链路已经完成；未解决项如实保留，任务收口后停止，不自动发布或进入后续阶段。

[M]: evidence/p10-final-acceptance/backend/api-final-r2/mcp/stdout.log.gz
[D]: evidence/p10-final-acceptance/backend/api-final-r2/domain/stdout.log.gz
[H]: evidence/p10-final-acceptance/backend/api-final-r2/http/stdout.log.gz
[PF]: evidence/p10-final-acceptance/backend/api-final-r2/performance/stdout.log.gz
[CL]: evidence/p10-final-acceptance/client-final/transcript.json.gz
[WB]: evidence/p10-final-acceptance/web-final/transcript.json.gz
