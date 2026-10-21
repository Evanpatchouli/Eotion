# 当前任务：P11.6 时间线创建与日期配置漏项已补齐（Scope PASS）

## 2026-10-21 用户授权的新工作

补齐正式 Timeline 创建入口与日期属性配置，从正式 UI 验证创建、使用、刷新恢复，补回归并写回 P11.6 报告。P11 Final 既有 HOLD 保留；不升级版本或发布。

Work Units：
- S0 investigate：定位创建/配置 contract 与可复用 UI（scout）。
- S0 investigate：定位产品回归和隔离真实 API/Mongo E2E 基础（scout）。
- S2 decide：主 Agent 冻结最小 UI、日期源配置和 identity/CAS invariant。
- S1 execute：按 Brief 实现入口与配置、回归测试及报告。
- S0 verify：定向回归、typecheck/build、正式 UI 全链路。
- Review：最终一次独立复核；按独立逻辑单元提交。

实施与验证已完成：正式菜单创建、日期源单列/双列配置、显式新增日期、已有 Timeline 日期编辑；
复用 View CRUD/CAS，保留 options；补 unknown 同 ID 恢复和 offline/late response fence。
真实 E2E 发现并修复新建 Database 临时只读导致 viewBusy 非响应式缓存，已有 observer ref复用。
产品定向12/12及旧创建菜单补充8/8、真实构建 Web/API/Mongo E2E 1/1（R5/R6均PASS）、Web typecheck/build、API build通过。
证据位于 docs/verification/evidence/p11-6-timeline-entry/；隔离Mongo与API/Web已关闭，用户Vite保留。
正式报告顶部记录漏项、红绿证据、补验边界；原P11.6 HOLD和0.0.1/build2保持。
最终独立review已完成，无新增P1/P2 blocker；实现提交03bfd6d，文档与证据独立提交，无版本升级/推送/发布。

以下为前次验收历史记录。

## 最后用户指令：提交并推送已验收成果

用户在HOLD汇报后明确授权提交/推送并重组最终汇报。按实现98ba631、视觉893e8e8、文档证据
三个逻辑单元保存；版本0.0.1/build2和P11.6 HOLD不变，不发布。最终交付SHA以包含本记录的
文档提交及最终回复为准，推送后核对HEAD=origin/master且工作树干净。以下“不提交/dirty”
是授权前历史状态，不能作为当前禁令。P10及两个启动问题仍未解决，不得宣称Final PASS。

## 2026-10-21 最终交付状态（以下过程按历史保留）

完整R5：Product505/506（1FAIL）、独立Database249/249、Visual13/13、logic/theme92/92；
worker1/retries0、skip/flaky0。Web/API typecheck/build、后端分层242/242及version check通过。
四旧视觉分别裁定C、C+B、C+B、C并仅更新对应四图；P11.5历史9/13保留。
Offscreen与最低未排期安排已补齐。AF竞态和dirty标题覆盖产品缺陷均已修并有红绿回归。
R5唯一失败为启动必需module ERR_NO_BUFFER_SPACE、App未mount；该次阶段已定位但资源来源
未定，R1无trace白屏仍独立unknown，不冒称同因或已修。P10缺失按用户裁定继续Final HOLD，
不扩展P10/P15。最终17项矩阵/原始证据见docs/verification/p11-6-timeline-final-acceptance.md。
临时Mongo、Vite与runner均退出，指定临时端口无监听；用户Mongo未触碰。
版本0.0.1/build2；master/ff0901c，未提交改动保留；不提交/推送/发布/进入其他阶段。
最终独立review与Git审计在验收报告顶部记录。只有用户后续明确指示才继续处理HOLD。

## 2026-10-21 恢复执行

前一R3在18/503已记录通过后中断，Product无最终summary；typecheck/build/logic92已完整，
不把部分Product计完整门禁，原因未知，原日志归档final-web-r3-interrupted。旧自有进程恢复时已
不在，7173/7176/55479均无监听；用户Mongo服务不触碰。新自有Vite7173/PID33692独立启动。
Chrome外部更新155.0.8059.85→156.0.8078.47，原preflight正确阻断。TEMP两轮诊断26PASS非正式gate；
13actual重复稳定，四已更新图与155golden精确同；六Timeline对155实际图一张同、五张各1pixel且
strict0，Mobile旧golden差为已审offscreen变化。另3旧图RGB/BGR RAM诊断strict残差0，无直接155raw，
不声称完全同或156新增。主Agent逐图审13actual及5三联，独立review认可仅更新环境browserVersion，
不改任何PNG/阈值/flags。R4现按正常preflight从头完整6gate运行，Product503/Database246按实计。
P10缺失及一次未归因首屏white仍Final HOLD；不commit/push/升级/发布。

