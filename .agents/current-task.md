# Current Task — Page / Workspace Context Menu

## Work Units
- S0 investigate：Scout 调查现有 fixture / 回归入口；主 Agent 检查 Popover 与两处菜单。
- S2 decide（主 Agent）：复用 EotionPopover，添加可选 context 定位与单实例互斥；Page 保留既有业务动作，Workspace 改为独立 trailing More 按钮。
- S1 execute：Fast Worker 修改 UI；主 Agent 复核并补充交互回归、定位器迁移与契约文档。
- S0 verify：Scout 执行 typecheck / build、PageTree / ProductShell 及相关业务回归；主 Agent 核对 Desktop 截图、编码和 diff。
- Review：独立 reviewer 复核，主 Agent 检查结论并提交。

## Scope
只改浮层展示与触发，不改数据、路由、Editor、存储、同步、API 或菜单业务。
提交：fix(ui): use context menus for page and workspace actions

状态：完成（2026-10-02）；独立 reviewer 未发现 blocker，主 Agent 已复核最终 diff。

## Verification
- Web typecheck 与最终 build（含 vue-tsc）通过。
- ProductShell / ProductPages / ProductFlow / UiFoundation / InteractionFoundation / ProductEditor / ProductSync / ProductAttachments 共 122 项回归最终通过。首轮 117/122，5 项旧 Workspace 整行按钮文本 locator 更新为可见名称后，ProductFlow 重跑 10/10 通过。
- 最终 context-menu 定向 2/2 通过，包含 click、行右键、菜单互斥、outside/Esc、导航隔离、布局不位移、角落边界与 viewport 高度 844→600。
- 1440×900 Desktop Light 两态截图人工核对；390×844 Mobile 行为通过；页面身份、非空渲染、Vite overlay 与 console/page errors 检查通过。
- 截图：C:/Users/evanpatchouli/.codex/visualizations/2026/10/02/eotion-context-menu。
- Browser plugin not available，使用仓库 Playwright + Chrome；Electron 宿主、真实 API/数据库与 real-sync 配置未单独运行。
- git diff --check 与 UTF-8 无 BOM 验证通过。
