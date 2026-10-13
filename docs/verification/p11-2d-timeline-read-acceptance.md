# P11.2D Timeline Read Renderer Final Acceptance

日期：2026-10-13。状态：**P11.2D 核心 Read Acceptance PASS**；相关 Web 套件仍有下列三项基线失败。
基线 `916de4a37cea108497d6d76fa4fe8c24ac1961e7`，开始时 master 工作树干净，包含 P11.2C 的
`0ed6d0f` / `2dfc8b7` 实现及 `916de4a` 验收文档。工作分支 `codex/p11-2d-read-acceptance`。
正式版本保持 `0.0.1`，P11 目标版本为 `0.0.3`；本轮不发布、不进入 P11.3。

## 验收范围与真实链路

本轮按用户明确的核心只读范围验收，完成：✅ Timeline shell、✅ Coordinate engine、✅ 七种 Scale、
✅ Ruler、✅ Grid、✅ Today line、✅ Read-only bars、✅ Frozen Table。
不包含：❌ Mutation、❌ Drag、❌ Resize、❌ Dependency、❌ Calendar、❌ Chart。
完全离屏 scheduled 的方向 indicator/jump 仍为既有未实现 parity；本轮没有
增加该能力，也不据核心 Read Acceptance 宣称全部 Notion parity 或 P11 Final 完成。

| 层 | 实际接线与归属 |
| --- | --- |
| DatabaseView Config / generic records | `DatabaseNodeView.vue` 继续持有 confirmed config、records、cursor、loading、request epoch / P9 fence；Timeline 不建新 loader |
| Timeline Projection | `timeline/projection.ts` 的 `projectTimelineRecords` 委托共享 Date normalizer，保原 generic 顺序、recordId/pageId、Title 和 point/range/unscheduled |
| Temporal / Row Layout | `geometry.ts` 解析显示时区日界或精确 instant；`layout.ts` 由同一 transform 生成唯一 row geometry/window |
| Frozen Table | `frozenTable.ts` 独立列投影；`FrozenTablePane.vue` 与右侧消费同一 rows、48px height、56px header/pinY |
| Timeline Viewport | `useTimelineViewport.ts` 独占横向滚动、page-host 测量、RAF/observer/timer，有限 canvas/rebase 与 production 80 tick 预算 |
| Timeline Bars | `TimelineBar.vue` 只消费 geometry/display/title/Host state，不解析 raw Date、不请求 records、不监听 scroll |
| Today Line | `TimelineTodayLine.vue` 消费同一 transform 的 display-zone 当地日初 X，独立红线且 `pointer-events:none` |

原始读取与引用契约仍见 [P11 Timeline](../p11-timeline.md) 和
[Renderer Architecture](../architecture/timeline-renderer.md)；A/B/C 历史范围证据分别见
[Shell](p11-2a-timeline-shell.md)、[Bars](p11-2b-read-only-bars.md)、[Frozen](p11-2c-frozen-table.md)。
历史 PASS 不替代本轮真实验证。

## Scale Matrix

新增 `P11.2D Timeline acceptance` 集成用例使用测试内固定密度表，直接校验真实 DOM，
不以生产 `pxPerMs()` 作为期望。ruler 为 `(instant-origin)*density-scrollLeft`，grid / Today / bar
为同一 content X；range 的 raw width 与可视裁剪分别断言，point 不补 end。
定向样本环境为 Chrome `153.0.8010.53`、1440×1000、固定 UTC 显示时区与日期 `2026-10-13`。

| Scale | Major / Minor | px/hour | 原始 ticks（major+minor） | 最终结果 |
| --- | --- | ---: | ---: | --- |
| hour | day / hour | 48 | 25 | PASS |
| day | day / 6-hour | 16 | 17 | PASS |
| week | week / day | 4 | 16 | PASS |
| biweek | week / day | 8/3 | 20 | PASS |
| month | month / day | 1.5 | 31 | PASS |
| quarter | quarter / week | 0.5 | 16 | PASS |
| year | year / month | 1/12 | 20 | PASS |

