# 当前任务：P11.2A Timeline Shell + Coordinate Engine（范围验收 PASS，完成并停止）

基线：7b93617（P11.2.0 Architecture PASS），开始时 master 工作树干净。
工作分支：codex/p11-2a-timeline-shell。版本保持 0.0.1；P11 目标版本 0.0.3。
冻结设计：docs/architecture/timeline-renderer.md；只读空间 shell，完成后停止，不进入 P11.2B。

| Work Unit | 模式 / 难度 / 角色 | 目标 | 状态 |
| --- | --- | --- | --- |
| A1 | investigate / S0 scout | routing、P9 fence、standalone B1 与测试入口 Evidence Pack | 完成，确认 B1 |
| A2 | decide / S2 worker + 主 Agent | 冻结设计内的纯函数 API / IANA resolver 与组件接线 Brief | 完成，执行已降到 S1 |
| A3 | execute / S1 fast_worker | coordinates/scale/ruler/viewport 与数学回归测试 | 完成，数学14/14 |
| A4 | execute / S1 fast_worker + 主 Agent | 六组件、单一 viewport adapter、真实 Timeline routing；B1 最小修复 | 完成，Web定向5/5，P9回归3/3 |
| A5 | verify/review / S0 scout + reviewer | 数学/Web/identity/390px、typecheck/build 与最终独立 review | 完成，review 0 blocker；完整相关167/172，失败基线对照已记录 |
| A6 | execute / S1 主 Agent | 正式验收/索引/current-task/handoff、diff 复核与逻辑单元提交 | 完成，纯引擎20ac1eb、Shell接线1ea6eb4；文档为本文件所在commit |

## 实施边界

- configuredScale 来自 options.timeline.scale，默认 month；selector 只改本实例 local override，0 PATCH / 0 records GET。
- 统一 logical UTC instant ↔ content pixel；date-only 使用 display-zone 当地日界，datetime 保持 UTC instant。
- 七种密度严格按 P11.2.0；有界 native canvas、同帧 rebase、ruler/grid/Today 共用 transform。
- 唯一横向 scroller、有限 overscan ticks、page-host ruler pin；resize/navigation 保留 center。
- records/loading/cursor/footer、通用 title/open 与 Record Host 继续父层持有。A 不读 raw Date 或分类 records。
- B1 按冻结最小修复：同库 route View change 不销毁 loading subtree，稳定 Editor key，原地更新 block viewId。
- 不实现 projection/bar/range/milestone/Frozen Table/dependency/drag/resize/date mutation/专用 records loader。
- 不改 MCP/schema/API/sync/version/dependencies/linkInPage Table-only 门禁。

## 验证目标

数学：round trip、七 scale、时区日界/午夜 gap/fold/半小时 DST/整日跳过/0/99/闰年/月末、tick 有界、rebase/center。
Web：真实 Timeline、无 Table fallback、七 scale、Today/Prev/Next、原生横滚、390px 无页面溢出、Table/List/Board 回归、P9 identity/draft/ABA、清理与跨日刷新。
数学14/14、Web定向5/5、P9ABA/snapshot3/3与typecheck已通过，四张Light/Dark desktop/390px截图已视检。
最终完整相关suite172项：167通过、5失败（Database110/113、Editor43/45、数学14/14），0skip/retries。
五个失败单独复跑3通过/2失败；未改动7b93617隔离基线同样3通过/2失败，另外三项完整运行时序尚未定性。
最终Web build/vue-tsc/SW通过；659.30kB已有chunk提示保留。未顺手修改既有失败流程或弱化断言。
本轮判定P11.2A范围验收PASS，不声明完整Product全绿。正式证据见docs/verification/p11-2a-timeline-shell.md。
日志：C:/Users/31250/AppData/Local/Temp/eotion-p112a-full-final-640611811d8546368decd60033346a59。
未运行Mongo/API/MCP、完整Product、native真机、5000bars性能或P11 Final。本轮完成后停止，不进入P11.2B。
