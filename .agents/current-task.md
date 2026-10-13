# 当前任务：P11.2D Timeline Read Renderer Final Acceptance（核心 PASS，已完成并停止）

基线 `916de4a37cea108497d6d76fa4fe8c24ac1961e7`，包含 P11.2C；开始时 master 工作树干净。
工作分支 `codex/p11-2d-read-acceptance`；正式版本保持 `0.0.1`，P11 目标 `0.0.3`。
只验收已授权的 P11.2 Read Renderer，补齐必要测试/文档及范围内 blocker；完成后停止，不进入 P11.3。

## 工作单元

| 单元 | 认知模式 / 评级 / 角色 | 验收输出 | 状态 |
| --- | --- | --- | --- |
| D1 | investigate / S0 scout | 链路与既有测试覆盖、必要缺口 Evidence Pack | 完成；仅需补同屏坐标与指定切换序列证据 |
| D2 | verify / S0 scout | Domain / Contracts / SDK / 真实 API / typecheck / build 统计 | 完成；48+25+23+22 全 PASS，相关 typecheck/build PASS |
| D3 | decide / S2 主 Agent | 验收矩阵与必要补测/修复 Brief | 完成；无已知范围内 blocker，后续执行降为 S1 |
| D4 | execute / S1 fast_worker | 必要且有行为意义的验收补测；若有 blocker 则单独聚焦修复 | 完成，测试提交 ba1f600；无产品实现修复 |
| D5 | verify / S0 主 Agent | Web Product、identity、浏览器视觉/响应式/scroll/100与500样本、失败基线对照 | 完成；基线230项226PASS/4FAIL，最终231项228PASS/3FAIL，最终独立2PASS/1FAIL；六PNG/三JSON已视检/存档 |
| D6 | review / reviewer | 一次最终独立复核、真实 blocker 与证据一致性 | 完成；最终0 blocker |
| D7 | execute / S1 主 Agent | P11 状态、验收页、current-task、handoff 与独立文档 commit | 完成；文档收口commit即包含本文件的提交 |

## 不变量与停止边界

- 全链路必须由既有 generic records/config 接入，复用 projection/coordinates/layout/Record Host。
- 七 scale local override：0 PATCH / 0 records GET、保 viewport anchor；ruler/grid/bar/today 同 transform。
- 保留 point/range/UTC instant/date-only 语义，unscheduled/invalid fail closed 且保导航。
- Frozen 与 Timeline 共用 row geometry/window/height、Host selection；只 Timeline 横滚、page host 纵滚。
- 验证 Table→Timeline→Board→Timeline 的 Editor/NodeView/Block/Drawer/Host identity 和草稿。
- Desktop 与390px，100/500 cache/window/tick 样本；观察不是最终 benchmark。
- 历史失败完整记录，与未改动基线比较；不跳过、不削弱断言、不隐藏失败。
- 不新增编辑、mutation/drag/resize/dependency/Calendar/Chart，不改数据模型/API/sync/版本/依赖。
- 测试/修复与 acceptance 文档分别聚焦提交；完成后停止，不自动进入 P11.3。

## 起点证据

- HEAD `916de4a` 为 P11.2C 文档收口，包含 `0ed6d0f` Frozen 投影和 `2dfc8b7` UI 接线。
- A/B/C 均为各自范围 PASS；此前完整相关 suite 有 Slash/dialog 和 selection toolbar 失败。
- 三份历史验收已读取，最终结果由本轮 fresh 验证与基线对照决定。

## 验收 Brief（已决定，执行 S1）

- 扩展 `product-database.spec.ts`：七 scale 的 ruler/grid/bar/today 统一 DOM 坐标、80 tick 预算、零网络与 center anchor；普通 scroll/rebase 后复验。
- 保留原 delayed ABA，并明确加入 Table→Timeline→Board→Timeline；保主 Editor、NodeView、Block、Record Host/Drawer/Record editor identity 与草稿。
- 100/500 样本补生产 tick 数；空库/全未排期状态保存新截图，四尺寸/主题组合依现有用例复验。
- 不改产品实现；完全离屏 scheduled 的 indicator/jump 是已记录的未实现 parity，未在本轮八项核心只读范围中新增。
- `docs/p11-timeline.md` 已区分本轮核心 Read Acceptance 与完整 P11 parity，保留所有 deferred 项，不虚报 P11 Final。

## 最终验收证据

- 核心八项完成：Shell、Coordinate、七Scale、Ruler、Grid、Today、Read-only bars、Frozen。
- 指定Table→Timeline→Board→Timeline保Editor/NodeView/Block ID/Host/Drawer/RecordEditor身份与draft；六Record矩阵、48px共享行/双向hover/Host selection、scroll ownership、Desktop/390px均PASS。
- 独立密度表验证七Scale DOM，center偏差0ms、GET1→1、View/Record/所有PATCH0→0；tick25/17/16/20/31/16/20，production预算≤80；cache refs保持。
- Domain48/48、Contracts25/25、SDK23/23、真实隔离Mongo API22/22、相关typecheck/build通过；临时Mongo27714已停止。
- 最终相关Web231项228PASS/3FAIL/0skip/0flaky；Database118/120、Editor44/45、Overlay38/38、Timeline logic28/28。最终失败为fresh基线四失败子集，完整记录于验收页；不能宣称全Product全绿。
- 100/500全部按25条分页，GET4/20、两侧DOM100/17、tick21/ruler10、500窗口[483,500)/总高24000px；累计1733/4113ms含分页/UI/Relation，非最终benchmark。
- 正式记录：`docs/verification/p11-2d-timeline-read-acceptance.md`；测试commit `ba1f6008f45f1679b4ab1d9e357629c86e0d0cc0`。文档收口commit即包含本文件的提交。
- 完成后停止，P11.3未开始。下一轮从P11 Mutation小节、renderer architecture、generic Date service/SDK/CAS接续；不得写回all-day视觉exclusive end或伪造end。
