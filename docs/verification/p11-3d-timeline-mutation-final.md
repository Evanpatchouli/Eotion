# P11.3D Timeline Mutation Final Acceptance

日期：2026-10-16（Asia/Shanghai）。**Final verdict：PASS；P11.3 Timeline Mutation — COMPLETE。**

基线 `548f9eb3540377bb903b491fae34ac2cdaa01c0a`，开始时 master 工作树干净。
分支 `codex/p11-3d-final-acceptance`。版本保持 `0.0.1`，P11 目标版本 `0.0.3`。
本轮只做 P11.3 最终验收、范围内 blocker 修复、测试和文档；完成后停止，P11.4 未开始。

| 阶段 | 最终状态 |
| --- | --- |
| P11.3A Drag Foundation | PASS |
| P11.3B Resize Range Mutation | PASS |
| P11.3C Mutation UX + Conflict / Review Fix | PASS，保留 `3b1e061` / `548f9eb` 修复语义 |
| P11.3D Final Acceptance | PASS，范围内 0 剩余 blocker |

本轮只有验收测试和文档，没有产品实现、API/schema、MCP、sync、依赖或版本改动。
完整 Product 有一个经真实基线复现的无关 About 失败，见 §6；**不宣称完整 Product 全绿**。

## 1. 架构与冻结边界

唯一生产写入路径：

`TimelineBar / Handle → useTimelineBarDrag shared interaction ledger → temporal mutation command
→ DatabaseTimelineView.commitTimelineDrag → DatabaseNodeView.moveTimelineRecord
→ updateProductDatabaseRecordCell → existing Record Cell PATCH
→ DatabaseService.updateRecordCell → Database + Record CAS / Mongo snapshot transaction
→ generic canonical loaded-window refresh`。

源码核查：`timeline/mutation.ts`、`snap.ts`、`interaction.ts`、`focus.ts`、
`useTimelineBarDrag.ts`、`TimelineBar.vue`、两个 View adapter、`productDatabases.ts`、
`database.controller.ts` 和 `database.service.ts`。没有 Timeline 专属 backend mutation API、
持久实体、collection、第二套 Date queue 或 pointermove PATCH。generic database-wide
serialization 保留；Timeline 的 busy fence 在调用前 acquire、finally 无条件 release。

**P11.3 当前不允许用户在 Database mutation pending 时切换 View。**
`viewBusy` 包含 `savingCell`，真实 View switcher disabled / fail closed；完成后恢复。
这属于当前正式产品行为，不是 blocker，不放宽 generic busy guard。

Separate Start/End mutation remains intentionally read-only because the generic Record API does not
yet provide atomic multi-cell mutation. 该 source 可读、可打开 Record，无 move/resize affordance，
不以 sequential PATCH 伪造原子性；此边界不阻止 P11.3 COMPLETE。

不包含 Dependency / auto shift、bulk / multi-select、Undo / Redo、offline mutation queue、
新的 backend/schema、Calendar/Gallery/Chart、MCP 扩展、Page/Block sync 重构或 P11.5 polish。

## 2. 验证口径

Web 使用仓库 Playwright / Chrome，URL `http://127.0.0.1:7173`；Browser plugin 的配套
`browser` skill 未在会话列出（Browser plugin not available），按 frontend-testing-debugging
使用既有 Playwright。Web fixture mock 只证明浏览器集成行为，真实 API/CAS/持久化另由隔离
Mongo 回归证明。logic token 测试不称为真实 UI A→B→A；100/500 更新观察不称 FPS benchmark。
原始失败与独立复跑分开记录，不把历史结果冒充本轮运行结果。

## 3. 最终矩阵与运行证据

下表为复用测试的验收索引；本轮实际运行结论另见运行统计，不以历史 PASS 代替本轮证据。
Web 用例均位于 `apps/web/tests/product-database.spec.ts`。

