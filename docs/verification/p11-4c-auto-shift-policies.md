# P11.4C Auto Shift Policies

## 2026-10-19 接续验收

从已提交的 `d870135` 接续，起点工作树干净；当前分支 `master`。P11.4C 的实现基线仍是
`d662dec83c849ce8d2ec4c09ab566ae72c0fa272`。本轮只闭合 C 的 HOLD，不进入 D/P11.5/Final，
版本仍为 0.0.1 / build 2。

**Final verdict：PASS（P11.4C Scope），COMPLETE，完成后停止。** 独立 reviewer 确认 C 范围内
0 个未修 P1/P2 blocker。完整 Database Web 193/194，唯一失败是已证基线 PageView 草稿覆盖；
不称完整 Web 全绿，也不代表 P11.4D 或 P11 Final PASS。下面保留原 HOLD 与各轮失败证据。

### 标题草稿归因

在原始 `d662dec` 的独立 `git archive` 快照和当前版本，分别运行 standalone 与 Board grouping
两种诊断。baseline 的四个 @eotion workspace 链接指向快照自己的 packages，未借用当前源码。
四次有效诊断均保持 dirty title、`titleSaving=false`，只递增一次 sync.revision；ProductShell
调用 pages.refresh 后，page item 换成新对象，id/title 未变，PageView 未重建，draft 回退到原标题。
rename、HTTP 请求、cell-mutations 请求全部为 0。涉及的四份源文件 Git blob 完全一致。

根因是 `watch(() => [page.value?.id, page.value?.title], ...)` 返回新数组：替换同值 page 对象也会
执行回调，未保存 draft 被覆盖。该失效机制已在指定基线复现，独立 reviewer 认可将它隔离为既有
PageView/refresh 问题；本轮没有修改标题或页面同步产品代码。触发前已开始保存或 title 已等于 draft
的 Board 探针不满足前置，已排除。精简原始事件、源码 hash 和基线信息见
[接续证据 JSON](evidence/p11-4c-resume-20261019.json)。

### 修复和测试同步

- `438e393` 修复独立 review 找到的新 batch P2：合法持久化显式 null 后再次提交 null，原实现
  删除 key 并错误 bump DB/Record。真实 HTTP 新测试修前在 DB version actual 5 / expected 4
  失败，修后验证单独 no-op、混合 batch、非空清除、重复清除与 committed receipt。显式空值原形
  保留；只有实际改变的 Record bump，整批 DB 仍只 +1。相关公共契约同步到通用事务架构文档。
- `a1a7394` 将表头四个异步 boundingBox 改为同一 evaluate 布局快照，保留 visible、同行误差
  <=10px、flex 和 document width 全部断言；定向 1/1。旧批次 24px 差异的具体成因未确证，
  这里只修正跨时刻测量的歧义。
- `eefe67a` 为 startDatabaseSlash 增加只读选区前置：Ctrl+End 后确认真实 PM selection 在末尾
  textblock，Enter 后确认末尾空 paragraph 的 offset0，再输入 Slash。没有设置 selection、
  重放按键或放宽 menu/dialog 断言，nested helper 未改；8 个既有调用情景 8/8。
  有界探针 20 次中有 1 次 Ctrl+End keyup 时 DOM offset11 / PM head1，约 4ms 后 Enter keydown
  前已同步到 head12；20 次都成功。它证明短暂未同步窗口，未捕获原失败同次因果，不能把这些绿色
  探针当作验收或据此断言原失败的完整根因。
- `81ea2a9` 补 P11.3B roundtrip 的持久化与布局前置。前一完整批次193/194，仅该用例在reload
  后未找到 Bar；错误 DOM 显示 Date 值正确、主 Block 仍引用 Resize table。普通 View 切换先改
  Editor attrs，再由 PagePersistence 延迟500ms保存；原测试双RAF后就reload，未等待canonical
  引用。现在只读等待 api.blocks 中viewId等于Timeline目标，再reload；比较几何前复用既有
  settleTimelineGestureLayout，保留全部Date/point/range与1px断言。独立review认可，定向1/1。
  只证明该批次的保存前置缺失与旧引用快照，不把全部历史偶发失败都归于同一个原因。
- `4818059` 修正上一条单独末态检查的不足：seed 本来就是 Timeline，等待这个值可能提前成功。
  独立7197探针同症复现1/1失败：reload前server=seed Timeline、IDB=Table、pending为Table
  block.upsert。只增加中间 Table 保存检查后，观察到 Table→Timeline 写入顺序；reload前server
  与IDB均Timeline、pending block.upsert为0，两次单次探针均通过。现在切回前先观察canonical
  Table，回切后再观察canonical Timeline，不强制flush或改产品。私有PagePersistence pending
  状态未能从探针链读到，未虚报该字段断言；正式测试保持只读server状态转换检查。
