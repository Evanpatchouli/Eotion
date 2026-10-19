# 当前任务：P11.4C Auto Shift Policies — COMPLETE / PASS（Scope）

## 当前范围（2026-10-19）

仅收口 P11.4C，不进入 D / P11.5 / P11 Final，不改版本。正式契约和验证矩阵见
`docs/verification/p11-4c-auto-shift-policies.md`；接续事实见
`docs/verification/evidence/p11-4c-resume-20261019.json`。

| 单元 | 模式 / 等级 / 角色 | 输出 | 状态 |
| --- | --- | --- | --- |
| R1 | investigate / S0 scout | standalone、Board dirty-title refresh 与 baseline 时序 Evidence Pack | 完成；4 条有效 trace 显示同一 refresh 回退机制，0 HTTP、0 rename、0 batch mutation |
| R2 | decide / S2 主 Agent | 区分旧 PageView 草稿覆盖与 C 范围；决定修复 null batch 语义 | 完成；旧 PageView 不扩 scope，显式 null P2 已修 |
| R3 | execute / S1 | null clear 修复、几何/选区/异步保存前置 | 完成：438e393、a1a7394、eefe67a、81ea2a9、4818059、618f7ec |
| R4 | verify / S0 主 Agent + reviewer | 最终回归、证据与独立 review | 完成；C 范围 0 未修 P1/P2 blocker，Scope PASS |

R1 的四条有效 trace 均从 dirty draft / `titleSaving=false` 开始，`sync.revision` 1→2 后触发刷新，最终 draft 回到 canonical 标题；PageView identity 稳定、page item identity 改变，0 HTTP、0 rename、0 cell mutation。Reviewer 认可 baseline 表现为同机制；不修无关 PageView。

最终验证：Domain86/86、Contracts29/29、SDK24/24、Timeline logic88/88；Mongo8.2.3 Domain16/16、HTTP17/17（矩阵父+8策略子例计9）；API/Web build、typecheck、version check通过。最终完整Web193/194（workers1/retries0），P11.3 25/25、A8/8、B27/27、C14/14。唯一standalone dirty-title失败已由四条current/baseline同机制trace隔离为既有PageView问题，不称完整Web全绿。原baseline完整177/180，原始失败与中间批次保留在报告。

P11.3B reload 的真实缺口已由独立探针闭合：末态poll读到seed Timeline时，本地仍Table且pending Table upsert；4818059顺序等待Table→Timeline，修后本地/服务端Timeline、pending=0。618f7ec等异步Review id，f4c77a4补真实HTTP策略矩阵。最终完整门禁日志web-release-gate.log。P11.4B connector keyboard create P2仍留D/P11.5，不在本轮处理。

隔离Mongo均已关闭：61703/PID32300/`eotion_p114c_6ca102e54b3b`、61070/PID37200/`eotion_p114c_nullfix_a11e705872`、63334/PID36848/`eotion_p114c_nullfix_789f057983`；自有7173/7193/7194/7196/7197已停。版本0.0.1/build2不变。

完成并停在C。D必须独立启动，入口为本报告、domain scheduling、generic cell-mutations/receipt、canonical graph/rollback HTTP测试和NodeView active Date/create adapters。既有PageView草稿覆盖另立问题，不扩本轮范围。

## 上轮完成记录：P11.4B

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
