# 当前任务：P9.5B-1 — Board Card Mutation Foundation（已完成）

基线 `90f8d9d0fe0db4030cbd588881298f0c5d7cab23`；P8 COMPLETE / SEALED。仅显式修改 Card grouping select value，目标 8–20 分钟，25 分钟硬停止。

| Work Unit | 难度 / 模式 / 角色 | 状态 |
| --- | --- | --- |
| 既有 record mutation、renderer、local/sync 边界定位 | S0 investigate / 主 Agent | 完成 |
| 显式 picker、成功 refresh 与失败保留方案 | S2 decide / 主 Agent | 完成，执行降级 S1 |
| Board picker 与既有 cell mutation 接线 | S1 execute / fast_worker | 完成 |
| A–F targeted tests | S1 execute / fast_worker | 完成 |
| targeted 验证与一次独立 review | S0 verify / 主 Agent + reviewer | 完成 |
| 文档、handoff、聚焦 commit 与停止 | S1 execute / 主 Agent | 完成 |

Implementation Brief：复用 DatabaseSettingsSelect，受控显示已确认 select option ID；emit record ID/option ID 由父组件复核当前 Board/select/option/writable/scope。只调用 updateProductDatabaseRecordCell，携带 Database/Record CAS。成功复用数据库更新事件与已加载窗口 refresh；失败保持 records/config，显示 mutationError。保持 Editor/NodeView/Drawer/draft identity。禁止 Drag、optimistic/rollback、offline mutation、Board API、position/WIP/customization/MCP；不跑 Full Product/Visual/Final Acceptance。
验证：新增 mutation targeted 5/5，既有 Board/Table/List/Phone/snapshot/cell failure targeted 10/10（最新代码复跑）；Web typecheck、diff check、UTF-8 无 BOM 通过。独立复核的旧 CAS 重试问题已用显式刷新入口修复，并有409→刷新→新版本重试覆盖；无剩余 blocker。没有 scope-external failure，未运行 Full Product/Visual/Final Acceptance。完成一个聚焦 commit 后停止。