| # | 场景 | 证据入口与验收要求 |
| --- | --- | --- |
| 1 | date-only point drag | `P11.3A Timeline date-property drag`：legacy string / object shape，release 一次 PATCH，reload |
| 2 | datetime point drag | `P11.3A Timeline datetime drag`：UTC instant、timeZone、毫秒保留 |
| 3 | date-only range drag | A date-property：两端同量日历日偏移、inclusive stored end |
| 4 | datetime range drag | A datetime：精确 elapsed duration、source timezone 保持 |
| 5 | range start resize | `P11.3B date-only resize` + `P11.3B datetime resize`：只改 start |
| 6 | range end resize | 同上：只改 end，visual exclusive boundary 不泄漏到持久值 |
| 7 | point → range | B date-only / datetime：真实 resize 后一次完整 Cell PATCH 才产生 end |
| 8 | explicit zero-duration / crossing | B point promotion、datetime 与 logic mutation：保显式 end，相等 clamp，不交换角色 |
| 9 | ordinary click | `P11.3C Timeline no-op round trips`：0 PATCH + 打开 Record |
| 10 | sub-threshold | 同一用例明确 2px < 4px：0 PATCH + 按 click 打开 |
| 11 | meaningful round-trip | 同一用例 point/range：0 PATCH、0 Record open、canonical value/version 不变 |
| 12 | resize no-op | 同一用例 + B date-only：0 PATCH；handle 永不打开 Record |
| 13 | Escape | `P11.3C Escape and pointercancel`：preview 清空/idle/0 PATCH；pending 不撤销服务端请求 |
| 14 | pointercancel | C cancel + `P11.3A Timeline rolls back`：capture cleanup、idle、canonical 不变 |
| 15 | lostpointercapture | C cancel：真实 release capture，后续 synthetic click 被抑制 |
| 16 | pending visual | `P11.3C pending mutation`：saving/aria-busy、handle 卸载、非全屏 loading |
| 17 | same Record busy | C pending：同 record/property 阻断；预占 busy key 的 adapter 集成证明 acquire/release |
| 18 | 409 | A failure：冻结版本后服务端 Record version 变化；一次 PATCH、canonical refresh、无 retry；另有真实 API 双 CAS |
| 19 | known 4xx | A/B failure 的 400 分支：一次请求、rollback、preview/pending 清空；500 不归此类 |
| 20 | unknown committed | `P11.3C conflict and network failures`：服务端 fixture commit 后丢响应，refresh 接受 target，0 retry |
| 21 | unknown uncommitted | 同一用例 abort-without-commit：回 canonical，明确未确认，不重复 PATCH |
| 22 | unknown + refresh failure | C `unknown refresh failure` 两个参数：旧 records 不确认，staleReadonly；重试仅 GET、PATCH 总数不变 |
| 23 | offline before preview | `P11.3C offline fails closed`：可读/可开 Record、不能开始 mutation、0 PATCH |
| 24 | offline during preview | 同上：offline 事件清 preview、0 PATCH；pending 网络错误按 unknown 核对 |
| 25 | Drawer draft identity | A drag identity / B resize identity / C fence：Host/Drawer/Editor/NodeView、两个 Tiptap view 与文本保持 |
| 26 | Table canonical consistency | A date-property 与 B date-only：point/range/promoted point 的 Table、返回 Timeline 与 reload |
| 27 | Start/End read-only | A datetime / B date-only：正常 bar/open；无 move/resize 写入，无 sequential PATCH |
| 28 | 390px no overflow | B date-only Light/Dark、preview，以及 C pending/fence；document.scrollWidth ≤ clientWidth |

Handle 的 Enter/Space/modifier-click 永不 open Record；bar body 的 Enter/Space 仍可 open，
由 C no-op 与专门 focus 回归覆盖。焦点恢复仅限原 anchor 下同 record，用户已转移到另一个 bar、
Drawer、Frozen row 或 Table 时不抢焦点。

## 4. Temporal / scale 强制门禁

`timeline-mutation.spec.ts` 的 15 项覆盖 point/range、wire shape、端点 clamp、显式 equal end、
时间精度/时区、闰日/年界、Apia skipped day、New York DST 23/25 小时与 midnight gap。
`timeline-coordinate/projection/layout/frozen-table/interaction.spec.ts` 另验证统一坐标、
inclusive visual geometry、行窗口、ledger ownership、token/busy fence 和共享 4px threshold。

| Scale | resize snap 来源 | date-only 精度 |
| --- | --- | --- |
| hour | shared `futureSnapUnit` 15 minute | 至少 1 calendar day |
| day | 1 hour | 至少 1 calendar day |
| week | 1 day | 1 calendar day |
| biweek | 1 day | 1 calendar day |
| month | 1 day | 1 calendar day |
| quarter | 1 day | 1 calendar day |
| year | 1 month | 1 calendar month |