七次切换均保留中心 instant，样本偏差为 **0ms**；generic records GET 为 **1→1**，View PATCH、
Record PATCH、所有 PATCH 均为 **0→0**。projection、temporal map、Frozen map 与 Timeline
component 身份保持。普通 scroll、边缘 rebase 与 Today 回置后再次校验真实 DOM；离开
overscan 的 Today 和离屏 bar 明确断言 absence，回置后断言实际 DOM 存在，不靠空值绕过检查。
生产 tick 合计始终≤80，grid 不建立 rows×ticks 矩阵。

## Record 类型矩阵

以下场景由现有 generic-response Web 用例、projection/layout/coordinate logic 与新增集成用例
互补验证；Web fixture 经过既有 HTTP seam、父层 loader 和真实 renderer，不在 UI 写死 rows。

| 类型 | 已验证行为 | 结果 |
| --- | --- | --- |
| Date-only `2026-10-13` | milestone，start 映射显示时区日界，geometry 真宽为0、独立 marker/hit；projection end 保持 null | PASS |
| Datetime | canonical UTC instant 精确定位；保留 `America/New_York` source zone，tooltip 显示 UTC 时间和 source zone；不以日期零点替代 | PASS |
| Date Range | 单 Date 的 start/end 与分离 Start/End 各取 normalized start；visual inclusive end 只在 coordinate geometry 中生成，不改原 end；width 不由标题决定 | PASS |
| Datetime Range | 精确 UTC start/end 和实际 duration；12:00→15:45、00:15/01:45 等非日界样例保持时间精度；不加一日、不退化 date-only | PASS |
| Unscheduled | 保原 recordId/pageId/rowIndex、No-date 原行提示和导航索引；不生成时间 geometry/bar；索引能定位原行、focus并打开既有 Host | PASS |
| Invalid Date | 完整 raw normalizer fail closed；非法值、混合 precision、逆序保 unscheduled reason，不污染坐标，不补默认日期 | PASS |

日界数学还覆盖 DST 23/25小时、午夜 gap/fold、半小时变化、Apia skipped day 与年份端点；
显式零长 range 保 range kind，date-only inclusive 只作视觉规则，datetime零宽显示 marker。
非法日期与跨字段坏值通过 mock GET 注入以验证 renderer 防御，不代表真实 Create/PATCH
接受非法输入；Domain/Contracts/API 继续使用原严格 validator，已有 wire shape 未改。

## View Switching / Frozen / Scroll / Responsive

| 验收点 | 实际证据与结果 |
| --- | --- |
| 指定 `Table→Timeline→Board→Timeline` | 已加入原 standalone delayed ABA，用当前组件对象逐步核对 Editor、NodeView/Block DOM、Block ID、Drawer、Record Host 和嵌入 Record Editor 身份，标题/正文 draft 保持；定向及最终完整运行 PASS |
| 主 Page Editor draft / inline identity | 既有四 View inline/ABA、snapshot 与相关 Editor 回归在 fresh baseline/最终运行 PASS；Record Host 不属于 renderer child，不重建独立 Host |
| Frozen row 对齐 | 两侧共用同一 rows 引用、recordId、rowIndex、48px row/top/height、window/focus island；DOM rect和56px header/pinY 对齐 PASS |
| Hover / Selection | Frozen→bar、bar→Frozen 双向 hover PASS；selection 由既有 Host pageId 派生，点击两侧都复用原 Record opening；无 Timeline selection store |
| Horizontal | TimelineViewport 是唯一横向 owner；native scroller可滚动/rebase；Frozen rect不随横移，页面无横向 overflow，PASS |
| Vertical | 既有 `.document-wrap` 是唯一纵向 owner，Timeline/Frozen 无独立纵向 scrollbar，page pin和500虚拟窗口 PASS |
| Desktop | 1440px 同时显示 opt-in Frozen Table + Timeline，Light/Dark视检 PASS |
| 390px | Title 保留、隐藏非Title、Timeline自行横滚，页面无overflow；records/renderer identity不因宽度改变，Light/Dark断言与视检 PASS |
| Empty / 全未排期 | fresh 新截图已视检：空库保真实 ruler/grid/Today和暂无记录；全未排期保原行标题/原因/打开/索引且无日期bar，PASS |

