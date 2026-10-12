# 当前任务：P9.5C-2 — Board Grouping Settings（已完成）

基线 `bfe51bf85ada8677b7e26cd504366097d217c12d`；P9.5C-1 PASS / SEALED。目标 8–20 分钟，25 分钟硬停止。

| Work Unit | 难度 / 模式 / 角色 | 状态 |
| --- | --- | --- |
| View Settings / 保存链路调查 | S0 investigate / 主 Agent | 完成 |
| Board-only grouping UI 与 config merge | S1 execute / 主 Agent | 完成 |
| targeted tests、typecheck 与相邻回归 | S1 verify / 主 Agent | 完成；3/3 + 13/13 |
| 文档、handoff、diff 与停止 | S1 execute / 主 Agent | 完成 |

Implementation Brief：`DatabaseNodeView` 的既有 Database Settings 菜单只在 Board View 显示“分组属性”，复用 `DatabaseSettingsSelect` 与现有 Overlay；候选严格为当前 Database 的 `type === 'select'` Property，含“未设置”。保存复用 `saveViewConfig()` → `updateProductDatabaseView()` 与双版本 CAS；只增删 `config.options.groupByPropertyId`，保留 filters/sorts/visibleProperties/propertyOrder 与未知 options。`saveViewConfig()` 按当前 `viewType` 校验 Board grouping；`loadedViewIdentity/viewReady` 防止 View 切换异步加载期间把旧 Board 设置写入目标 Table/List。清除 grouping 不改 Record；Table/List 不显示入口；无 Select 可打开但不报错；Phone 使用既有 bottom drawer；离线 selector/保存不可写；409 使用既有 conflict refresh。

验证：`pnpm --filter @eotion/web typecheck` 通过；新增 grouping targeted 5/5 通过（含 Board→Table/List 延迟切换）；相邻 View settings / Board / Table/List / Phone / snapshot 回归 13/13 通过（workers=1，retries=0）；`git diff --check` 通过。未运行 Full Product、Visual Acceptance、Final Acceptance；未改 Board renderer/drag、Record mutation、API、Domain、MCP 或 local-first。完成后停止。
