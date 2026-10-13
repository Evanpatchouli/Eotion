# P11.2A Timeline Shell + Coordinate Engine

状态：**P11.2A 范围验收 PASS**（2026-10-13；完整相关回归仍含以下既有/不稳定失败）。
基线 `7b93617`，工作分支 `codex/p11-2a-timeline-shell`。
版本保持 `0.0.1`；P11 目标版本 `0.0.3`。本阶段结束后停止，不进入 P11.2B。

## 实现与状态边界

`DatabaseNodeView.vue` 明确分支 Table / List / Board / Timeline，Timeline 进入真实
`DatabaseTimelineView.vue`。不再显示旧占位，也没有 Table fallback。
父层继续持有 confirmed View、records、cursor、loading、分页、Record 打开与 P9 identity fence。
Timeline 子层仅接收本实例 scope、config 和父层已有的 title/pageId 入口，无新记录读取路径。

六个 Vue 组件为 `DatabaseTimelineView`、`TimelineHeader`、`TimelineViewport`、
`TimelineRuler`、`TimelineGrid`、`TimelineTodayLine`。纯函数与浏览器 adapter 位于
`apps/web/src/components/editor/timeline/`。

`configuredScale` 来自已有 `options.timeline.scale`，默认 month；selector 只更新
本实例 `localScaleOverride`。本地缩放不 PATCH、不重新 GET records，也不持久化像素。
confirmed scale 值实际变化时清 override 并保留 center；同值刷新保留 zoom 和位置。

## 坐标与刻度接口

- `coordinates.ts`：`timeToX` / `xToTime` 是 content X 的可逆变换；
  `timeToScreenX` / `screenXToTime` 处理同一 transform 的 scroll offset。
  datetime 输入绝对 instant；`calendarBoundary(date, displayTimeZone)` 将 date-only 映射到
  当地首个有效 instant，并对整日跳过返回 `calendarDaySkipped`。`timelineInstantBounds`
  统一合法 UTC instant 与显示时区 date-only 端点的范围，10000 仅作内部 exclusive 上界。
- `zonedFields` / `resolveWallTimeCandidates` / `floorCalendar` / `addCalendar` 使用
  Intl parts、IANA offset 段与有界搜索；午夜 fold 取最早值，gap 取首个有效边界。
  Gregorian year 0–99 使用 `setUTCFullYear`，不使用 `Date.UTC` 的旧式年份偏移。
- `scale.ts` 集中定义七种密度、major/minor 单位、navigation 与后续 snap。
  px/hour 为 48、16、4、8/3、1.5、0.5、1/12；双周主线仍按周，导航移动两周。
- `ruler.ts` 按完整有限 tick bucket 生成 major/minor；真实日历周期与 DST fold/gap
  共用坐标，稳定 key 与数组位置/label 无关。Intl formatter 使用 locale 和 Gregorian；
  week start 使用 Intl.Locale 能力及冻结 fallback。组件预算 80 ticks，实际绘制有界。

## Viewport 与 Today

`viewport.ts` 提供 create/update/derive/center/step/rebase、`viewportTransform` 与 `alignViewportScroll`。
画布宽度为 `clamp(16W, 16384, 262144)`，实际 DOM 只绘制窗口及 overscan。
唯一水平容器使用 `overflow-x: auto`，原生 scrollbar 可操作；自然高度和现有 page scroll host
承担纵向滚动。ruler 在水平 scroller 外，以同一 snapshot 画 screen X。

`useTimelineViewport.ts` 独占 scroll/page-scroll、resize、observer、RAF 和 timer。
rebase 在同一帧更新 origin、generation 和 native scroll，保留屏幕坐标；resize/zoom/navigation
复用纯函数。原生滚动提交等待 Vue DOM 更新与实际 canvas 宽度，epoch/目标节点/serial/generation
共同拒绝过期提交；像素取整由纯函数修正 origin，保留语义中心。普通 scroll 在同一 tick bucket
只移动 screen 坐标。page pin 以现有 `.document-wrap` 的统一几何坐标限于当前 Timeline 区域。
scope 与连接 epoch 拒绝旧 callback，卸载取消 observer/listener/RAF/timer。

Today 是 grid 后的独立红色 layer，不参与布局或 scroll。它取当前显示时区的当地日初，
在下一日界、分钟 heartbeat、focus/pageshow/visibility 恢复时重查；Today 按钮将该日界置中。

## Standalone 生命周期前置 B1

已冻结的最小修复位于 `DatabasePageView.vue`：同库 route View change 保留已有 document，
loading 不销毁 Editor 子树，Editor key 仅含 workspace/database。确认 View 后原地切换
唯一 synthetic Database node 的 viewId；请求继续受 epoch、workspace/database/requested View fence 保护。

`EotionEditor.switchDatabaseView` 仅允许受保护的单 Database 文档切换 viewId；filterTransaction
同时验证其他 attrs、content、marks 与结构不变。普通插入/删除仍被拒绝，Record Host 与草稿归属不变。

