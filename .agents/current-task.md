# 当前任务：P9.3B-2 — Create List View（已完成）

基线 `a9217b6496ce3d97f6f3999055c081fab5deb488`；P8 COMPLETE / SEALED，P9.1A、P9.2、P9.3A 与 P9.3B-1 已完成。目标 8–20 分钟，25 分钟硬停止。

| Work Unit | 难度 / 模式 / 角色 | 状态 |
| --- | --- | --- |
| 检查 DatabaseNodeView、View Selector、DatabaseView API、product service 与既有 create flow | S0 investigate / 主 Agent | 完成 |
| 确认复用 create DatabaseView API、默认 config 与 block viewId 生命周期 | S1 decide / 主 Agent | 完成 |
| 增加 Table/List 创建入口并保持 Table 兼容 | S1 execute / 主 Agent | 完成 |
| targeted product tests、Web typecheck、diff / lifecycle review | S0 verify / 主 Agent | 完成，无 blocker |
| 文档、handoff、聚焦提交与汇报 | S1 execute / 主 Agent | 完成 |

边界：View Selector 保留既有“新建视图”Table 流程，新增“新建列表视图”List 流程。两者均创建新的 DatabaseView，复用 `createProductDatabaseView()` / `POST .../views`，传入 `DEFAULT_DATABASE_VIEW_CONFIG`；不复制 Database、不创建新的 Database Block、不修改 Page Tree、Page snapshot、`databaseId` 或 Database domain。创建成功后只通过既有 `switchView()` 更新当前 block 的 `viewId`，由既有 watch reload 并进入 Table/List renderer。Rename/Delete、View settings、Board、Calendar、Gallery、MCP、Local-first 不在本轮。

修改：`apps/web/src/components/editor/DatabaseNodeView.vue` 支持 `type: 'table' | 'list'` 创建并增加 List action；`apps/web/tests/product-database.spec.ts` 让 create mock 保留请求 type，并新增 List create targeted regression；`docs/p9-multi-view.md` 写回本阶段契约。

验证：`pnpm --filter @eotion/web typecheck` 通过；View create Table 回归、List create、Table/List selector、Phone selector、List renderer 共 5/5 通过；`git diff --check` 通过。未运行完整 Product、Visual、Final Acceptance；未改 lockfile。

完成后停止，不继续实现 Rename/Delete、Board、MCP 或 Local-first。