Drag 的 datetime 使用 shared transform 的精确毫秒偏移；date-only 使用显示时区日界吸附。
Resize 消费 `getTimelineScale(scale).futureSnapUnit`，共用 `timeToX/xToTime` 与 calendar engine；
没有七套 renderer 私有日期数学。Logic 对七档运行，Web datetime resize 亦遍历七档。

All-day 例如 `2026-10-10 → 2026-10-15`：geometry 右界为 16 日日初，覆盖 10–15 六天；
右移一日界存 `end=2026-10-16`，而非写 17 日。现有非 UTC regression 使用
`America/New_York` 的 `2024-03-09 → 2024-03-10`，右端从 11 日日初移到 12 日日初，
persisted end 为 11 日。日界逆转换按 Gregorian calendar，不按固定 24h 倒推，避免 DST ±1 day。

## 5. Identity / ABA 与取消层级

生产 guard 包含 user/workspace/database/view/block scope、NodeView `viewIdentityEpoch`、
原 DOM root / connected / data-view-id / viewReady、Editor 文档中的 block viewId、
record/property/type、双版本与原 raw value；controller 再以 interaction token fence completion。
viewport 原生 scroll/zoom/generation/width 亦会取消过时 preview。

Preview → View identity change 由 C fence 在浏览器中切换 scope、卸载 bar，断言 0 PATCH。
Pending → View switch 被真实 disabled 控件阻断，不把 logic token 用例说成用户成功切换 View。
Pending unmount / A→B→A 已通过本轮增强的 C fence：hold Cell response 后，先断言 View
switcher disabled，再以 Page route A→Record Page B→原 Page A 使旧 NodeView/bar 卸载并
重建。`performance.timeOrigin` 与 window sentinel 保持，证明是同 document SPA lifecycle，
没有用整页 reload 丢弃旧 Promise。旧 bar disconnected，新 bar 在旧响应返回前后均保持同一
connected DOM、idle、无 saving/preview；最终 Table/Timeline canonical 为服务器日期，总共一次
PATCH。后续拖动仍可写，证明 fence 释放。这里证明的是 **route unmount / remount ABA**，
不是 pending 时通过被禁用的 View switcher 进行 View ABA；后者仍由 fail closed、adapter
epoch/root guards、ledger token 与既有 P9 delayed View 配置回归共同保护。

Escape/pointercancel/lost capture/window blur/visibility hidden 都只取消 active preview。
Unmount 失效 callback，pending Escape 不应伪装 Undo 已发出的服务端写入。
本轮新增 blur/hidden 直接事件回归，其中 hidden 用测试 seam 设置 visibilityState，
不声称操作系统真实后台标签页已验证。

本轮额外补入 `P11.3D Escape/offline during pending` 两个参数化 Web 用例，**2/2 PASS**：

- Escape：等真实 browser 请求进入 hold gate / pending / PATCH=1，再按 Escape 清 UI；
  release 后 server fixture canonical 仍由 13 日变为 14 日，没有假装 Undo；下一次拖至 15 日，
  总 PATCH=2，证明正常 completion 后忙锁释放。
- Offline：请求 pending 后切真实 browser context offline、派发 offline 事件，bar 不可拖；
  恢复 online 后再通过 mock transport seam 构造 commit 后丢响应、canonical reads 失败，
  验证未确认 + 只读。重试只增加一个 GET、PATCH 仍为 1；恢复后下一次拖动可写。
  此用例不声称浏览器离线期间真实服务器已提交；它分别验证真实 offline 事件和 mock unknown
  生命周期。真实事务提交由独立 Mongo 回归证明。

## 6. 本轮运行统计、环境、失败与未执行项

以下均为本轮实际运行，0 skip；Product 两个原始批次覆盖 `test:product` 的全部 14 个文件。
额外新增 D pending 两项亦单独通过；最终 402 个独立 Product 用例合计 401 PASS / 1 基线 FAIL，
该统计按分批与增补合并，不声称最后文件快照做过一次全量 402 项单命令运行。

