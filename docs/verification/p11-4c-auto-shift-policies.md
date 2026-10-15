# P11.4C Auto Shift Policies

基线 `d662dec83c849ce8d2ec4c09ab566ae72c0fa272`；2026-10-16（Asia/Shanghai）。分支 `codex/p11-4c-auto-shift`，开始工作树干净。版本保持 0.0.1 / build 2；P11 目标 0.0.3 未发布。

**Final verdict：HOLD（实现与C专项完成，完整Web回归的两项标题草稿失败归因未闭合）。**
不宣布 P11.4C COMPLETE/PASS，不进入 P11.4D、P11.5 或 P11 Final。功能提交至 `847dcef`，
手势fixture同步 `02cbd98`；最终SHA为包含本报告的交付提交，见交付消息。

## Evidence / Atomicity Gate

开始前读取项目规范、P11 主计划、renderer 架构、P11.3D/4A/4B 验收和任务/交接。现有 generic Cell PATCH 只能单 Cell 独立事务；现有 MCP/sync receipt 不能确认 Database batch。十项门禁决定在编码前冻结于 [Atomicity Design Gate](../exec-plans/p11-4c-atomicity.md)。

新增通用 [Database transactional Cell mutation](../architecture/database-cell-mutations.md)：多 Record、多 Cell 合并，单 snapshot transaction，Database +1、changed Record 各 +1、no-op 不 bump；root Date + cascade、Relation create + cascade 均共享同一次事务。请求携带显式目标的 expected Record version；生成的下游目标使用同事务 canonical Record version。Database/View CAS 与 Property lifecycle/reference fence 同时保护配置及图。

## 冻结调度语义

纯 planner 位于 `packages/domain/src/scheduling.ts`，不依赖 DOM/Vue/HTTP/Mongo/viewport，不读取 filter。service 负责 self Relation→semantic predecessor/successor projection，然后只传 canonical graph/dates/root/config。

| 模式 | 规则 |
| --- | --- |
| no_auto_shift | 0 cascade，Relation cycle 仍允许 |
| shift_when_overlapping | successor.start ≥ predecessor.finish；仅向未来移动，取 current 与全部 incoming constraints 最大值 |
| shift_and_keep_gap | 每边 old gap = max(0, old successor.start − old predecessor.finish)，新约束为 predecessor.newFinish + gap；仍只向未来 |

root 保留用户指定值，不由 incoming 拉回；从 outgoing 向下游传播。multi predecessor 聚合所有 incoming（包括 affected set 外仍已排期的 predecessor）；stable Record ID min-heap/topological evaluation 保证 diamond 单次计划/单次版本更新，不随输入顺序改变。

Scheduling interval：datetime point finish=start，range finish=精确 end；date-only point finish=start，显式 date-only range finish=持久 inclusive end 的次日 calendar boundary。混合精度沿既有 domain UTC 日期排序语义；required datetime 落 date-only 日中时向未来 ceil 到下一日界。display timezone 不参与。

保持 legacy string/object、point/显式 end、zero-duration range、IANA timezone、毫秒和 datetime elapsed duration。separate Start/End 使用各 Cell 的 normalized start，自动移动在一笔 Record mutation 中同时修改两个 Cell；缺 End 时仅移已有 Start，不造 End。手动 Start/End drag/resize 仍只读。

avoidWeekends 只约束需要自动移动的 successor 新 start；周六/日向未来 calendar roll 至周一。datetime 使用 Date Value 自己的 IANA timezone，保持 local wall clock/毫秒，跨 DST 后仍保 range elapsed duration；不是工作日 duration，不禁止 range 跨周末。

affected scheduled downstream cycle（包括 self edge）拒绝整个 root/Relation+Date mutation；无关 component 的 cycle 不阻塞。unscheduled successor 不造 Date，停止该路径；缺 root schedule 不传播。dependency delete 只删 Relation，不向前拉 Date。

Graph 完整性：服务端直接扫描本 Database canonical records，包含 filtered/unloaded/offscreen records，无 Web 补页、无 N+1。扫描最多现有 10,000 records；affected scheduled graph 最多 500 records / 10,000 edges；final plan 最多 1,000 changed Cells。超限 fail closed，0 业务写入，不截断。

## Web 与 unknown result

pointermove 保留原 root 或 linking line 本地 preview，0请求、0 cascade 预览。active mode release 一次 generic batch，body 只有 root intent 与 pointerdown 捕获的 Database/Record/View CAS；config fingerprint 包含 date source/dependency property/direction/mode/weekend。服务端重新读 canonical policy，Web plan 不受信。

no_auto_shift 和 dependency delete 保留原 PATCH。409 刷新 canonical，0 retry。active batch unknown 仅查询同 mutationId receipt：committed 确认整批，not_committed 确认未执行；uncertain/查询失败刷新后仍只读，不依据一个可见 root 或 membership 猜成功。

## 已执行验证

