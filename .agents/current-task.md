# 当前任务：P11.1C Timeline View Config Foundation（PASS，已完成并停止）

正式版本仍为 `0.0.1`，P11 目标 `0.0.3`；不修改版本号。
初始目录工作树干净，但检出为 `bd9e070`；隔离工作树基于 P11.1B PASS 的
`320d2bd930d288a0a33bec5cae62021e15967771`，分支 `codex/p11-1c-timeline-config`。
本轮只执行 P11.1C，提交、验收和交接完成后停止，不进入 P11.1D / P11.2。

| Work Unit | 模式 / 难度 / 角色 | 目标 | 状态 |
| --- | --- | --- | --- |
| C-1 | investigate / S0 scout + 主 Agent | 定位真实 Domain/Contracts、View CRUD/CAS/generic records、Web routing 与现成验证设施 | 完成：CRUD/query 已传 view.type；linkInPage 仍只允许 Table |
| C-2 | decide / S2 主 Agent | 冻结 options.timeline 判别联合、结构/语义分层及 D 的明确边界；形成 Implementation Brief | 完成；执行降为 S1 |
| C-3 | execute / S1 fast_worker | 四种 View 类型、Timeline validator、Contracts 与定向回归 | 完成：48/48 + 25/25；主 Agent 复核，commit `57121c7` |
| C-4 | execute / S1 fast_worker | 复用 View CRUD 与 generic records，真实 Mongo 往返/CAS/cursor/引用回归 | 完成：新增 targeted 2/2；最终相关 API 21/21；commit `94336f7` |
| C-5 | execute / S1 fast_worker | Web Timeline 明确占位分支、保留 selector/switch 与 P8/P9 回归 | 完成：6/6，typecheck/build；commit `ceb4d5d` |
| C-6 | verify/review / S0 scout + reviewer + 主 Agent | 测试/typecheck/build/diff/UTF-8、一次独立复核、契约/验收/交接与聚焦提交 | 完成：SDK 23/23、相关 typecheck/build PASS、独立 review 0 blocker；文档/交接收口 |

硬边界：沿用现有 Database/Property/Record/View、DTO、集合、在线写入与事务/CAS。
允许 Timeline 未配置 dateSource；仅原生 Date、同库 self-relation、稳定 Property ID。
Frozen Table 独立投影且保留 Title；未知 options 保留；不改变 Table/List/Board 语义。
不实现 Timeline 创建 UI、日期解析/条几何/编辑、依赖图/自动 shift、冻结表格 renderer。
完整 Property lifecycle hard/soft reference fence 留给 P11.1D，不将 generic records
fail-closed 宣称为 mutation 防护；不提前改动既有 Linked View 类型规则。

正式冻结位置：`docs/p11-timeline.md` §21；验证与交接已写回以下入口。

## Implementation Brief（C-2 决策）

- 采用用户建议的 `options.timeline` 原样结构：`dateSource` 是 `date-property` /
  `start-end` 判别联合；`scale` 七值；`frozenTable` 的三个字段完整出现；
  `dependency` 的四个字段完整出现。所有对象严格拒绝额外字段和显式 undefined。
- 新增导出的 `TimelineViewOptions` / Timeline config 类型与纯 shape validator。
  已知命名空间 `options.timeline` 一旦出现即按严格结构验证，保证既有
  Create/Update Zod config 入口拒绝坏结构；`options` 外层未知字段仍原样保留。
- 需要 Properties 的语义仅在 `viewType === 'timeline'` 应用：Date source 仅引用
  当前 scope 原生 date；start/end 不同；dependency 必须同库 relation；Frozen Table
  两个数组按现有限额/稳定 ID/去重规则，visibleProperties 非 null 必须含 Title。
  Table/List/Board 不应用 Timeline 引用语义；Board grouping 原校验独立保留。
- effective scale 缺省为 month，导出默认常量；不把默认写入 config，不自动选择 Date。
  顶层 visibleProperties/propertyOrder 是 bar projection，Frozen Table 独立保存；
  visible=false 不清空列。PropertyOrder 沿用现有可省略部分列的语义。
- dependency.shiftMode 仅允许 §14.3 的 `shift_when_overlapping`、
  `shift_and_keep_gap`、`no_auto_shift`；不得引入另一套枚举或自动联动实现。
- API/Repository 无需新增实现或路由：Create/Update/query 已用真实 view.type，Mongo
  enum 复用常量。用新真实测试证明往返、版本/CAS、分页/cursor、无 Record 改写。
- linkInPage 的 Table-only 规则保持；Linked Timeline 后续入口是该方法类型门禁。
- Web 仅在 list/board 与 Table 分支间加入明确 Timeline 未实现状态；不增加创建或
  Timeline 专用设置。通用 View selector、实际可用的通用 Filter/Sort/CRUD 保持。
- D 精确入口：DatabaseService updateProperty/changePropertyType/deleteProperty 的
  事务内 View repair 循环及三处未传 view.type 的 validator；补 hard/soft reference
  分类、事务检查/回滚和竞态。C 不修改这三处以免误称 lifecycle 已完成。

## 验证与交接

Domain 48/48、Contracts 25/25、SDK 23/23；真实隔离 Mongo 8.2.3 API 21/21（含
nested，0 failed/skipped），新增 targeted 2/2 是该全套子集。Web 定向 6/6，
workers=1/retries=0（1 新增、2 扩展既有、3 Board 回归）；相关 typecheck/build、
最终 diff/UTF-8 无 BOM 通过。主 Agent 检查 390px 占位截图，独立 review 0 blocker。
临时 Mongo 已正常 admin shutdown，PID 19700 退出、27712 无监听；Web 7173 无监听。

实际契约：`docs/p11-timeline.md` §21；完整证据和命令：
`docs/verification/p11-1c-timeline-view-config.md`；跨会话接续：`.agents/handoff.md`。
未运行完整 Web Database/Product、MCP/performance/sync/file 全套、Desktop/Lynx
原生真机或完整 Visual/Final Acceptance，不虚报这些项通过。

P11.1D 入口仍为 service 327/385/476 行的 Property mutation；376/465/520 行三个
repair validator 未传 view.type。D 需完成 hard reference 409、soft reference 修复、
Relation retarget 与事务/CAS/rollback/并发。linkInPage 161 行保持 Table-only。
本轮已停止，不自动执行 D 或 Timeline renderer。