| 检查 | 本轮结果 |
| --- | --- |
| Domain 完整 tests | **48/48 PASS** |
| Contracts 完整 tests | **25/25 PASS** |
| SDK 完整 tests | **23/23 PASS** |
| API server-domain / Database 全套 | **16/16 PASS** |
| API Database performance（5k / 10k） | **1/1 PASS** |
| API HTTP 全套（含 Database HTTP） | **31/31 PASS** |
| MCP 完整 regression | **30/30 PASS**，含真实 bearer / HTTP |
| Domain / Contracts / SDK / API typecheck | **PASS** |
| API build | **PASS** |
| Timeline logic 六个 specs | **52/52 PASS** |
| 完整 `product-database.spec.ts` | **143/143 PASS**，workers=1 / retries=0 |
| 其余完整 Product（13 files） | **256 PASS / 1 FAIL**，257 项，workers=1 / retries=0；同一失败在 `548f9eb` 真实复现 |
| 全部 Product 原始批次合计 | **399 PASS / 1 FAIL**，400 项；不宣称全绿 |
| Web typecheck / production build | **PASS**；保留既有 >500 kB chunk 提示 |
| 新增强 100/500 preview 观察 | **4/4 PASS** |
| point→range Table / reload 增强 | **1/1 PASS** |
| 最终文件增补定向（realm / hidden / pending / conflict） | **4/4 PASS** |
| 新增 D pending Escape / offline 参数化 | **2/2 PASS** |

Database 全套启动后补入 realm sentinel、Reflect.deleteProperty 清理与 pending/error 截图；
其最终文件差异由上述定向 4/4 验证，不把 143/143 称为最后每一字节快照的全量重跑。
全部产品可执行代码和 API 均未修改。

真实 Mongo：缓存 portable binary `mongod-x64-win32-8.0.12.exe`，MongoDB **8.0.12**，
`mongodb://127.0.0.1:55776/?replicaSet=p113d_6a2f770f`。独立 TEMP dbpath、随机测试库，
hello PRIMARY 与真实 transaction probe 通过；各 helper 删除自己的随机测试库。
只在验证进程设置 `P4_TEST_MONGODB_URI`，不修改 `.env`，不连接 27017 或用户数据库。
所有脚本 exit 0；Date object / CAS / transaction rollback / persistence / reload 走真实服务。

测试结束执行 admin shutdown，PID 40208 不存在，55776 无监听；27017 检查亦无监听。
临时 URI 环境变量恢复为不存在。自动审批策略拒绝删除独立 TEMP dbpath 的递归删除操作，
未绕过或反复尝试；实例已关闭，数据目录和日志仍保留，不属于运行中的服务。
工具理由只有 `Rejected(... blocked by policy)`，没有更具体说明。

API 日志目录：`C:/Users/evanpatchouli/AppData/Local/Temp/eotion-p113d-api-regression-20261016-002807/`。
Mongo 日志：`C:/Users/evanpatchouli/AppData/Local/Temp/eotion-p113d-mongo-817736f2e83a42f297dd7ca98a8a0f1c/logs/mongod.log`。
运行命令（API 各脚本在上述隔离 URI 环境中执行）：

```powershell
pnpm --filter @eotion/domain test
pnpm --filter @eotion/contracts test
pnpm --filter @eotion/sdk test
pnpm --filter @eotion/api build
pnpm --filter @eotion/api test:domain
pnpm --filter @eotion/api test:database:performance
pnpm --filter @eotion/api test:http
pnpm --filter @eotion/api test:mcp
```

Domain / Contracts / SDK / API 分别运行 `typecheck`。早期脚本参数封装错误导致命令失败，
已修正执行方式后完整通过；原始失败和成功日志分别保留，不计为产品缺陷。

实际 API 脚本覆盖：

- `test:domain`：server-domain 与 database tests。
- `test:http`：http-api、database-http、sync-http、file-http 四个文件。
- `test:mcp`：mcp、mcp-read.contract、mcp-write.contract、mcp-write 四个文件。
- `test:database:performance`：额外的真实 Mongo 5k/10k 回归。

Date 真实服务门禁复用 `database.test.ts` 的 `P11.1B Date values round-trip through
createRecord, derived reads, CAS rollback, and type conversion`，包括 stale Record CAS 与
repository CAS 失败后 Database fence / raw Date rollback；`database-http.test.ts` 的
`P11.1B HTTP Record create, cell patch, and GET preserve all Date wire shapes` 覆盖真实
PATCH 后 GET 的 Date range 持久化与 wire shape。不新增后端测试 helper 或功能。

Web 核心命令：