| 层 / 命令 | 结果 |
| --- | --- |
| Domain `pnpm --filter @eotion/domain test` | 86/86，新增 planner 38 项 |
| Contracts `pnpm --filter @eotion/contracts test` | 29/29 |
| SDK `pnpm --filter @eotion/sdk test` | 24/24 |
| API Domain `test:domain` | 16/16，真实 Mongo |
| API HTTP 编译后的三文件 | 7/7，包含新增 batch 聚合测试 |
| API sync HTTP / file HTTP | 1/1 + 24/24，真实 Mongo；完整 HTTP 共32/32 |
| Web Timeline 九个 logic spec | 88/88（原86 + capture2） |
| Web P11.4C focused | 14/14，mock transport/interaction |
| Web P11.4B compatibility | 27/27 |
| 最终完整 Database Web（4个不重叠分片，逐组单worker / retries=0） | **192/194**；48/49、48/49、48/48、48/48，无跳过或重试 |
| 最终分片内 P11.3 / P11.4A / P11.4B / P11.4C | **25/25、8/8、27/27、14/14** |
| API / Web typecheck；API / Web production build | PASS |
| version check | PASS，0.0.1/build2未变 |
| 独立 reviewer | 实现静态审阅0未修blocker；确认尚无运行证据把标题失败归因于基线，验收保持HOLD |

新增 batch HTTP 是一个聚合测试，包含以下真实断言，不能将它虚报成几十个独立测试：single/multiple Cell、multiple Records、DB一次/Record各一次/no-op、stale DB/first/last Record、invalid Date/Relation/Property、title/derived拒绝、重复target/501 bounds、授权/归属、持久读取/并发、receipt、root与Relation级联、canonical filtered chain/外部incoming、cycle/unrelated cycle、unscheduled、Start/End双Cell与staleView。尤其通过 repository fault injection 在第一条真实更新后让第二条CAS返回null、以及抛普通Error，验证前条数据/Record version/Database bump全部真实回滚，receipt确定not_committed。

Domain 覆盖三种策略、29项核心日期/拓扑/weekend语义及扩展回归。Web mock 验 Date drag、range、两侧resize、point→range、release前0请求、单batch、依赖创建/删除、filtered下游、cycle、409、receipt三态/读取失败、offline/stale config；不把 mock 模拟原子性作为 Mongo 证据。Keep-gap/diamond/DST/weekend 的算法由domain覆盖，真实 API 验 executor/canonical/rollback；未逐项做一条Web→真实API→Mongo全链。

| planner 样本 | nodes / edges / mutations | 最近一次耗时 |
| --- | --- | --- |
| chain10 | 10 / 9 / 9 | 0.28 ms |
| chain100 | 100 / 99 / 99 | 0.63 ms |
| chain500 | 500 / 499 / 499 | 3.71 ms |
| sparse500 | 500 / 499 / 499 | 2.96 ms |
| dense500 | 500 / 9,790 / 499 | 9.92 ms |

另有 diamond、multi predecessor、cycle 与超限测试。复杂度为 O((V+E) log V) 加稳定拓扑，不递归边走边写；以上是本机有界样本，不是生产负载/FPS benchmark。

真实隔离 Mongo 8.0.12 使用随机端口64880、replica set `p114cc5ed398d`，新TEMP dbpath，各测试随机DB；未访问用户27017。测试完成后已通过admin shutdown关闭，PID42268不存在、64880无监听，`mongo-shutdown.json`保存确认。保留dbpath/log供复核，不留后台实例。

## 回归、review与原始证据

独立review修复：separate Start/End缺End时误用Start Cell内部end；外部incoming未纳入实际约束边数上限。根Agent完整Web回归又发现无dependency时undefined/null指纹不一致拒绝P11.3提交，统一缺省值后独立review复核无blocker。

首轮完整Database在136项通过后出现137/138/139的P11.3失败，发现指纹根因后中止，原始日志保留。修复后P11.3定向24/25通过，唯一390px拖动在启动态为idle，单项源未改复跑1/1通过；第二轮完整193/194，只有B粗指针touch preview未出现。未将它们称为已证实基线缺陷或直接用重试宣布通过。

测试现等待当前有限CSS动画完成，并观察真实scroller width/scroll、viewport rect/generation及页面scroll连续4 RAF稳定，再采集手势坐标；120帧不稳定即失败。它与产品的viewport变动取消保护对齐，不改Date.now、真实pointer输入或原有断言，也不重试手势。两个390px场景各repeat3，共6/6通过；独立review认可该几何同步。失败日志未记录源点命中/pointercancel，故不据此声称已证明某个生产bug；稳定后若复现仍应采真实事件证据。最终完整结果见最终表及交付消息，所有首轮证据保留。

布局同步后的完整长批次为192/194（P11.3B往返宽度差26px、standalone标题草稿回退）；其后这两项不改断言各repeat3，共6/6通过。再将完整194项分成4个不重叠组，各组独立worker、retries=0，仍为192/194：

