# 当前任务：P11.2.0 Timeline Renderer Architecture Design（PASS，已完成并停止）

基线：25bd279585772bfdce43799de71fb3c3f5ba5436（P11.1D PASS），master，开始时工作树干净。
本轮聚焦提交为包含本文件的 commit。正式版本仍 0.0.1，P11 目标 0.0.3。
只交付 architecture / 文档，没有实现 renderer，也没有进入 P11.2A。

| Work Unit | 模式 / 难度 / 角色 | 目标 | 状态 |
| --- | --- | --- | --- |
| R0-1 | investigate / S0 scout | Date / View config / generic records / P11.1A–D Evidence Pack | 完成 |
| R0-2 | investigate / S0 scout | routing / P9 identity / opening / CSS scroll Evidence Pack | 完成，确认 standalone B1 |
| R0-3 | decide / S2 主 Agent | projection / coordinate / scale / viewport / rows / state / 接续边界 | 完成；调查后文档执行降至 S1 |
| R0-4 | execute / S1 fast_worker | 按 Brief 写正式架构和 P11 摘要，仅文档 | 完成；主 Agent 按 review 修正接线细节 |
| R0-5 | verify/review / S0 scout + reviewer | 文档范围/链接/编码、设计验算、独立 review | 完成，62 checks PASS，0 确定文档 blocker |
| R0-6 | execute / S1 主 Agent | metadata、最终 diff、聚焦 commit 与报告 | 完成，提交后停止 |

## 冻结结果

完整 17 项决策、源码证据和拟实施接口：docs/architecture/timeline-renderer.md。
产品标准摘要与视觉 end 规则：docs/p11-timeline.md §9.2 / P11.2 Renderer Architecture。
流程：generic records -> projection -> coordinates/layout -> read-only renderer。
线性 logical UTC instant -> pixel；date-only 通过 display-zone 日初边界，datetime 保留 UTC instant。
七尺度、有界 native canvas/rebase、统一 row 高度、page-host virtualization、独立 Frozen projection。
all-day inclusive 只生成 visualEndExclusive；原 end / 显式零 duration 不变，point 不补 end。
configuredScale 仍共享保存；本实例 effectiveScale 临时 override，A selector 0 PATCH / 0 records GET。
未排期保持主 row 和服务端顺序，完整 read-bars 提供 footer 导航索引，不二次分页/重排行。

## 验证与已知 gate

六份 Markdown 范围、链接、UTF-8 strict/无 BOM/CRLF、git diff --check 通过；独立 reviewer 0 blocker。
临时给定 instant / 数学不变量脚本 62 checks PASS（Node24.21.0 / ICU78.3 / tz2026c）。
日志：C:/Users/31250/AppData/Local/Temp/eotion-p1120-604cc99c231949ad915b085346732f75/coordinate-design-check.log。
仅验证七密度的 inverse/rebase/center 和给定 DST 样例；未实现/验证 calendarBoundary、renderer、
browser scroll/page pin/ABA、benchmark，未跑产品/typecheck/build/Mongo/E2E/Visual/真机/P11 Final。

B1：DatabasePageView 同库 View switch 因 loading subtree + viewId Editor key 会重建 Editor/NodeView。
只记录最小修复建议；standalone lifecycle 完整验收前另单元修复。原 inline P9 fence 继续复用。
Frozen 独立 Relation 列需后续联合可见列预取/缓存/epoch；A 不做。linkInPage 仍 Table-only。

## 精确接续（未开始）

新明确任务下执行 P11.2A Timeline Shell + Coordinate Engine，详见架构 §16。
拟接入 DatabaseNodeView，占位替换为 editor/DatabaseTimelineView.vue；timeline/ 内 Header/Viewport/
Ruler/Grid/Today、types/coordinates/scale/ruler/viewport/useTimelineViewport 与定向验收。
A 只 shell/grid/ruler/scale/local zoom/viewport/native bottom scrollbar/today/Prev-Today-Next。
通用所有 loaded records title/open 入口，不提前 Date source projection 或 unscheduled 分类。
不实现 bar/Frozen Table/Record mutation/dependency/创建按钮；不改 schema/API/MCP/sync/version/dependencies。
P11.2.0 Architecture PASS 不等于 P11.2 Read Renderer PASS。本轮结束，不自动进入 A。
