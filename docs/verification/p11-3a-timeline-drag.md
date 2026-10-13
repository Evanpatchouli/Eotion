# P11.3A Timeline Drag Mutation Foundation

日期：2026-10-13 启动、2026-10-14 收口（Asia/Shanghai）。**P11.3A 范围验收 PASS**。
基线 `3c73470`；分支 `codex/p11-3a-timeline-drag`，开始时工作树干净。
正式版本保持 `0.0.1`，P11 目标 `0.0.3`。本轮仅 P11.3A，完成后停止，不进入 P11.3B。

## 架构与写入边界

`TimelineBar → useTimelineBarDrag → DatabaseNodeView adapter →
updateProductDatabaseRecordCell → PATCH records/:recordId/cells/:propertyId →
DatabaseService transaction / Database + Record CAS`。

Timeline 只编辑现有 Date Property；没有 Timeline endpoint、collection、独立 records store、
oplog 或 offline queue。pointerdown 保存原值、Record/Database version 和 scope；pointermove
只更新当前 Bar 的 preview；pointerup 对有效非零偏移发出一次 generic cell mutation，无自动重试。
保留 existing mutation serialization、权限/online fence、Mongo snapshot transaction 与通知。

用户确认本轮只允许单 Date Property：string / object date-only point、datetime point、
date/datetime range。未排期和独立 Start/End 两列保持只读。双列区间移动需要 generic atomic
multi-cell 能力，而当前 API 一次只能原子编辑一个 Property，本轮没有扩展此公共契约。

## Coordinate 与日期语义

横移由 `timeToX(start) + deltaX → xToTime → temporal offset → 原 Date wire value` 转换，
未复制七 scale density 或用固定 day width。date-only 按显示时区最近有效日界吸附，再以
Gregorian ordinal 日差平移两端；datetime 保留整数毫秒 instant offset 与 source timezone。

- string 仍为 string，`{start}` 仍缺 end，显式相等 end 仍保留；不伪造 range。
- date-only range 保持日历日 duration；datetime range 保持精确毫秒 duration。
- display-zone DST / skipped day 只影响坐标吸附，source timezone 不被替换。
- year 0000–9999 有效边界受 validator 约束，越界不提交；skipped source day fail closed。
- renderer-only all-day inclusive 右界不写回 stored end。

## Preview、确认与失败

preview geometry/日期提示由 Bar 局部 controller 持有，只计算当前 item；没有每像素 PATCH、
整批 records mutation 或 pointermove 引发的全量 projection。release 后保留 optimistic preview，
成功后用 returned canonical Record 与 generic loaded-window refresh 更新 projection。

409 清除 preview、刷新 canonical Record 并显示冲突反馈；没有覆盖远端值或自动重试。
其他 4xx 清除 preview 并提示；transport/5xx 不确定提交结果走既有 refresh，核对目标值，
恢复当前 canonical 值。refresh 失败保持只读/错误提示；成功 mutation 的响应值仍可确认。
本地取消不能撤销已释放并提交的写操作，本轮没有 Undo 或 request cancel 协议。

普通 click 复用现有 openRecord；实际拖动的合成 click 被抑制。Escape / pointercancel /
lost capture / blur / offline / scope、viewport、Record version 变化取消 active session；epoch 与
DOM/editor fence 拒绝旧 scope / ABA callback。没有通过 key 重建 Host、Drawer、Editor、NodeView。

## 验证记录

Browser 专用 skill 不在本会话，按 frontend-testing-debugging skill 使用仓库 Playwright fallback。
测试流程：正式 Page / Database renderer → pointer drag → local preview → release →
existing generic mutation → canonical Bar/Frozen/Table / reload；console 与截图由 Web 验证记录。

| 检查 | 结果 |
| --- | --- |
| Temporal logic | 7/7 PASS：七 scale、负/零偏移、DST、闰年、year 0000/9999、Apia 跳日、wire shape / duration |
| 真实 API / Mongo | 19/19 PASS，0 fail/skip；API build PASS，隔离 MongoDB 8.0.32 replica set / 27715 |
| 既有 Timeline logic | 28/28 PASS；与新增7项合计35/35，分两批执行 |
| 新 Web drag / 日期 / identity / 性能 | 6/6 PASS，workers=1、retries=0；见下矩阵 |
| 既有 Timeline/Date/CAS Web | 12/12 PASS，含 standalone delayed 四 View ABA、Frozen、100/500 分页与日期编辑 |
| Record Overlay | 38/38 PASS |
| Web/API typecheck、Web/API build | PASS；Web build 内含 vue-tsc；保留既有 >500kB chunk 提示，Editor 690.67kB |
| 独立 reviewer | 0 剩余确定 blocker；原生横滚同帧竞态已修并建立回归 |