```powershell
pnpm --filter @eotion/web exec playwright test tests/timeline-coordinate.spec.ts tests/timeline-projection.spec.ts tests/timeline-layout.spec.ts tests/timeline-mutation.spec.ts tests/timeline-interaction.spec.ts tests/timeline-frozen-table.spec.ts --workers=1 --retries=0
pnpm --filter @eotion/web exec playwright test tests/product-database.spec.ts --workers=1 --retries=0
pnpm --filter @eotion/web exec playwright test tests/product-database.spec.ts --grep 'P11.3C Escape|P11.3C pending mutation|P11.3C conflict and network|P11.3C view switch' --workers=1 --retries=0
```

日志放系统 TEMP，主要文件：`eotion-p113d-logic-run1.log`、
`eotion-p113d-product-database-run1.log`、`eotion-p113d-perf-attempt1.log`、
`eotion-p113d-point-range-attempt1.log`、`eotion-p113d-final-deltas-run1.log`。
Pending 两项最终日志：`eotion-p113d-pending-interrupt-attempt4.log`；测试编写期间 attempt2
文案预期错误（fixture refresh 已成功）和 attempt3 alert strict selector 错误均保留原始日志及
对应 `*-error-context.md`，修正测试设置/locator 后通过，无产品实现修改。

其余 Product 原始失败：`product-settings.spec.ts` 的 `settings navigation ends with 软件说明
and /settings/about shows build info plus release notes`，发布日期期望 `2026-10-11`，实际
`暂无记录`。该项定向复跑仍失败；隔离 `548f9eb` 基线最终亦运行到同一发布日期断言并
**1/1 FAIL**，expected `2026-10-11` / received `暂无记录`。受测 releaseInfo/About/buildInfo 与
该 spec 相对基线无 diff；属于既有稳定契约失败，**不是已证明的 flaky，也不是本轮 Timeline 回归**。
本轮没有修改无关 About / release metadata，实现/测试修复留后续独立任务。
完整原始 Product 日志保留；共享 Playwright test-results 曾被并行定向清理，单项复现改用
独立 TEMP `--output` 保存 artifacts。基线第一轮因 Vite optimizer cache `deps_temp_* ENOENT`
未到业务断言，不计作有效基线结果。原因是 worktree 的 node_modules junction 共用缓存，
两次试验的 cacheDir 误配置在 Playwright 层，Vite 没有收到。最终仅在 TEMP 基线 worktree 的
Vite config 注入绝对独立 cacheDir，运行到同一业务失败；没有修改基线产品逻辑。
7173 / 7174 的临时 Vite 服务均已关闭，端口无监听。

其余 Product / About 原始、复跑和基线日志目录：
`C:/Users/evanpatchouli/AppData/Local/Temp/eotion-p11-3d-web-acceptance-20261016-003321-058/`。
关键文件为 `product-suite-excluding-database.raw.log`、
`product-settings-about-single-rerun.raw.log`、`product-settings-about-artifact-rerun.raw.log`、
`product-settings-about-baseline-vite-cache-fixed.raw.log`、`web-typecheck.raw.log`、`web-build.raw.log`。
有效基线 failure context 位于该目录的 `settings-about-baseline-artifacts-vite-cache-fixed/`。

开发过程中的首轮 hidden 测试错误地模拟 `document.hidden=true`，实现实际读
`visibilityState==='hidden'`，因此预期 idle / 实际 previewing。修正测试 seam 后通过，未改
产品实现。该首轮 focused 磁盘日志被同名复跑覆盖，是证据保留疏漏；原始失败输出仍在会话工具
记录，不伪造缺失日志。后续全部运行以唯一名称保存；不将此测试编写错误称作产品 flaky。

未运行 native Electron/Lynx 真机、正式 FPS benchmark、独立 screenshot baseline diff、
Web 浏览器连真实 API 的全链端到端、P11 Final 或发布流程；本轮 Web 为真实 Chrome + mock
HTTP seam，API/Mongo 独立真实运行。Dependency 与其他明确延期项没有实现。

## 7. 100 / 500 条更新观察

既有 A/B performance 用例按 25 条分页加载，armed / focus 稳定后才启动 observer。
本轮增强同一 harness，记录 active bar、其他 bars、ruler ticks 和 Frozen rows；没有复制性能 helper。

| 样本 / 操作 | Active bar DOM mutations | Active Vue updated | Other bars DOM / Vue | Ruler + Frozen mutations |
| --- | --- | --- | --- | --- |
| 100 drag | 9 | 4 | 0 / 0 | 0 |
| 500 drag | 9 | 4 | 0 / 0 | 0 |
| 100 resize | 12 | 4 | 0 / 0 | 0 |
| 500 resize | 12 | 4 | 0 / 0 | 0 |

