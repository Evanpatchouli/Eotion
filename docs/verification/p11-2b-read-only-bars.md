# P11.2B Read-only Timeline Bars

状态：**P11.2B 范围验收 PASS**（2026-10-13；完整相关回归仍有下列既有失败）。
基线 `03138bc`，分支 `codex/p11-2b-read-only-bars`，开始时工作树干净。
正式版本保持 `0.0.1`；P11 目标版本 `0.0.3`。本轮完成后停止，不进入 P11.2C。

## 数据流与组件边界

真实 generic records 继续由 `DatabaseNodeView` 加载、分页与刷新，服务端 filter/sort/cursor
和 P9 identity fence 保持。数据只经 `projection.ts` → `geometry.ts` / `layout.ts` →
`TimelineBar.vue`；子组件不读取 raw DatabasePropertyValue，不请求记录、不写日期。

projection 保留 recordId/pageId/title/rowIndex、显示属性、日期标签及
unscheduled/point/range 判别联合。Title 来自 generic response 中唯一 Title Property 的
Page.title 投影；显示属性沿用 View 顶层 visibleProperties/propertyOrder 与既有 formatter。

单 Date source 使用共享 normalizer 的 start/end。独立 Start/End source 只取两个
normalized start，忽略各字段自身 end。缺 end 为 point，显式相等 end 仍为 range。
未配置、缺 start、非法值、混合 kind 和逆序均保留为未排期，不交换端点、不补日期。

## 时间几何与布局接口

`resolveTimelineTemporalGeometry(items, displayTimeZone)` 只在投影或显示时区变动时解析
时间边界；date-only 复用 P11.2A 日界 resolver，datetime 保持 UTC instant。
all-day 显式 end 的次日日初仅作独立视觉右界；raw end 与零 duration 语义保持。
skipped-day 诊断与最大合法日期的内部 exclusive 边界由同一坐标 helper 处理。

`timelineRowWindow({ count, visibleTop, visibleBottom, focusedRowIndex })` 生成行窗口；
`layoutTimelineItems(items, temporalMap, viewportTransform(state), rowWindow)` 只布局该窗口
及单独焦点行，返回含 item/rowIndex/top/height/geometry 的行数组。
固定行高 48px，bar 高 32px；x/width 来自同一个 `timeToX` / `viewportTransform`。
geometry 保留 rawX/rawWidth 与可视裁剪标记；point/零宽 range 用独立 marker 和命中区域，
不伪造 end 或真实日期跨度。

`useTimelineViewport` 继续独占 scroll/resize/observer/RAF/timer。200 条起采用现有 page
scroll host 的行窗口与上下各五行 overscan，焦点行单独保留。总高由 spacer 保持，实际
Grid/Today/rows 绘制限制在窗口。native horizontal scroller、origin、scale 共用。

## 可观察行为与 Record identity

range 显示截断标题、属性与完整日期 tooltip；point 显示 milestone marker，hover/focus/
selected 使用现有 tokens。点击仍经父层 openRecordPage 与 singleton Record Host，
selection 来自已有 Host pageId，不建立 Timeline 专属 Drawer 或编辑路径。

未排期保留在主 canvas 原行，显示标题、原因和打开入口，没有时间 geometry；footer
提供仅标题/ID 的未排期索引，经同一 controller 定位原行、等待 DOM 更新、聚焦并打开。
scope/epoch/DOM guard 拒绝过期导航；details 按 scope 重建关闭，旧节点 toggle 不可回写
新实例的展开状态。generic 顺序、分页和计数保持。

## 验证结果

所有 Playwright 检查使用 Windows x64 / Chrome、workers=1、retries=0；没有 skip 或削弱断言。

| 检查 | 本轮实际结果 |
| --- | --- |
| Date source projection | **3/3 PASS**；legacy、range、datetime、显式零长、独立 source 忽略合法内部 end、非法完整值/混合/逆序/空值、Title 与顺序 |
| temporal geometry / layout | **5/5 PASS**；DST 23h、Apia skipped day/原 end 诊断、9999 exclusive 边界、point/零宽 range、裁剪、焦点 island 与 rebase |
| 既有 coordinate 回归 | **14/14 PASS**；七 scale、日界/年界、gap/fold/半小时变化、tick budget、viewport center/rebase/原生取整 |
| 新增 Web 定向 | **3/3 PASS**；真实 generic response 接线、隐藏 source 字段、milestone/range/UTC datetime 坐标、未排期原因和顺序、完整 tooltip、Host selection、无 Record PATCH、100/500 完整分页与窗口、未排期原行 focus/open、details scope 切换 |
| 既有 Timeline / lifecycle 定向 | **8/8 PASS**；Shell、zoom 零网络、导航/scroll、四 View standalone/inline Editor/NodeView/Drawer 草稿与 ABA、390px |
| 完整相关 suite | **183 项：179 PASS / 4 FAIL**；Database 113/116、Editor 44/45、coordinate 14/14、layout 5/5、projection 3/3。所有 Timeline/standalone/identity 相关 9 项均 PASS；失败见下表 |
| 失败用例独立复跑 | **2 PASS / 2 FAIL**；每项只复跑一次，没有自动重试 |
| Web typecheck / 最终 build | **PASS**；vue-tsc、Vite、SW generation；已有大 chunk 提示仍存在，最大 671.81kB |
| 独立 review / diff / 编码 | **0 个剩余确定产品 blocker**；补齐索引 reveal/焦点与 native details scope/toggle，最终 diff、strict UTF-8 无 BOM/CRLF、范围检查通过 |

