# 当前任务：P11.4A Dependency Read Model + Lines（完成并停止）

基线 `2f9734b4a2bb10ea2c8c51679d3075d92749fd1c`，开始时 master 工作树干净。
分支 `codex/p11-4a-dependency-read-lines`。**Final verdict：PASS（P11.4A Scope）。**
只执行 P11.4A；P11.4B/C/D、P11.5、P11 Final 未开始，不改版本或发布。

| 单元 | 模式 / 难度 / 角色 | 输出 | 状态 |
| --- | --- | --- | --- |
| A1 | investigate / S0 scout | config、Relation wire/lifecycle Evidence Pack | 完成 |
| A2 | decide / S2 主 Agent | 纯投影、共享 raw anchors、row-span窗口、按edge preview订阅 | 完成 |
| A3 | execute / S1 fast_worker | dependency projection / geometry / logic | 完成，逻辑提交552207a |
| A4 | execute / S1 fast_worker | SVG layer、逐edge组件、preview geometry桥接 | 完成，集成提交5dd2c03 |
| A5 | execute / S2 worker，方案收敛后S1 | Web harness、N+1、100/500与视觉 | 完成，新增8项；marker后补验1项 |
| A6 | verify / S0 scout | Domain/Contracts、完整Database、typecheck/build | 完成，48/25/153全PASS |
| A7 | review / reviewer | 最终生产/测试独立复核 | 完成，0 P1/P2 blocker |
| A8 | execute / S1 主 Agent | 文档、交接、聚焦提交和停止 | 完成，文档提交包含本文件 |

报告：`docs/verification/p11-4a-dependency-read-lines.md`；架构 §28。
Timeline logic 59/59（新增7），Database Web153/153（新增A8，单worker/零重试），
Domain48/48、Contracts25/25；Web typecheck/build、diff/strict UTF-8无BOM通过。
无domain/API/schema/依赖/版本改动；未跑真实API/Mongo、完整Product、native、FPS或发布。

唯一来源为 canonical loaded View records 的 self Relation string[] cell。
depends-on target→owner，blocks owner→target；derived edge ID，无持久实体。
缺失/filtered/unloaded/self/无效引用 fail closed，不补请求、不猜测属性。
共享layoutTimelineItem raw端点与Bar center Y；row span/window筛选，viewport外保留canvas内edge。
active drag/resize preview按record key只更新关联path，不重投影/解析Relation。
Grid < Dependency < Today < Bar/preview，SVG不抢pointer/focus；箭尖提前10px露出point diamond。
100 sparse/medium：11/197 paths、100 rows；500：51/997 edges、3/59 paths、28 rows。
四组pointer预览refs稳定、无关path累计DOM0、move PATCH0；额外Record/resolve请求0。

主Agent已视检Desktop/390 Light/Dark和preview。PNG、失败与最终原始日志在TEMP，见报告。
初轮harness错误均保留原始日志并修正，不削弱业务门禁；视觉发现point箭头遮挡已修正并复验。
独立review完成后无产品逻辑变更；完整Database最终运行包含marker修正。

P11.4B精确入口：domain TimelineDependencyOptions、timeline/dependency.ts，
DatabaseNodeView.setRelation → productDatabases.updateProductDatabaseRecordCell →
DatabaseService.updateRecordCell/assertRelationValues；参考prepareTimelineBarDrag/moveTimelineRecord
的scope/identity fence。须独立定义editing/cycle/失败语义，不执行auto shift，完成后停止。