## 验证结果

所有 Playwright 验证使用 Chrome、workers=1、retries=0，没有 skip、自动重试或削弱断言。

| 验证 | 结果 |
| --- | --- |
| 纯函数定向与完整运行内的数学测试 | **14/14 PASS**；七种 scale、inverse、DST gap/fold、半小时变化、整日跳过、0/99/9999 年、月末、tick budget/bucket、zone 端点、rebase/resize/原生像素取整 |
| Timeline / standalone 定向 Web | **5/5 PASS**；真实 renderer、空库与 title/open、七 scale/零网络 zoom、双实例独立、Today/Prev/Next、native scroll/rebase、resize、locale、跨日/focus/visibility、卸载恢复事件、390px 与 Light/Dark、protected document 与 B1 delayed ABA/draft |
| 既有 P9 ABA / snapshot 定向 | **3/3 PASS**；Editor/NodeView 身份、Drawer 标题/正文和设置草稿 |
| 完整相关 suite | **172 项：167 PASS / 5 FAIL**；Database 110/113、Editor 43/45、坐标 14/14；失败对照见下文 |
| 最终 Web build | **PASS**；vue-tsc、Vite 与 SW generation，已有大 chunk 提示 659.30 kB > 500 kB |
| 独立 review 与最终补丁复核 | **0 个剩余确定 blocker**；修复 reconnect 保留状态、空库 fixture、年界、initial DOM commit 与 cache/bucket 接线 |
| diff / 编码 / 范围 | git diff --check、strict UTF-8 无 BOM，通过；无 packages/API/schema/MCP/版本改动 |

完整相关命令：

```powershell
pnpm --filter @eotion/web exec playwright test tests/timeline-coordinate.spec.ts tests/product-database.spec.ts tests/product-editor.spec.ts --workers=1 --retries=0 --output=test-results/p112a-full-final
pnpm --filter @eotion/web build
```

完整运行的 Timeline Shell、Table/List/Board 切换、standalone、P9 identity、Date data path 与
数学用例全部通过。五个完整运行失败仅处于此前已有的流程：

| 失败用例 | 当前代码独立复跑 | 未改动基线 `7b93617` 独立复跑 |
| --- | --- | --- |
| database command separates back from cancel… | PASS | PASS |
| slash creates a database table and preserves the reference ID after reload | FAIL：数据库 dialog 未出现 | **同样 FAIL** |
| linking a shared database adds only a reference and new records create pages | PASS | PASS |
| keeps local editor content when sync fails and retries sync | PASS | PASS |
| selection bubble hides on collapse, blur, Escape and IME… | FAIL：选区格式 toolbar 未出现 | **同样 FAIL** |

五项对照均为 3 PASS / 2 FAIL，0 retries。基线使用独立 managed worktree 与端口 7273，
原始源码和原始测试；复用当前未改变的依赖，不写任何产品文件。对照后已归档 worktree。
两项可在基线复现，不是本轮引入；另三项完整运行失败在当前代码复跑通过，其完整 suite
时序原因尚未定性。没有顺手修改这五项流程或断言，也不声称完整 Product 全绿。

日志与保留的基线错误上下文位于
`C:/Users/31250/AppData/Local/Temp/eotion-p112a-full-final-640611811d8546368decd60033346a59/`：
`playwright.log`、`web-build.log`、`failures-recheck.log`、`baseline-failures-comparison.log`、
`baseline-slash-error-context.md`、`baseline-bubble-error-context.md`。初步失败定位在 Slash helper
的 caret/空行条件及 selection bubble 恢复时序；此为后续调查线索，不当作已证明根因。

四张最终截图来自完整运行，主 Agent 已检视 1440×900 Desktop 与 390×844 Phone，Light/Dark：
`apps/web/test-results/p112a-full-final/product-database-Timeline--12b4e-s-and-has-no-table-fallback/`。
另已复制到当前 Codex visualization 的 `timeline-shell/` 目录保存。
测试证明页面无横向 overflow，Timeline 自己拥有原生横向滚动；原生 scrollbar 外观遵循操作系统策略。

本轮未运行真实 Mongo/API/MCP、完整 Product、原生宿主真机、5000 bars 性能或 P11 Final Acceptance；
这些不属于 Shell 实施范围。tick/cache/scroll 的结构预算已落实，未宣称 60Hz/4ms benchmark 已通过。

## 停止点与 P11.2B 入口

本轮未实现 Record/dateSource projection、bar/range/milestone、Frozen Table、dependency、
drag/resize、Date mutation 或专用 records loading；没有 MCP/schema/API/sync/version/dependency 变更。
通用 title/open 索引只引用已加载记录，不识别 scheduled / unscheduled，不伪造数据。

P11.2B 从 `timeline/` 的既有 transform、tick window、viewport 和 Today layer 接入后续
`projection.ts` / `layout.ts` 与 read-bars；按架构冻结的 generic 顺序、日期解析入口和
P9 fence推进。Frozen Table、dependency 与 mutation 保持后续阶段边界。
