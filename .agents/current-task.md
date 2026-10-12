# 当前任务：P9.3B-1 — View Selector Integration（已完成）

基线 `38b3ac54c43b30cef918641b8afa7599f81441b8`；P8 COMPLETE / SEALED，P9.1A、P9.2 与 P9.3A 已完成。目标 8–20 分钟，25 分钟硬停止。

| Work Unit | 难度 / 模式 / 角色 | 状态 |
| --- | --- | --- |
| 精确定位 View Selector / DatabaseView API / product service / UX tests | S0 investigate / 主 Agent | 完成 |
| 判断既有 selector 与 P9.3A renderer 的最小集成边界 | S1 decide / 主 Agent | 完成 |
| Table + List selector / block reference / nested / Phone targeted tests | S1 execute / 主 Agent | 完成 |
| targeted product tests、Web typecheck、diff / lifecycle review | S0 verify / 主 Agent | 完成，无 blocker |
| 文档、handoff、聚焦提交与汇报 | S1 execute / 主 Agent | 完成 |

边界：只接入既有 View Selector 与 P9.3A Table/List renderer。复用 `listDatabaseViews` 的 server DatabaseView 列表、既有 `viewId` block reference、`DatabaseNodeView` loading/refresh lifecycle 和 Phone header breakpoint；不创建/删除/重命名 View，不创建新 Database Block，不修改 `databaseId`、Page tree、Page snapshot、Database domain、Board、Calendar、Gallery、MCP 或 Local-first。Table DOM 与交互保持原样。

最小验证：View Selector targeted product tests（Table + List、nested、Phone、lifecycle）；Web typecheck；`git diff --check`。完整 Product / Visual / Final Acceptance 不运行。

Implementation Brief：View Selector 继续从 `listProductDatabaseViews()` 读取 server DatabaseView entity，当前项由 block attrs `viewId` 高亮；点击只调用现有 `switchView()` 更新该 Database Block 的 `viewId`，不改变 `databaseId` 或页面结构。新的 viewId 由既有 watch 触发 records reload，响应中的 `view.type` 决定 Table/List renderer；selector 关闭、Editor/NodeView identity 与 nested sibling 保持。Phone 继续使用既有两行 header，不新增 breakpoint。

验证：View Selector integration、Phone selector、既有 View lifecycle、List renderer、long-name Phone header 共 5/5 通过；`pnpm --filter @eotion/web typecheck` 通过；`git diff --check` 通过。未运行完整 Product、Visual、Final Acceptance；未改 lockfile。

P9.3A 历史 Context：List renderer 已按 `view.type === 'list'` 局部渲染，Table renderer 未重写、未删除、未改 DOM；本轮不重复实现。P9.3B-1 只验证并固化既有 selector 集成，不开始 Create/Rename/Delete 或 Board。完成一个聚焦 commit 后停止。