Responsive 证据来自共用 Web UI 的 Chrome viewport；本轮不宣称 Electron/Lynx 原生宿主真机
或全部辅助技术合规验收。底部原生 scrollbar 的外观服从操作系统策略，滚动行为已直接断言。

## 基础回归

环境：Windows x64 / PowerShell 7，Node `24.21.0`、ICU `78.3`、tzdata `2026c`。
Domain / Contracts / SDK 各执行 test、typecheck、build；API 和 Web 执行 typecheck/build。

| 检查 | 实际结果 |
| --- | --- |
| Domain | 48/48 PASS，0 fail / 0 skip；typecheck/build PASS |
| Contracts | 25/25 PASS，0 fail / 0 skip；typecheck/build PASS |
| SDK | 23/23 PASS，0 fail / 0 skip；typecheck/build PASS |
| 真实 Mongo API | 22/22 PASS，0 fail / 0 skip；API typecheck/build PASS |
| Web typecheck/build | PASS；Vite / Service Worker generation 完成；既有 EotionEditor chunk 677.89kB（gzip 208.50kB）提示保持 |

真实 Mongo 使用独立 MongoDB `8.2.3` replica set `p112dAcceptance`、端口 `27714`，不连接
现有 `27017`。测试后该临时实例已停止。执行四个编译后测试文件：

```powershell
pnpm --filter @eotion/api exec node --test dist/modules/server-domain/server-domain.test.js dist/modules/server-domain/database.test.js dist/modules/http-api/http-api.test.js dist/modules/http-api/database-http.test.js
```

完整日志保留于 `C:/Users/31250/AppData/Local/Temp/eotion-p112d-mongo-acceptance/logs/`。
这覆盖真实 Date round-trip、generic records、Timeline config/lifecycle、事务/CAS 等相关服务端回归；
不把 Web mock 样本作为真实 API 性能证据。

## 未改动基线对照

在任何产品/测试修改前运行 HEAD `916de4a` 的原始源码与原始测试，只有任务计划文档被更新。
Windows Chrome，workers=1、retries=0，没有 skip、自动重试或断言弱化。

```powershell
pnpm --filter @eotion/web exec playwright test tests/timeline-coordinate.spec.ts tests/timeline-projection.spec.ts tests/timeline-layout.spec.ts tests/timeline-frozen-table.spec.ts tests/product-database.spec.ts tests/product-editor.spec.ts tests/product-overlay.spec.ts --workers=1 --retries=0 --reporter=line,json --output=test-results/p112d-baseline
```

基线 **230 项：226 PASS / 4 FAIL / 0 skip / 0 flaky**，418,551ms。
Database 116/119、Editor 44/45、Record Overlay 38/38、Timeline logic 28/28。
所有既有 Timeline、Frozen、100/500、standalone/identity 用例通过。
四项失败单独复跑一次为 **3 PASS / 1 FAIL**，19.5 秒：

| 用例 | 基线完整 | 基线独立 | 最终完整 | 最终独立 | 具体失败与限制 |
| --- | --- | --- | --- | --- | --- |
| database view selector creates a Board view through the existing DatabaseView API | FAIL | PASS | PASS | — | 创建前刚填入的 Record 标题 draft 回到原值，尚未发生 View 创建/切换；时序根因未定性 |
| slash creates a database table and preserves the reference ID after reload | FAIL | PASS | FAIL | PASS | 数据库 dialog 未出现；独立通过不抹除完整运行失败；历史 A/B/C 也曾失败 |
| linking a shared database adds only a reference and new records create pages | FAIL | PASS | FAIL | PASS | 数据库 dialog 未出现；完整运行时序未定性 |
| selection bubble hides on collapse, blur, Escape and IME; stays in viewport in light and dark | FAIL | FAIL | FAIL | FAIL | 第二次恢复选区时格式 toolbar 未出现；历史 A/B 的 `7b93617` 对照亦有同名失败 |