- `618f7ec` 修正plain Table选项验收：Add.click后立即同步读Review id可能早于异步Property
  PATCH完成。仅增加同一个id的只读poll，保留所有ID与后续选项生命周期断言。未对照该case的
  baseline，因此不标它为已证基线失败。此项与两阶段保存正式代码定向2/2。
- `f4c77a4` 补8组真实HTTP canonical View策略矩阵：keep-gap chain/diamond、overlap diamond+
  外部前驱、春季DST周末开启/关闭、秋季DST、date-only周六/日。每组通过HTTP建立Date/Relation/
  View、root带context原子提交，验证精确wire值、持久化/receipt、DB+1、changed Record各+1以及
  外部前驱不变。Node矩阵9/9包含父测试+8子测试，完整三HTTP文件17/17，0fail/skip。
  初轮400是fixture用了非canonical策略简称，已按原enum修正，不改Date预期或产品代码。

### 本轮验证

| 层 | 结果 |
| --- | --- |
| Domain / Contracts / SDK | 86/86、29/29、24/24 |
| Web Timeline 九个 logic spec | 88/88（80+8，互不重叠） |
| 真实 Mongo API Domain | 16/16 |
| 最终真实 Mongo HTTP 三文件 | **17/17**；含原 batch、null no-op，以及矩阵父测试+8子测试 |
| Web / API typecheck、production build、version check | PASS |
| 接续首次完整 Database Web | 191/194；P11.3 25/25、A8/8、B27/27、C14/14 |
| 指定原始 baseline 完整 Database Web | 177/180，单 worker、retries=0 |
| 补保存前置之前完整 Database Web | 193/194；P11.3 24/25、A8/8、B27/27、C14/14 |
| 仅末态保存检查之后完整 Database Web | 191/194；reload旧Table、已证基线Board草稿、Review选项急读 |
| 最终完整 Database Web（618f7ec） | **193/194**；唯一已证基线 standalone dirty-title 失败；不称完整Web全绿 |
| 最终批次 P11.3 / P11.4A / P11.4B / P11.4C | **25/25、8/8、27/27、14/14** |
| 最终独立 reviewer | **C 范围 0 未修 P1/P2 blocker；Scope PASS** |

接续首次三失败是表头同行测量、Slash 建库、链接共享库；两项 Slash 都在输入未形成独立空行时被
既有守卫阻止，未调用 C batch。原始 baseline 的完整 180 项也在相同 Slash 建库 case 的相同
dialog visibility 断言失败；另两失败是 P11.3B drag idle 与 Board 手机布局。baseline 的 header /
Slash 建库 / shared-link 定向 3/3，不能据此把当前 shared-link 历史失败认定为已证基线缺陷。
baseline 错误 DOM context 未留存，故只确认同断言失败，不推断相同深层 DOM/selection 原因。

中间完整批次在 81/194 时主动停止以加入已审阅的选区前置，不算完整结果。等待器最初从无 editor
引用的 DOM 节点读取状态，两次脚手架尝试失败后改用既有 EotionEditor 组件入口；日志保留，不计
产品回归。最终批次独立 output、单 worker、retries=0，不合并重复用例冒充全绿。

Domain 本次本机 planner：chain 10/100/500 为 0.17/0.88/4.91ms，sparse500/499 为5.30ms，
dense500/9,790 为13.58ms；对应 mutations 为9/99/499/499/499。仍为有界 O((V+E)logV) 样本，
不是 production benchmark。

真实 Mongo 8.2.3 使用新 TEMP dbpath 和随机 replica set。Domain/原HTTP实例端口61703、
rs `eotion_p114c_6ca102e54b3b`、PID32300；null 修复红绿实例端口61070、
rs `eotion_p114c_nullfix_a11e705872`、PID37200。两者均 admin shutdown，PID 不存在且端口无监听；
初始化期间的另一个临时实例59912也已关。未访问用户27017。
矩阵实例为63334、rs `eotion_p114c_nullfix_789f057983`、PID36848、新TEMP dbpath，亦已
admin shutdown，PID不存在且listener=0。7173/7193/7194/7196/7197均在结束核对无监听。