| 新 Web 流程 | 实际证据 |
| --- | --- |
| date-only point / range | string / `{start}` / `{start,end}` preview→release 每次仅1 cell PATCH，捕获的双CAS；end仍inclusive stored value，没有视觉exclusive end泄漏 |
| datetime point / range | canonical UTC毫秒/timeZone保留、start/end同量平移、duration不变；独立Start/End合法对象投影保持只读且0mutation |
| preview / optimistic | move时0PATCH、fixture Record原值不变；延迟release响应时saving preview仍在，成功后canonical refresh |
| CAS / rollback | Web mock route gate冻结drag版本后改变服务端fixture版本，浏览器发出旧CAS请求获409；另模拟409远端值、400/500，清除preview回canonical并显示反馈，无重试；真实Mongo CAS见API项 |
| cancel / readonly | no-op0PATCH且普通click能开Record；Escape/pointercancel取消并抑制click；offline不可写；同一JS task修改native scrollLeft后pointerup取消且0PATCH |
| Table / Frozen / reload | Frozen显示确认日期；切Table验证同值、返回Timeline并reload保位置/日期；Desktop与390px preview/commit截图 |
| identity | 1920×1080打开Record再drag；preview和release+refresh后保Page/Editor/NodeView/Drawer/RecordEditor DOM与Vue实例、RecordHost record/pageId、两个Tiptap view；标题和正文文本保留 |
| 100/500 | 按25条分页完整加载4/20页；armed并稳定focus后取样。projection/temporal/rowGeometry/Frozen refs全保持；其他Bar DOM mutations=0、Vue updated hooks=0、组件refs保持，move阶段0PATCH |

identity test允许既有标题blur自动保存，并等待canonical title后开始drag；它不声称文本始终
处于未保存状态，也不改写现有Page自动保存。100/500证据为真实Chrome generic-response seam
的局部更新/虚拟化检查，不是正式帧率benchmark或真实服务端性能测量。

Web命令（在仓库根目录执行）：

```powershell
pnpm --filter @eotion/web exec playwright test tests/timeline-coordinate.spec.ts tests/timeline-projection.spec.ts tests/timeline-layout.spec.ts tests/timeline-frozen-table.spec.ts --workers=1 --retries=0
pnpm --filter @eotion/web exec playwright test tests/timeline-mutation.spec.ts --workers=1 --retries=0
pnpm --filter @eotion/web exec playwright test tests/product-database.spec.ts --grep 'Timeline|timeline|P11.1B formats|409 refreshes the latest record' --grep-invert 'P11.3A' --workers=1 --retries=0
pnpm --filter @eotion/web exec playwright test tests/product-overlay.spec.ts --workers=1 --retries=0
$env:EOTION_VISUAL_QA_DIR = Join-Path $env:TEMP 'eotion-p113a-validation'
pnpm --dir apps/web exec playwright test tests/product-database.spec.ts -g 'P11\.3A' --workers=1 --reporter=line
pnpm --filter @eotion/web build
pnpm --filter @eotion/api typecheck
```

最终focused 6项一次完整运行全部通过；此前fixture定位/selector/等待/断言错误已修正，未削弱
成功、冲突、取消或性能标准。最后500定位恢复page host到顶部并核对rowWindow.first=0、
elementFromPoint命中record，再发真实pointer；不绕过虚拟化或用直接修改UI state伪造拖动。
旧Web/API/typecheck/build与35logic日志在
`C:/Users/evanpatchouli/AppData/Local/Temp/eotion-p113a-web-validation/logs/`；focused输出保留在
本轮Agent工具会话。Overlay期间Vite对未启动7137的auth/me有代理ECONNREFUSED噪声，
38项通过；成功拖动用例核对页面内容、无Vite overlay及应用console/pageerror，期望的网络失败
另行过滤。未运行完整Web Product、native宿主真机或P11 Final，不借局部PASS覆盖P11.2D记录
的全套历史失败。

截图5张已主Agent视检（preview/commit Desktop1440×900、390×844，以及409rollbackDesktop），
原图在`C:/Users/evanpatchouli/AppData/Local/Temp/eotion-p113a-validation/`，副本在
`C:/Users/evanpatchouli/.codex/visualizations/2026/10/13/01a135eb-4e8a-7b42-895d-3f0facd4a3c9/timeline-drag/`。
Bar局部日期提示可见，Frozen在390保Title，页面无横溢；ruler标签密度保既有P11.5 deferred边界。

真实 API 命令：`pnpm --filter @eotion/api exec node --test --test-reporter=tap
dist/modules/server-domain/database.test.js dist/modules/http-api/database-http.test.js`，设置进程内
`P4_TEST_MONGODB_URI` 到本轮独立 `p113aAcceptance`。测试后已停止本轮 Mongo，不使用现有27017。
日志：`C:/Users/evanpatchouli/AppData/Local/Temp/eotion-p113a-mongo/logs/database-http-tests.tap.log`。
新增 HTTP 断言验证五种 wire shape 移动、单次双版本增加、generic GET 持久化及 stale Record CAS
导致 Database bump/records 全部回滚；领域测试覆盖真实 transaction failure/CAS。

## 停止与接续

实现提交：`d2daaa2ff899a7e1b450dcb2b9b0daf89e1bcb26`（Temporal command / 真实 API 回归）与
`bd561e431b55488ad24075f73d1384696b8ced59`（交互接线 / Web 验证）。
正式文档/交接另行聚焦提交，收口commit即包含本页的提交。

不包含 Resize/start/end handle、Dependency shift、Auto scheduling、Multi-select/Bulk mutation、
Undo/redo、Offline queue、Calendar、inline date editor/date picker fallback、Timeline settings UI。
不发布、不修改版本、不进入 P11.3B。独立 Start/End 原子移动作为明确 deferred 边界写入 handoff。
P11.3B 接续入口为 `mutation.ts`、`useTimelineBarDrag.ts`、NodeView adapter 与既有 generic Date
mutation；具体 B 范围仍须独立任务确认，不能自动按完整 P11 Mutation 目标推进。