四项定向 **4/4 PASS**（`eotion-p113d-perf-attempt1.log`）。projection、temporal map、
row geometry、Frozen display map 的 reference 稳定；其他 bar 组件身份、ruler tick 节点及
Frozen row 节点身份保持。move 阶段 0 PATCH，Escape 后 canonical 不变。
这些是本次固定交互取样的更新次数，不是性能阈值、FPS benchmark 或真实服务端负载测试；
completion 允许既有 generic canonical refresh。

## 8. Responsive / visual smoke

主 Agent 已视检本轮五张 PNG：1440×900 Desktop Light/Dark、390×844 Light/Dark、390px
resize preview Light。内容非空、无 framework error overlay；handle/focus/preview 位于 Timeline
容器内，Today 红线与行/日期几何未见回归；测试直接断言 document 无横向溢出。
正常 resize 用例收集并断言 console error / pageerror 为空。原生 title tooltip 与日期 preview
继续由同一 bar 值生成；不进入 label density 或 P11.5 polish。

截图位于 `C:/Users/evanpatchouli/AppData/Local/Temp/eotion-p113d-visual/`：

- `p113b-date-endpoints-desktop-light.png`
- `p113b-date-endpoints-desktop-dark.png`
- `p113b-date-endpoints-phone-light.png`
- `p113b-date-endpoints-phone-dark.png`
- `p113b-date-resize-preview-phone-390-light.png`
- `p113d-pending-desktop-light.png`（保存中；主 Agent 已视检）
- `p113d-conflict-desktop-light.png`（低打扰冲突文案；主 Agent 已视检）

这是 Chrome Web 响应式 smoke，不代替 Electron / Lynx 真机验收或正式 screenshot baseline 比对。

## 9. 独立 review、最终 gate 与提交

独立 reviewer 先复核已有生产 mutation 完整调用链与相关测试，随后只对新增验收 diff 做
补充核查（含最终 pending 两项），**0 个可证明的 P1/P2 blocker**。重点已覆盖 duplicate PATCH、
data corruption、busy leak、stale response / ABA、focus/synthetic click、normalized no-op、
unknown false confirmation 与 Start/End accidental write。reviewer 未重跑测试，运行证据由
执行 Agent 与主 Agent 汇总；没有用 review 代替实际测试。

最终 §3 的 28 项矩阵均 PASS；Drag、Resize、precision/timezone、inclusive end、no-op、cancel、
busy/serialization、CAS conflict、unknown、offline、identity、Record Host/Drawer、Table canonical
与 Start/End read-only 的当前范围门禁通过。标题 blur 允许既有 autosave；只证明标题/正文文本
与 Host/Editor/NodeView 身份保持，不声称文本始终未保存。Date mutation 本身只写目标 Date cell，
不引入无关 Page/Block snapshot rebuild。

本轮无产品 blocker 修复，因此提交只包含测试和文档：

- `783d053ea884fbcf4749aad9641bf8613a62505f`：取消、Table/reload、route ABA 与100/500验收补强。
- `781d860f6d780d3ca78c9a4b512ab1476d479b0b`：pending Escape / offline 补验。
- 文档收口提交：包含本节的提交；最终 HEAD 由交付报告给出，避免文档自引用 SHA。

最终 diff / strict UTF-8 无 BOM 检查通过；版本文件未修改，工作树在文档提交后应干净。

## 10. 停止与接续

**P11.3 Timeline Mutation — COMPLETE，完成后停止。P11.4 未开始。**
该结论不等于整个 P11 Timeline COMPLETE、Dependency COMPLETE、完整 Product 全绿或
`0.0.3` 可发布。后续 P11.4 精确入口为 `docs/p11-timeline.md` 的 `P11.4 Frozen Table +
Dependencies`；先读取现有 `TimelineViewOptions.dependency` / self Relation 配置及 generic
Record mutation 边界，独立明确 Dependency 的需求、invariant 与验收后才能启动。
现有 Frozen Table 只是既有能力；不据本轮验收自动推进 dependency / auto shift / multi-cell。

About 发布记录的独立既有缺陷写入 handoff，本轮不修；native、正式 benchmark、P11 Final
和发布流程均未运行。Mongo dbpath 的删除受工具策略拒绝，临时实例已停止，保留 TEMP 证据。
