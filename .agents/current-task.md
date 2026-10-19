# 当前任务：P11.4D Dependency Final Acceptance — COMPLETE / PASS（Scope）

## D 阶段范围与基线（2026-10-19）

仅执行 D1–D4；完成后停止，不进入 P11.5 / P11 Final / 发布。版本保持 0.0.1 / build 2。
开始分支 master，工作树干净；HEAD 与 fetch 后 origin/master 均为
`2f84ef5ca560bbcd6e8afa06b14ab1d8252bb743`。

| 单元 | 模式 / 等级 / 角色 | 产出 | 状态 |
| --- | --- | --- | --- |
| D1a | investigate / S0 scout | connector、目标、focus、取消 fence Evidence Pack | 完成 |
| D1b | decide / S2 主 Agent | 最小键盘创建 Implementation Brief | 已冻结，见下 |
| D1c | execute / S1 fast_worker | 键盘创建与 Web 回归 | 5f7f56c；15/15 PASS，真实silent readonly修复/三尺寸L-D视检完成 |
| D2a | investigate / S0 scout | receipt 三态反馈问题证据 | 已确认两条 not_committed 成功刷新分支缺提示 |
| D2b | execute / S1 fast_worker | 已确认未提交反馈与边界回归 | a1c2f4f；Web 12/12 PASS，修前缺提示红证据保留 |
| D3a | decide / S2 worker | 混合精度既有契约与 Implementation Brief | 已冻结，见下 |
| D3b | execute / S1 fast_worker | Domain 与真实 HTTP 精度回归 | 965fa0e；Domain92/92、真实HTTP18/18、API build/typecheck通过 |
| D4 | verify / S0 scout + independent reviewer | 分层矩阵、完整 Database Web、review、文档 | 首220/221的双status回归已由1e30603修复；定向13/13、最终完整221/221，0skip；独立review Scope PASS/0blocker |

Evidence：Dependency 永久关系仍是 self Relation Cell；active Date/create 复用 generic
cell-mutations 与同 mutationId 整批 receipt。手动 Separate Start/End 继续只读；D3 仅收口
自动调度两个合法 Date Cell 的精度契约。不新增实体/API/候选查询/依赖，不削弱 lifecycle fence。
C 已证 PageView dirty-title 基线问题隔离，不改标题同步；完整 Database Web 单 worker、零重试，
保留实际结果。先做定向，再跑 A/B/C、P11.3、完整 Database、Domain/Contracts/SDK、隔离
Mongo/HTTP CAS/rollback/receipt、API/Web typecheck/build/version/diff check 与最终独立 review。

最终验证完成：Domain92/Contracts29/SDK24、Timeline logic88；真实Mongo Domain16/performance1/
HTTP18；Web最终221/221，P11.3合25、A8/B27/C14/D27全部通过；API/Webtypecheck/build及版本
门禁通过。Mongo61930/PID5360已退出、listener0；两轮Vite均已停、7173无监听。
版本0.0.1/build2，独立review0未修P1/P2。最后实现提交1e30603；最终交付为包含本记录的文档
提交，SHA见交付消息。仅D完成，停止；P11.5/P11 Final/发布未启动。

## 历史：P11.4C COMPLETE / PASS（Scope）

## D1 Implementation Brief（编码前冻结）

D1 定向真实失败补充：editor.setEditable(false) 未触发 Timeline writable prop，active preview
未取消（提交 liveguard 仍阻写）。reviewer进一步发现正式路径setEditable(...,false)不发update；
NodeView仅为Timeline通过MutationObserver观察Editor view DOM的contenteditable属性，初始同步
与变更同步reactive editable，卸载disconnect，并合入传入Timeline的writable。
不扩通用toolbar/Board行为；真实silent false→true及DOM属性回归必须保留，不用props注入替代。

- Enter/Space 在来源 connector 启动，捕获与 pointerdown 相同的 dependency snapshot。
- 焦点保持来源 connector；上下/左右方向键在当前 rendered scheduled、非自身、非重复边的目标间循环，Home/End 可选首末。初始选第一个合法目标；没有候选时明确提示且不提交。
- Enter/Space 再次确认，复用同一 mutateDependency；Escape 取消，0 mutation。Tab 离开取消，避免全局键盘劫持。
- 复用 previewEdge 与 geometry 显示目标，持久 aria-live 状态宣告来源/目标/快捷键/保存及结果；候选 Bar 有可见选择反馈。
- 成功/失败/取消后只在同一 scope、DOM root 有效且焦点仍由本交互占用或丢失时恢复来源 connector；不抢占用户已转移焦点，不把旧响应焦点带到新 View。
- 保留 pointer capture/cancel、scope/config/viewport/online/writable fence；监听 rendered source/target 消失和重复边变化，立即取消或清目标，确认前再次验证合法性。keyboard linking 与 Date drag/resize、pending 互斥。
- 不补取目标、不新增 API、不修改 Relation mapping；实现限 TimelineBar/Viewport/hook，Web真实交互回归沿用 product-database fixture。

## D2 Implementation Brief（调查已确认）

两条 active batch 的 not_committed receipt 分支，在 canonical refresh 后仍属当前 scope 时明确提示：
刷新成功为“提交结果已确认未执行，已刷新服务器最新内容。”；刷新失败保留现有未完成提示。
committed 不报事务失败，uncertain/receipt失败保持结果未知和只读，不 retry mutation。
补 Date/create 两路径三态、receipt失败、refresh失败、scope变化回归；不改通用后端或身份边界。

## D3 Implementation Brief（决策冻结）

P11.1 的同精度校验只约束单 Cell 内部；两个独立原生 Date Cell 合法，§21.2 不要求跨 Cell 同精度。
删除 planner 额外跨 Cell 拒绝；finish 使用 End Cell kind：datetime 精确 instant，date-only
为该 UTC 日期次日边界。先算 finish 再检查范围；date-only End 需 finish>start，datetime End 允许相等。
Start=date-only 时 required ceil 到 UTC 日初；Start=datetime、End=date-only 时正向 delta ceil
到整 UTC 日，再按 Start 自身时区应用 weekend。每 datetime Cell 按实际 elapsed delta 移其全部端点；
每 date-only Cell 按 Start 新旧 UTC 日期差移动，保留 shape/zone/ms/内部范围。
混合外层没有统一 elapsed duration；DST weekend 后仍保持每 Cell 内部范围与 UTC calendar span，
最终重新校验，越界失败整体回滚。普通同精度行为不变。
现有 renderer mixed=incompatible-kinds 未排期诊断保持，明确 server canonical 支持不等于混合 Bar
可视化或手动双 Cell 编辑。实现限 scheduling.ts、Domain测试、真实 HTTP Separate source Relation
create+context 回归及契约文档；不改 Date validator、Contracts、模型或接口。

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