| 失败 | 观察 |
| --- | --- |
| standalone route keeps drafts across delayed A-B-A | `Title draft across route` 回退为 `Standalone record`，组件/DOM identity断言均通过 |
| board grouping mutation preserves Table editing | titleDraft.fill后、任何Board mutation前，`Draft survives Board mutation` 回退为 `Move me` |

两项都没有执行C新增Date/Relation/batch入口。独立review定位到旧的可疑链路：`ProductShell` sync.revision触发pages.refresh、store替换items、`PageView.vue:95` watcher返回新数组并在!titleSaving时重置draft；**没有运行时间线证明它就是本次根因，不据静态推断宣称基线缺陷**。未擅自修改PageView/Title/Page sync。

已从指定`d662dec`通过git archive提取独立快照，7174端口、baseline源码/配置作对照；两项定向各repeat5，10/10通过。基线完整180为**179/180**：Board View创建测试在fill后、任何创建/切换前，`Board draft survives creation`回退为`Board record`。它证明同类标题即时回退在未改基线上存在，但baseline的standalone与Board grouping当前对应case都通过，未证明实际触发链相同；不能把当前两失败都标为已证基线。基线自有7174已关闭。

最终独立review明确区分：C实现静态0未修blocker、C专项及P11.3/B通过；**完整Web回归未通过且归因未闭合，Final verdict仍为HOLD**。没有顺手修改PageView、没有降断言/跳过/自动retry以取得PASS。

**解除HOLD的精确工作：** 给当前与baseline相同顺序记录titleDraft/titleSaving/page.title、pages.rename、sync.revision/pages.refresh与View GET gate的运行时间线，证明标题回退根因；若属于本次回归，做最小修复并补回归；若是已证明基线问题，明确隔离其验收影响。然后复跑直接相关草稿与完整Database门禁。不得仅再次repeat至通过、隐藏失败或提前进入D。

原始日志（均在系统TEMP，不提交运行产物）：

- `eotion-p114c-tools/domain-final.log`、`contracts-final.log`、`sdk-final.log`：最终算法/契约/SDK与性能。
- `eotion-p114c-api-2449f8db0af5493795a10126586e1d80/domain.log`、`http-js.log`：真实Mongo16/16与7/7。
- `eotion-p114c-tools/sync-http-workspace.log`、`file-http-793c7ea8ff8543ae8850d5e86562307f.log`：1/1与24/24。
- `eotion-p114c-tools/web-logic.log`、`build-web.log`：88项logic及production build。
- `eotion-p114c-web-4f43de27f21a464693603daa9962afa6.log`、`eotion-p114b-compat-33853e73b10348fd90d8673b01791cd4.log`：C14/14、B27/27。
- `eotion-p114c-tools/web-database-full.log`：首轮发现真实regression后中止；`web-p113-after-fix.log`（24/25）、`web-p113-mobile-final.log`（1/1）、`web-database-final.log`（193/194）、`web-touch-settled.log`（6/6）与 `web-database-stable.log`（布局同步后最终完整）。每轮独立Playwright output目录，未覆盖首轮证据。
- `eotion-p114c-tools/web-two-repeat.log`（6/6）、`web-shard-1.log`至`web-shard-4.log`（最终完整192/194）；所有分片不同output目录，无retry/skip。
- `p114c-baseline-fd063d80a37f446fb6fc5c4d7d977b6f.log`：基线定向10/10；`p114c-baseline-full-34e06015fa94450f8f47a6687c3cf76f.log`：基线完整180对照。
- `eotion-p114c-tools/mongo.json`、`mongo-shutdown.json`：实例元数据与停止证据，Mongo log在指向的独立目录。

验证环境初始pnpm launcher/Junction不可遍历，使用TEMP pnpm10和本地hoisted依赖完成验证，workspace暂时materialize并同步；不修改依赖声明/lockfile/版本。sync首次因node_modules中的TS不能strip失败，使用TEMP workspace import hook指向仓库原src后1/1通过（约74秒），未改生产代码或断言。后续本机验证需同样同步workspace副本，正常开发可重新安装以恢复标准workspace链接。

未运行：完整Product其余13文件、浏览器连接真实API全链E2E、Electron/Lynx真机、生产性能负载、正式截图baseline差异、P11.4D/P11.5/P11 Final及发布。API独立diamond/keep-gap/weekend/DST未重复矩阵，已在domain冻结，不能称它们全部做过真实HTTP逐项验收。

## 停止与后续

停在 C/HOLD。必须先解除上述回归门禁。之后 D 精确入口：本报告、pure planner 的行为矩阵、generic cell-mutations/receipt、NodeView 两种 active adapter、canonical integration/rollback 测试；独立验证整个 Dependency 功能，不把 C 专项通过当作 D/P11 Final。

P11.4B connector focusable button 的 Enter/Space create P2 保留到 P11.4D 或 P11.5，不在本轮设计 picker。无 dependency settings、Undo/Redo、multi-select、unscheduled 自动排期、MCP 扩展或版本升级。
