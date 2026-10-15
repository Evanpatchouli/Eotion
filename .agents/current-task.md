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
# 2026-10-16 P11.4B Dependency Editing — IN PROGRESS

基线 `1eb5e5db5c29bd97aa3a13ea4c39812c80bcd64c`，分支 `codex/p11-4b-dependency-editing`，开始工作树干净。
仅 create/delete dependency；不执行 Date auto-shift、不改版本、不进入 P11.4C。

## Work Units

| 单元 | 模式 / 等级 | 执行者 | 验收 |
| --- | --- | --- | --- |
| 既有 Relation 写链 Evidence Pack | investigate / S0 | scout | wire/validation/serialization/CAS/transaction 证据（已完成） |
| mapping、capture 与失败恢复边界 | decide / S2 | 主 Agent | 下述 Brief |
| pure mutation + logic tests | execute / S1 | fast_worker | mapping/property/config/no-op/cycle/unknown logic |
| connector / linking / selection / delete | execute / S2→S1 | worker | 确定 UI 边界后实现，Pointer Events/lifecycle/单 Cell |
| Web + Mongo + regression / smoke | verify / S0–S1 | fast_worker / scout | 新 B 门禁、P11.3、100/500、Desktop/390 |
| 最终独立 review + 文档收口 | review / Review | reviewer / 主 Agent | 0 blocker、验收报告、提交、干净工作树 |

## Evidence Pack / Implementation Brief

- `DatabaseNodeView.setRelation` → `updateProductDatabaseRecordCell`（同 Database 序列化）→ SDK generic Cell PATCH → `DatabaseService.updateRecordCell/assertRelationValues`；不新增 backend 路径。
- Relation 为 unique stable-ID `string[]`，最多 50，append/filter 保序，无 reciprocal 写入。现有 domain 允许 self/cycle；Timeline UI 额外拒绝 self/semantic duplicate，允许 cycle。
- 服务端事务先 Database CAS/bump，再 Relation 引用 fence/validator，再 Record CAS；失败回滚。使用现有版本，不自动刷新后重试。
- gesture 永远 predecessor→successor。depends-on 写 successor += predecessor；blocks 写 predecessor += successor；create/delete 共用纯 mapping。
- pointerdown 捕获 user/workspace/database/view/block/scope/epoch/root、完整 dependency config/property identity、Database version、loaded records 的 Relation raw value/Record version（owner 可为尚未命中的 successor）。release 不获取新版本。
- adapter 校验 context/config；一次完整 owner Cell PATCH。成功/409/unknown 复用 `refreshLoadedWindow`；unknown 只依据 canonical membership 确认，刷新失败 staleReadonly，不 retry。
- generic `savingCell` 在 await 前锁住全部 Database mutation。canonical Relation→P11.4A projection 为唯一永久 edge 来源，preview/pending 仅 transient。
- UI 复用 shared geometry/routing，只链接 rendered Bar；不补目标 GET。handle 与 resize/body 仲裁；取消覆盖 Escape/cancel/lostcapture/blur/hidden/unmount/scope/offline。