## 2026-10-20 用户续推授权

优先解决四旧视觉差异及完整Product/Database失败，再补Timeline内未排期安排。
用户已明确：P10缺失仍须列Final HOLD；本轮不扩展工具。版本0.0.1/build2不变，全部强制门禁和独立review认可前不commit/push/publish。
接续工作树保留上轮改动，HEAD仍ff0901c；不覆盖历史红证据。

| 续推单元 | 认知 / 等级 | 产出 |
| --- | --- | --- |
| R1 | investigate / S0 | 旧视觉glyph因果证据、环境复现与逐项裁定，不重复无结论GPU实验 |
| R2 | investigate / S0 | Product编辑/选区/持久化共同根因、布局与About独立问题 |
| R3 | decide / S2 主Agent | 按真实证据冻结最小修复Brief，执行再降S1 |
| R4 | execute / S1 | 视觉/产品测试阻断修复；随后补未排期安排，复用generic CAS/atomic policy/receipt |
| R5 | verify / S0 | 定向红绿后完整Product/Database/visual及相关后端、build/typecheck/version，不拼接全绿 |
| R6 | review / 独立reviewer | 一次末态review、证据/矩阵更新与服务清理；全满足前保留未提交 |

新TEMP证据根：`C:/Users/31250/AppData/Local/Temp/eotion-p116-resume-dfbb4269eb4c4a6794279c34f3d9ba5d`。

续推最新：四visual已逐项C/B裁定并精准更新4图，完整13/13；未排期安排10例及真实HTTP空值
级联/回滚通过，backend242/242已停Mongo。R1完整Product495/496、DB238/239；R2完整
Product494/496、DB239/239、visual13/13，红历史全保留。白屏原因未知，current/baseline各单1+
fullsync42通过也不称已修。R1 coarse坐标过期加trial ready；R2 coarse实际是Escape关闭setup，
已改现有关闭按钮tap；均不放宽手势断言。R2还真实捕获title输入被双RAF autofocus抢到body。
产品focus guard已apply PageView/EotionEditor/Overlay+私有scope helper；7新回归旧代码2PASS5FAIL→
新代码7PASS，原identity/coarse各repeat3合6PASS，Web typecheck通过，相关scope验证进行中。
下一步final-web-r3完整6门禁（新增7后预期Product503/Database246，按实际计数），独立终审及清理。
7176已关闭，7173自有listener PID53028仍运行；P10缺失及未归因白屏仍Final HOLD，不提交推送。

## 前次验收：HOLD（保留原始结果）

起始 master / HEAD / fetch 后 origin/master：`ff0901c7545c9bc1addad9114cc1d41492a52eb3`；工作树干净。
版本冻结 0.0.1 / build 2；只在所有强制门禁及独立 review 满足后提交推送，结束后停止。
不更新版本、依赖或 lockfile，不创建 tag/Release，不访问用户数据库。

| 单元 | 模式 / 等级 / 角色 | 产出与顺序 |
| --- | --- | --- |
| U1 | investigate / S0 scout + 主 Agent 图像复核 | 四组原三图均已逐项视检；正式repeat2稳定8FAIL，Mobile toolbar/Desktop Settings部分B已证，余字形C未定，各项HOLD，无快照更新 |
| U2 | investigate / S0 scout | §24缺口：offscreen未实施；Unplanned无Timeline内安排，Table workaround不算；grouping/行重排用户已明确后置 |
| U3 | decide / S2 主 Agent | 报告内Brief冻结；复用既有coordinates/viewport/row window，不改持久模型/调度/API |
| U4 | execute / S1 fast_worker | Offscreen已实施；3/3定向+角点增补1/1/typecheck通过，三项新增focus/touch P2修复并独立复核；生产代码已冻结 |
| U5 | verify / S0 scout + 主Agent接续 | 正式完整Product476/486、独立Database226/229、visual9/13，均workers1/retries0；生产theme2/2、后端全门禁、Web/API typecheck/build/version通过；12唯一失败current4/12、ff5/12，定向不替代完整结果 |
| U6 | review / reviewer + 回退独立reviewer + 主Agent | 三新P2已闭合，最终独立终审认可HOLD、无新确定代码P1/P2或报告blocker；四视觉、Unplanned、P10前提及完整门禁失败仍HOLD；按提交门禁未commit/push，版本0.0.1/build2 |