本轮原始日志均在 TEMP：`eotion-p114c-resume-d525d668aa154ff5bdf7ead1a11f1e26` 中的
domain/contracts/sdk/logic/logic-extra/typecheck-web/build-web/web-full/web-final/web-acceptance/
header-atomic/slash-sync/slash-sync-vue/slash-sync-final/p113b-persistence-fence/web-final-canonical/
final-fence-focused/web-release-gate 日志，以及p113b-reload-probe-evidence.txt；`eotion-nullfix-pre-repair.log`、
`eotion-nullfix-post-repair.log`、`eotion-nullfix-http-suite.log`、`eotion-nullfix-typecheck.log`；
`eotion-p114c-runtime-20261019` 的 baseline-full.log、traces、evidence-summary.json；
`eotion-p114c-slash-probe-4490545c75104a6eb13af3f3ec4529b6` 的20条独立repeat事件JSON及stress.log。
Mongo metadata/dbpath/shutdown证据位于JSON指定的各临时目录。Web失败/无效脚手架产物独立保留。
新增HTTP矩阵修后矩阵、完整HTTP/typecheck日志为TEMP的`eotion-timeline-http-matrix.log`、
`eotion-timeline-http-matrix-full-http.log`、`eotion-timeline-http-matrix-typecheck.log`；
63334实例metadata/shutdown位于`eotion-p114c-http-matrix-mongo-9c25ca83c3014ad28c784d3d2934d8d4`。
矩阵首轮错误enum的400日志被重跑成功日志覆盖，未单独留存；该次setup错误只有会话记录，不能
提供其原始日志，也没有补造历史产物。最终成功矩阵与17项HTTP原始日志均可复核。

本轮未重跑完整 Product 其余13文件、sync/file/MCP专项、Web连接真实API全链、Electron/Lynx真机、
生产性能/FPS、正式截图diff或发布；旧轮这些层的既有结果见下文，不混称为本轮运行。

后续只在 C 验收通过后，由独立任务开始 D：本报告、scheduling planner矩阵、generic
cell-mutations/receipt、canonical graph executor与rollback HTTP测试、NodeView active Date/create
adapter及P11.3/B回归是精确入口。P2 connector Enter/Space create 仍保留到 D 或 P11.5，
不在 C 设计键盘 picker。既有 PageView dirty draft 刷新覆盖另立问题，不扩大 C。

## 2026-10-16 原始验收记录（历史 HOLD）

基线 `d662dec83c849ce8d2ec4c09ab566ae72c0fa272`；2026-10-16（Asia/Shanghai）。分支 `codex/p11-4c-auto-shift`，开始工作树干净。版本保持 0.0.1 / build 2；P11 目标 0.0.3 未发布。

**2026-10-16 verdict：HOLD（实现与C专项完成，完整Web回归的两项标题草稿失败归因未闭合）。**
不宣布 P11.4C COMPLETE/PASS，不进入 P11.4D、P11.5 或 P11 Final。功能提交至 `847dcef`，
手势fixture同步 `02cbd98`；最终SHA为包含本报告的交付提交，见交付消息。

### Evidence / Atomicity Gate

开始前读取项目规范、P11 主计划、renderer 架构、P11.3D/4A/4B 验收和任务/交接。现有 generic Cell PATCH 只能单 Cell 独立事务；现有 MCP/sync receipt 不能确认 Database batch。十项门禁决定在编码前冻结于 [Atomicity Design Gate](../exec-plans/p11-4c-atomicity.md)。

新增通用 [Database transactional Cell mutation](../architecture/database-cell-mutations.md)：多 Record、多 Cell 合并，单 snapshot transaction，Database +1、changed Record 各 +1、no-op 不 bump；root Date + cascade、Relation create + cascade 均共享同一次事务。请求携带显式目标的 expected Record version；生成的下游目标使用同事务 canonical Record version。Database/View CAS 与 Property lifecycle/reference fence 同时保护配置及图。

### 冻结调度语义

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

### Web 与 unknown result

pointermove 保留原 root 或 linking line 本地 preview，0请求、0 cascade 预览。active mode release 一次 generic batch，body 只有 root intent 与 pointerdown 捕获的 Database/Record/View CAS；config fingerprint 包含 date source/dependency property/direction/mode/weekend。服务端重新读 canonical policy，Web plan 不受信。

no_auto_shift 和 dependency delete 保留原 PATCH。409 刷新 canonical，0 retry。active batch unknown 仅查询同 mutationId receipt：committed 确认整批，not_committed 确认未执行；uncertain/查询失败刷新后仍只读，不依据一个可见 root 或 membership 猜成功。

### 已执行验证

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

### 回归、review与原始证据

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

### 停止与后续

停在 C/HOLD。必须先解除上述回归门禁。之后 D 精确入口：本报告、pure planner 的行为矩阵、generic cell-mutations/receipt、NodeView 两种 active adapter、canonical integration/rollback 测试；独立验证整个 Dependency 功能，不把 C 专项通过当作 D/P11 Final。

P11.4B connector focusable button 的 Enter/Space create P2 保留到 P11.4D 或 P11.5，不在本轮设计 picker。无 dependency settings、Undo/Redo、multi-select、unscheduled 自动排期、MCP 扩展或版本升级。
