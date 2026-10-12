# 当前任务：P9.5B-2 — Board Drag Mutation Foundation（已完成）

基线 `23f3b0a1c0a232309611709632633f4a817d7545`；P9.5B-1 PASS / SEALED。目标 8–20 分钟，25 分钟硬停止。

| Work Unit | 难度 / 模式 / 角色 | 状态 |
| --- | --- | --- |
| mutation / event / renderer 行为定位 | S0 investigate / 主 Agent | 完成 |
| nullable grouping 与 deferred refresh 方案 | S2 decide / 主 Agent | 完成，执行降级 S1 |
| HTML5 drag、picker null、refresh 合并 | S1 execute / fast_worker | 完成；Web typecheck 通过 |
| targeted 请求计数与产品回归 | S1 execute / fast_worker | 完成，最终组合 15/15 |
| 一次独立复核与必要验证 | Review / reviewer + S0 | 完成；无 blocker，typecheck/diff/UTF-8 通过 |
| 文档、handoff、聚焦 commit、停止 | S1 execute / 主 Agent | 完成，聚焦提交后停止 |

Implementation Brief：Board 组件只保存本组件 drag session 与目标高亮；总是提供未分组 drop target。Drag 与 picker 都 emit recordId / string|null；父组件验证 Board/select/option/Record/可写状态、规范化当前分组做 no-op。复用 updateProductDatabaseRecordCell / cells PATCH / Database+Record CAS / scope identity。Board savingCell 期间 database events deferred；成功显式 refresh 前消费已有 pending，刷新期间的新事件完成后 drain。失败不改 records，不自动覆盖409。禁止 optimistic/rollback、position/reorder、新 API/依赖/全局事件、MCP/local-first；不运行 Full Product/Visual/Final Acceptance。

验证：最终 targeted 15/15，workers=1 / retries=0；原生 drag、唯一 cells PATCH/CAS、pending 原列保留/null/no-op、失败409显式刷新重试、正常成功只增加一次 Board records GET、读取期间 external event 继续补刷、linked Table/List、Phone picker/layout、Editor/NodeView/Drawer/title draft 与 snapshot 均覆盖。独立 review 无 blocker。中间一次 draft 断言出现原标题，随后单独及最终组合通过，原断言保持；测试 route 计数时机和 URL matcher 已修正，无产品范围外修改。未运行 Full Product/Visual/Final Acceptance。