本轮 fresh baseline 日志与 JSON：
`C:/Users/31250/AppData/Local/Temp/eotion-p112d-baseline-916de4a/` 的
`playwright.log/json`、`failures-recheck.log/json`。错误上下文在
`apps/web/test-results/p112d-baseline/` 与 `p112d-baseline-recheck/`。
不把复跑通过等同完整 suite 全绿，也不隐藏失败。

## 最终相关 Web 回归

与基线相同七个文件，仍为 workers=1 / retries=0，输出改为 `test-results/p112d-final`：

```powershell
pnpm --filter @eotion/web exec playwright test tests/timeline-coordinate.spec.ts tests/timeline-projection.spec.ts tests/timeline-layout.spec.ts tests/timeline-frozen-table.spec.ts tests/product-database.spec.ts tests/product-editor.spec.ts tests/product-overlay.spec.ts --workers=1 --retries=0 --reporter=line,json --output=test-results/p112d-final
pnpm --filter @eotion/web typecheck
```

| 最终检查 | 实际结果 |
| --- | --- |
| 相关 Playwright 合计 | **231项：228 PASS / 3 FAIL / 0 skip / 0 flaky**，389,511ms |
| Database product | 118/120 PASS；2 FAIL 为上表 Slash/dialog 流程 |
| Editor product | 44/45 PASS；1 FAIL 为上表 selection toolbar |
| Record Overlay | 38/38 PASS |
| Timeline pure logic | 28/28 PASS：14 coordinate + 3 projection + 5 layout + 6 Frozen |
| 新集成 / 指定 standalone identity | 定向2/2、最终完整运行2/2 PASS；100/500定向2/2及最终完整运行2/2 PASS |
| 最终3失败各独立复跑一次 | 2 PASS / 1 FAIL，15.3秒；Toolbar保持失败，两个Dialog通过；不是自动重试 |
| 最终 Web typecheck | PASS；build由同一未修改产品源码执行，结果见基础回归 |

最终三项失败完全是 fresh baseline 四项失败的子集，本轮没有修改其实现或断言，也没有
新增 Timeline 产品失败。所有 Timeline shell、bars、Frozen、统一坐标、navigation/rebase、
identity/draft 与100/500检查通过。仍明确保留全部失败，不宣称完整 Product suite 全绿。
本轮只跑上述相关 Web 文件，没有运行全量 `test:product`、原生真机、全量 P11 Final或新MCP验收。

最终日志在 `C:/Users/31250/AppData/Local/Temp/eotion-p112d-final/`：
`playwright.log/json`、`failures-recheck.log/json`、`web-typecheck-final.log`。
最终错误上下文在 `apps/web/test-results/p112d-final/` 与 `p112d-final-recheck/`。
测试准备期间的定向日志为 `C:/Users/31250/AppData/Local/Temp/eotion-p112d-targeted-summary.log`；
正式统计以最终完整运行为准，不累计重复复跑数量。

## 浏览器观察与后续视觉项

最终 fresh run 的 1440×900 / 390×844、Light/Dark 截图已由主 Agent 视检：Today 红线位置、
milestone/range、ruler/grid、Frozen 左右行对齐正常；390px 保留 Title、页面无横向 overflow。
原生横向 scrollbar 归 Timeline，纵向由 `.document-wrap` page host 承担。

P11.5 可继续优化月刻度标签密度、窄 Frozen 多列截断、短 bar/marker 的可读性、触摸反馈与
loading/empty/error/offline 的视觉一致性。本轮不追求 Notion 像素级复刻，不修改既有视觉体系。