本轮临时证据根：`C:/Users/31250/AppData/Local/Temp/eotion-p116-c91e3284da1d43a4a12362d3f2d4e690`。
P11.5 原始9/13保留，不继承例外。详见 `docs/verification/p11-6-timeline-final-acceptance.md`。
2026-10-20收口：HEAD/origin/master均ff0901c，工作树保留本轮未提交改动（不满足用户提交条件）。
自有Mongo54463与Web7173均已关闭，7173/7176/4175/54463无监听；证据见报告与git-final/service-cleanup JSON。
停止在P11.6 HOLD，不升级、不tag/Release、不进入其他阶段。

## 历史：P11.5 Responsive + Visual Polish — COMPLETE / PASS（Scope，用户接受旧视觉例外）

基线（2026-10-19）：master，fetch后HEAD/origin/master均为
`a94f0cc4ee7dfd994b5073370f15bef23b49393c`，工作树干净；0.0.1/build2不变。
仅P11.5，完成后停止，不启动P11.6/tag/Release。

| 单元 | 模式 / 等级 / 角色 | 验收 / 状态 |
| --- | --- | --- |
| U1 | investigate / S0 scout | renderer触控布局Evidence Pack；完成 |
| U2 | decide / S2 主Agent | 下列Brief；已冻结 |
| U3 | execute / S1 fast_worker | 实施完成，含Bar主题几何/状态断言6/6；末修后加原B真touch与D键盘合8/8 |
| U4 | execute / S1 fast_worker | 六新图PASS；Tablet与Phone末修均先看live actual再最小更新；最后visual9/13，旧4与a94 actual字节相同 |
| U5 | verify / S0 scout + reviewer | logic/theme92/92、typecheck/version通过；最终production build+2theme通过；完整三批224/226、225/226、226/226均保留；末修P2已独立复核修复，0新增未修P1/P2 |
| U6 | execute / S1 主Agent | 用户明确接受旧4视觉例外并回复“提交”，已授权分单元提交推送；实现363ac66、视觉721e139，最终文档SHA/远端/干净工作树见交付核对；测试端口均已停 |

2026-10-19用户确认：在明确询问是否接受四项已证旧视觉差异为例外并提交推送后，回复
“提交”。据此P11.5 Scope PASS，自动visual仍9/13，不更新旧七图；P11.6不启动。

## P11.5 Implementation Brief（修改前）

- 原生横滚、共享row geometry、48px行/32pxBar、44px触控point及Frozen<=700px
  仅标题列已存在。保留单renderer/P9 fence/持久配置。
- Header的420px窗口媒体查询改为Timeline root container query；紧凑时period
  独占一行，navigation与scale同一行且互不挤压。
- 初始真实PNG证明Month36px minor ticks被完整月日标签覆盖；minor day改locale日号，
  标签宽度约束在tick内，保留major年月、tick边界/密度/geometry/budget。
- dependency管理26px与未排期打开32px可在coarse下扩大；日期handles 10x32px、
  connector28x20px先保留仲裁，避免覆盖Bar主入口/相邻行，记录例外及真实touch命中。
- generic Database继续拥有首次loading/error/retry/offline与staleReadonly；
  refreshLoadedWindow保留已有DOM，补充受现有requestEpoch保护的轻量刷新提示。
  不造loader服务，不改变receipt三态/零重试。
- 复用Quiet Studio token；主题不改几何/状态。真实浏览器核对原生底部scrollbar，
  需要时补充可见样式。禁止Domain/Date wire/Relation/API/SDK/MCP/版本/标题同步改动。

验收：1440x900、1024x900、390x844、360x800的Light/Dark，手机hasTouch/isMobile及
pointer:coarse；navigation/scale/scroll/无全页overflow/Frozen同步/配置不变/主题几何不变。
touch覆盖tap open、move/resize提交取消、connector创建、line单次选择删除、短Bar/point/
相邻行/边缘命中及清理。状态覆盖loading/refresh/reconnect/空库/全未排期/混合/error/retry/
offline/pending，既有C/D回归继续保护receipt与staleReadonly。

视觉6张：Desktop L/D、Tablet L、Phone L/D、空或未排期；固定时间/zh-CN/Asia-Shanghai/
reduced-motion，先检视PNG再建立最小基线。既有7张基线不更新。自动比图、功能测试、Agent
视检分列。最终完整Database单worker零重试一次运行并保留原始日志，全部Timeline logic/
P11.3/4专项、visual/theme、typecheck/build/version/diff及独立review；不启动Mongo/P11.6。

## 历史：P11.4D Dependency Final Acceptance — COMPLETE / PASS（Scope）

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
