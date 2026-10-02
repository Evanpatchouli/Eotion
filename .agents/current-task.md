# Current Task — Page Action Popovers

## Scope
只调整 PageTree 重命名、移动、删除 UI 呈现，保留 API/store/editor flush/路由和业务语义。

## Work Units
- S0 investigate（主 Agent）：定位表单、Popover、CommandOverlay 与页面回归，完成。
- S2 decide（主 Agent）：每行同一 Popover 切换菜单/表单，删除复用 modal，移动使用自定义 radio 层级列表，完成。
- S1 execute（fast_worker implement）：组件、token 样式、交互文档，完成并由主 Agent 复核。
- S1 execute（fast_worker tests）：业务回归、几何/焦点/关闭行为与截图，完成并由主 Agent 复核。
- S2 diagnose（主 Agent）：修复同一 Popover 菜单切换的事件冒泡误关闭、radio Tab 边界与 pending Esc 焦点恢复，完成并补回归。
- S0 verify（主 Agent）：相关 Playwright、Web typecheck/build、截图与编码检查，完成。
- Review（reviewer）：最终独立复核无剩余 blocker，主 Agent 已复核结论与 diff。

## Validation
- 最终相关套件共 110 项：四并发 108 项通过，2 项交互前初始加载超时；InteractionFoundation/ProductShell 串行复测 19/19 通过。
- PageTree 回归含重命名 Enter/Esc/outside、三操作无位移、Move 当前父级/层级/自身与子孙排除/方向键/Tab、pending 与错误、Delete flush 失败/焦点陷阱/背景点击/取消/路由回退。
- Web 独立 typecheck 与最终生产 build（含 vue-tsc）通过。
- 1440×900 Chrome Desktop 截图已人工核对，页面非空、无 Vite overlay；正常交互截图测试无 console/page errors。
- git diff --check、UTF-8 无 BOM 检查通过。
- 截图：C:/Users/evanpatchouli/.codex/visualizations/2026/10/02/eotion-page-action-popovers（rename.png、move-hierarchy.png、delete.png）。
- 未运行 Electron 宿主或 Mongo/API real-sync 独立环境；real-sync 测试仅同步删除按钮 selector。

提交：fix(ui): move page actions into popovers and dialog
状态：完成（2026-10-02）。