## 100 / 500 records 性能观察

以下为最终 fresh run 的浏览器样本，使用25条一页的 mock generic HTTP seam，
1440×900 / Chrome；没有最终 benchmark 要求，不据此推断真实 API 延迟或原生宿主帧率。

| 指标 | 100 records | 500 records |
| --- | ---: | ---: |
| 已加载 records / temporal entries | 100 / 100 | 500 / 499（1未排期） |
| Frozen / Timeline DOM rows | 100 / 100 | 17 / 17 |
| display map entries | 100 | 500 |
| row window | `[0,100)` | `[483,500)` |
| window / total height | 4,800 / 4,800px | 816 / 24,000px |
| raw / ruler ticks | 21 / 10 | 21 / 10 |
| projection / temporal / Frozen refs保持 | true | true |
| shared rows / index与rect对齐 | true | true |
| generic GET分页 | 4 | 20 |
| Relation POST累计batches | 14 | 132 |
| 含分页与UI操作的累计耗时 | 1,733ms | 4,113ms |

100条按架构全量渲染，`virtualizationExpected=false`；旧指标 `domRowsWithinBound=false`
只表示未满足500条用的≤40门槛，不是100条失败。500条启用单page-host虚拟化，DOM≤40，
focus island不挂载中间所有行。scroll/scale均不全量重做Date projection，Bar无独立scroll listener，
生产tick预算≤80且本样本21；没有tick无限生成或rows×ticks矩阵。

耗时包含Playwright分页、UI操作与Relation解析，不是单帧或单次projection时间。
Relation批次数为整个分页与操作累计，原强制标题刷新、每轮500 IDs/10 batches/每批50/
最多3并行预算仍沿用；窗口缺失缓存补取不等于所有请求都减少。资源采样为空，
`resolvedRelationTitleCount=null`，因此不报告真实网络成本或标题缓存总量。未测试5,000条或60Hz/4ms目标。

## 截图与样本存档

最终六张截图（Desktop/390px Light/Dark、空库、全未排期）及三个样本JSON已保留于：

`C:/Users/31250/.codex/visualizations/2026/10/13/01a134d6-cd35-72e2-b646-f87384ed627b/timeline-read-acceptance/`

文件为 `p112c-frozen-projection-{desktop,phone}-{light,dark}.png`、
`p112d-timeline-empty.png`、`p112d-timeline-all-unscheduled.png`、
`p112d-timeline-scale-dom-cache-samples.json`、`timeline-{100,500}-browser-samples.json`。
主Agent查看真实截图后才接受，复制后SHA256一致；原件仍在 `apps/web/test-results/p112d-final/`。

## 提交、复核与停止点

测试提交：`ba1f6008f45f1679b4ab1d9e357629c86e0d0cc0`。验收、P11状态、检索入口和任务/交接
文档单独提交；收口 commit 即包含本页的文档提交。本轮没有产品实现、API/model/sync/MCP、
版本或依赖 diff，没有修复无关历史失败。

同一轮最终独立review完成，**0 个可证明 blocker**；范围、测试独立性、身份断言、统计与
基线失败对照已复核。root完成真实截图、样本、diff、Markdown链接与strict UTF-8无BOM检查。
本轮完成后停止；P11.3尚未开始，不自动继续。
下一轮经明确启动后从 [P11.3 Mutation](../p11-timeline.md#p113-timeline-mutation)、
[Renderer Architecture](../architecture/timeline-renderer.md)、`DatabaseTimelineView.vue`、
`timeline/projection.ts` / `geometry.ts` / `layout.ts` / `TimelineBar.vue` 与既有 generic Date service/SDK/CAS
接续。必须保留Date-only/UTC instant、缺end/显式零长、视觉inclusive不写回、Host identity与P9 fence；
本轮不为后续mutation作产品实现。
