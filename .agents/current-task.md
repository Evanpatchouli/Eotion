# 当前任务：P11.2B Read-only Timeline Bars（范围验收 PASS，完成并停止）

基线03138bc（P11.2A完成后的最新HEAD），开始时master工作树干净。
分支codex/p11-2b-read-only-bars。正式版本保持0.0.1；P11目标0.0.3。
只完成P11.2B严格范围，不进入P11.2C。正式证据docs/verification/p11-2b-read-only-bars.md。

| Work Unit | 模式 / 难度 / 角色 | 目标 | 状态 |
| --- | --- | --- | --- |
| B1 | investigate / S0 scout | Date/generic records/Host与测试Evidence Pack | 完成 |
| B2 | decide / S2 主Agent | 冻结设计内纯接口/窗口/接线Brief | 完成，执行降为S1 |
| B3 | execute / S1 fast_worker | projection/geometry/layout与纯逻辑回归 | 完成，22/22 PASS，47d675c |
| B4 | execute / S1 fast_worker | Bar/未排期/单viewport virtualization/Host接线 | 完成，含review要求的reveal与details保护，71e72f9 |
| B5 | execute / S1 fast_worker | Web/100/500/identity/390px/截图 | 完成，新3/3与既有定向8/8 PASS |
| B6 | verify/review / S0 scout + reviewer | 最小充分验证、完整相关suite、独立review | 完成，179/183，失败复跑2/4 PASS；0剩余产品blocker |
| B7 | execute / S1 主Agent | 验收/索引/handoff与逻辑单元提交 | 完成，正式文档为本文件所在commit |

## 实施结果

- generic records→projectTimelineRecords→resolveTimelineTemporalGeometry/layoutTimelineItems→TimelineBar。
- normalizer验证完整raw，单Date用start/end，独立Start/End各取normalized start；不补end或修改Record。
- 投影保recordId/pageId/Title/rowIndex/display；point/range/unscheduled保原顺序，invalid/缺start/混合/逆序不丢行。
- date-only显示时区日界/inclusive视觉end复用引擎，datetime精确instant；薄nextCalendarBoundary支持原date次日与内部year10000。
- 48px row/32px bar，统一content X/raw/cropped width/clip/offscreen；零宽marker12px，desktop/touch hit24/44px。
- 200条起现有page host虚拟化，上下5行overscan与按recordID的focus island；scroll/zoom不重projection/temporalMap。
- Grid/Today按窗口绘制，未排期原row透明背景保Today贯穿；footer索引reveal/focus后走已有Record Host。
- epoch/scope/DOM拒绝stale/ABA导航，details按scope重建并拒绝旧节点toggle。selection来自原Host pageId。
- 父generic loader/cursor/P9 fence与Editor/NodeView/Drawer draft保持，没有第二scroll container/renderer-specific loader。

## 验证与限制

- 纯逻辑22/22（coordinate14、projection3、layout5）、新Web3/3、既有Timeline/identity定向8/8通过。
- 完整相关183项179PASS/4FAIL，Database113/116、Editor44/45、coordinate14/14、layout5/5、projection3/3；0skip/retries。
- 完整运行Timeline/standalone/identity9项PASS，四ViewABA/草稿/Date source/100/500/390px通过。
- 4项失败仅既有Slash dialog/selection bubble，独立复跑2PASS/2FAIL；两个稳定失败有P11.2A未改基线同样失败的历史证据，
  本轮未新建baseline，其余两项完整运行时序尚未定性。不声明完整Product全绿。
- 最终Web typecheck/build/SW PASS，已有671.81kB chunk提示；独立review0剩余确定产品blocker；diff/UTF8无BOM/CRLF/范围通过。
- 主Agent视检1440/390 Light/Dark四图，里程碑/范围/未排期/Today与页面overflow检查通过。
- 100/500全部按25条分页（4/20GET）加载，DOM样本100/17行；500总高24000px、窗口[483,500)、1未排期。
  projection/temporal对象身份保持；538/3849ms为mock分页与后续UI累计观察，不是正式帧率/真实服务端benchmark。
- 日志C:/Users/31250/AppData/Local/Temp/eotion-p112b-validation-2cb1500948374b7992879f2db76c68f0。
- 最终截图/JSON副本C:/Users/31250/.codex/visualizations/2026/10/13/01a1343c-863d-7130-8bdb-469850cfebf5/timeline-bars/。

## 提交与停止点

纯逻辑47d675ccbb34734fce5dc3215efafd4487ba47d0；只读接线/Web71e72f90676424d3fc359afefbb493d1e22cba65；文档为本文件所在commit。
未实现Frozen Table/dependency/drag/resize/Date mutation/Record edit shortcut/auto shift/Calendar/config UI，
完全离屏scheduled保原row/offscreen geometry，方向indicator/jump留后续完整read parity，不作为严格B的blocker。
没有domain/wire/shared config/API/MCP/sync/version/dependency变更，linkInPage仍Table-only。
未运行真实Mongo/API/MCP、完整Product全量、native真机、5000bars或P11 Final；本轮只声明P11.2B Scope PASS。
P11.2C入口与待定范围已写handoff；完成后停止，不自动推进下一阶段。
