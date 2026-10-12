# 当前任务：P9.3A — List View Renderer Foundation（已完成）

基线 `3a502aa53725b4e44d392c14ae592cb605513be6`；P8 COMPLETE / SEALED，P9.1A 与 P9.2 已完成。目标 8–20 分钟；本轮在范围内完成并停止。

| Work Unit | 难度 / 模式 / 角色 | 状态 |
| --- | --- | --- |
| 精确定位 DatabaseNodeView / Table / product loading / tests | S0 investigate / 主 Agent | 完成 |
| List renderer 边界与最小分支设计 | S2 decide / 主 Agent | 完成 |
| `DatabaseListView` 与 `DatabaseNodeView` 分支 | S1 execute / 主 Agent | 完成 |
| List / Table / Phone targeted validation | S0 verify / 主 Agent | 完成，无 blocker |
| 文档、handoff、聚焦提交与汇报 | S1 execute / 主 Agent | 进行中 |

边界：只实现 List View renderer。复用既有 Database、DatabaseView、Properties、records、Filter/Sort、visibleProperties、propertyOrder、record opening 与 loading/refresh lifecycle；不创建新 Database 模型，不复制 Table inline edit，不实现 View Selector、View creation/management UI、Board、Calendar、Gallery、MCP、Local-first 或 Database domain changes。Table DOM 与交互保持原样，不新增 breakpoint。

最小验证：Web typecheck；List targeted product test；既有 Table root/nested、Phone responsive test。完整 Product / Visual / Final Acceptance 不运行。

Implementation Brief：父组件继续负责统一 records load / pagination / refresh / title projection / relation title resolve；成功响应写入 `viewType`，仅在 `list` 时渲染新 `DatabaseListView`。子 renderer 只接收 records/properties/config/formatValue，通过 `visibleProperties` 与 `propertyOrder` 计算 title + detail properties，title click 复用父组件 openRecord handler。`visibleProperties === null` 默认展示最多三个非 title 属性；Phone 只使用既有 `<768px` 断点。

验证：`pnpm --filter @eotion/web typecheck` 通过；List targeted 1/1；既有 Table root/nested 1/1；Phone Table overflow 1/1；`git diff --check` 通过。首次测试受缺失依赖阻断，按 Web workspace frozen install 恢复后重跑通过；未改 lockfile。未运行完整 Product、Visual、Final Acceptance。

Table renderer 未重写、未删除、未改 DOM；generic records/product loading flow 复用。未发现 P9.4 Board blocker；本轮完成一个聚焦 commit 后停止。
