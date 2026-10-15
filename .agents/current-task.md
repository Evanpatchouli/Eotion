# 当前任务：P11.4B Dependency Editing — PASS / COMPLETE，完成并停止

基线 `1eb5e5db5c29bd97aa3a13ea4c39812c80bcd64c`，分支 `codex/p11-4b-dependency-editing`，开始工作树干净。
只执行 B；不移动日期、不改版本、不进入 P11.4C/D。

| 单元 | 模式 / 等级 / 角色 | 输出 | 状态 |
| --- | --- | --- | --- |
| B1 | investigate / S0 scout | Relation wire/validation/serialization/CAS/transaction Evidence Pack | 完成 |
| B2 | decide / S2 主 Agent | semantic mapping、pointerdown capture、canonical failure recovery Brief | 完成 |
| B3 | execute / S1 fast_worker | pure mutation logic + 27 tests | 完成，25ba107 |
| B4 | execute / S2→S1 worker / 主 Agent | linking/selection/delete、NodeView adapter、touch与review修复 | 完成，aa77aa9/e464c2e/db3c3ea |
| B5 | verify / S0–S1 scout / fast_worker | Web/API/Mongo、100/500、visual与P11.3回归 | f13f3f8；B27/27、logic86/86；最终完整Database180/180 |
| B6 | review / reviewer | 最终独立生产/测试复核 | 完成，0 P1/P2 blocker |

## Evidence Pack / 冻结边界

- `DatabaseNodeView.setRelation` → `updateProductDatabaseRecordCell` → existing Cell PATCH → `DatabaseService.updateRecordCell/assertRelationValues`；无新后端路径。
- Relation为最多50个unique stable-ID `string[]`，append/filter保序；existing domain允许self/cycle，Timeline额外拒绝self/semantic duplicate，允许cycle。
- gesture永远predecessor→successor；depends-on修改successor Relation中的predecessor；blocks修改predecessor Relation中的successor；create/delete同一纯mapping。
- pointerdown捕获完整scope/user/workspace/database/view/block/epoch/root、property/config/direction、DB version、loaded owner candidates原Cell/Record version；release不取新版本。
- 单owner完整Cell PATCH，现有双CAS/事务；savingCell在await前阻断第二写入。409刷新不重试；unknown只比较canonical membership，刷新失败staleReadonly。
- canonical Relation→P11.4A projection是唯一永久graph。只链接rendered scheduled Bar及其同record控件，无N+1，无Date写入。
- Pointer Events create/cancel与Date drag/resize仲裁；触控delete primary/session/bounds fence，首tap仅选择，再tap删除并抑制compatibility click。
- offline不可编辑，active linking cancel；scope/config/property变更fail closed。Cycle scheduling semantics deferred to P11.4C Auto Shift Policies.

## 验证与证据

报告：`docs/verification/p11-4b-dependency-editing.md`；架构§29。
logic86/86；Domain48/48；Contracts25/25；隔离Mongo Domain16/16；HTTP31/31（增补前），增补Database HTTP5/5。
B Web27/27；首完整Database178/180（两个非Timeline失败），最终源定向2/2通过；最终完整180/180通过，首轮不稳定证据保留，不称基线缺陷。
100/500：10/50 edges，4/20 generic table reads，额外Record requests0；pointermove投影/geometry引用稳定，无关DOM/Vue更新0，preview layer Vue4。
主Agent已视检Desktop/390 Light/Dark与Dark preview/selection；真实coarse/CDP touch create/delete 2 Relation PATCH / 0 Date PATCH / pageerror0。
Web typecheck/build、version check通过；版本0.0.1/build2不变。Mongo已停，证据目录见报告。

未运行完整Product其他13文件、native真机、Web连真实API全链、正式FPS、P11.4C/D/P11.5/Final/发布。
下一阶段只能由独立任务进入P11.4C；精确入口见报告§6，禁止把B的single Cell PASS当作Date cascade授权。