完整命令：

```powershell
pnpm --filter @eotion/web exec playwright test tests/timeline-coordinate.spec.ts tests/timeline-projection.spec.ts tests/timeline-layout.spec.ts tests/product-database.spec.ts tests/product-editor.spec.ts --workers=1 --retries=0 --output=test-results/p112b-full-final
pnpm --filter @eotion/web typecheck
pnpm --filter @eotion/web build
```

| 完整运行失败 | 本轮独立复跑 | 已保存历史证据 |
| --- | --- | --- |
| database command separates back from cancel… | PASS；完整运行数据库 dialog 未出现 | P11.2A 完整运行有同类时序失败，独立复跑 PASS |
| slash creates a database table and preserves the reference ID after reload | FAIL；数据库 dialog 未出现 | P11.2A 在未改动 `7b93617` 基线同样 FAIL |
| linking a shared database adds only a reference and new records create pages | PASS；完整运行数据库 dialog 未出现 | P11.2A 完整运行有同类失败，独立复跑 PASS |
| selection bubble hides on collapse, blur, Escape and IME… | FAIL；选区 toolbar 未出现 | P11.2A 在未改动 `7b93617` 基线同样 FAIL |

历史基线证据见 [P11.2A 验证](p11-2a-timeline-shell.md)，不是本轮另建 baseline 的结果。
本轮保留全部失败，未修改这些既有流程；完整 suite 的两项时序原因仍未定性，不声明
完整 Product 全绿。P11.2B Scope PASS 依据本轮纯逻辑、Web/identity、构建与独立复核。

日志目录：`C:/Users/31250/AppData/Local/Temp/eotion-p112b-validation-2cb1500948374b7992879f2db76c68f0/`，
保存 `playwright.stdout.log` / `playwright.json`、`failure-recheck.stdout.log` /
`failure-recheck.json` 与 `web-build.log`。错误上下文在 Web `test-results/p112b-full-final/`
和 `test-results/p112b-failure-recheck/`。

四张最终 1440×900 / 390×844、Light/Dark 截图来自完整运行，主 Agent 已视检：
`apps/web/test-results/p112b-full-final/product-database-Timeline--e09b4-e-selected-record-read-only/`。
里程碑、范围、未排期原行与 Today 贯穿显示正常；页面没有横向 overflow。
截图与性能 JSON 副本保留于
`C:/Users/31250/.codex/visualizations/2026/10/13/01a1343c-863d-7130-8bdb-469850cfebf5/timeline-bars/`。

## 性能观察

环境：Node 24.21.0、ICU 78.3、tzdata 2026c、Windows x64 / Chrome、1440×900。
数据通过既有 generic records HTTP seam 的可重复 mock response 加载，不是 UI hardcoded records。

| 完整运行样本 | 100 records | 500 records |
| --- | ---: | ---: |
| 25 条分页 GET 次数 | 4 | 20 |
| 实际已加载 records | 100 | 500 |
| temporal geometry 数 | 100 | 499（1 条未排期） |
| 样本 DOM 行数 | 100 | 17 |
| 样本行窗口 | `[0,100)` | `[483,500)` |
| 总 spacer 高度 | 4800px | 24000px |
| projection 与 temporal map 身份在 scroll/zoom 后不变 | true | true |
| `elapsedSincePagingStartedMs` | 538ms | 3849ms |

计时包含 Playwright 驱动分页及后续 UI 操作，不是单次 projection 或 scroll computation。
JSON 保存 4/20 次 mock 请求 timing；resource sample 数组为空，不代表真实服务端成本。
500 条还检查：base window 返回顶部后，远处的 focused row 单独保留且 DOM 总行数≤40；
未排期索引可定位末行并打开既有 Host，关闭后原行仍可见；无第二垂直 scroller。
geometry 按窗口集中计算，Bar 不监听 scroll、不 normalize Date，不形成 rows×ticks 矩阵。

样本文件为完整运行各用例目录内的 `timeline-100-browser-samples.json` /
`timeline-500-browser-samples.json`，副本与截图同目录保存。
100/500 条是本轮观察范围，不据此宣称 5000 条、原生宿主或 60Hz/4ms benchmark 通过。

## 提交与停止边界

- 纯逻辑：`47d675ccbb34734fce5dc3215efafd4487ba47d0`。
- Bar/viewport/Host 接线与 Web 回归：`71e72f90676424d3fc359afefbb493d1e22cba65`。
- 正式验收/检索/current-task/handoff：包含本页最终收口的文档 commit。

未实现 Frozen Table、dependency line、drag、resize、Date mutation、Record edit shortcut、
auto shift、Calendar interaction 或 Timeline configuration UI。没有新实体/API/schema/
MCP/sync/dependency/version；`linkInPage` 的 Table-only 规则保持。
完全离屏的 scheduled item 保留原行和 offscreen geometry，本轮不实现方向 indicator/jump；
它们属于后续完整 read / P11 parity，不能据本轮范围结果宣称完整 P11.2 或 P11 FINAL PASS。

P11.2C 接续入口是 `timeline/` 的 projection、temporal geometry、layout、Bar 与单一
viewport controller；开始下一轮前须读取本页、renderer architecture 和 handoff，并明确
P11.2C 授权范围。不得自动进入后续阶段，也不得把本轮范围 PASS 写为 P11 FINAL PASS。

本轮未运行真实 Mongo/API/MCP、完整 Product 全量、Desktop/Mobile 原生真机或 P11 Final；
没有公共 API、Date wire shape、共享 View config、同步协议或数据持久模型变更。
