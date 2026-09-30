# Current Task — P5.7 Design First / Next: P5.7.1 Audit

P5.6 Settings & Preferences 已 PASS（2026-10-01）。产品版本保持 0.0.1 / build 1。

当前不进入 P5 Final Acceptance。用户决定先完成 P5.7 UI/UX Foundation & Product Redesign，以尽早冻结 Eotion 的正确 UI/UX 基调和 Design System。

## Current phase

P5.7.1 — UX / Visual Audit。

主计划：`docs/p5-ui-ux-foundation.md`。

设计工作区：`docs/design/README.md`。

当前工作表：

- `docs/design/ui-ux-audit.md`
- `docs/design/design-direction.md`
- `docs/design/design-system-v1.md`
- `docs/design/core-screen-spec.md`
- `docs/design/visual-acceptance.md`

## Hard gate

P5.7.1～P5.7.4 是 Design First 阶段。

在用户明确批准以下内容前，不得修改正式 Product UI：

1. Design Direction。
2. Design System v1。
3. 核心高保真页面。

批准后才进入 P5.7.5 Implementation。

## Current constraints

- 不新增业务功能。
- 不进入 P6 MCP / Agent。
- 不创建 HarmonyOS / Android / iOS 原生 UI。
- Morphicons 图标体系继续保留。
- P5.1～P5.6 已验收的功能、安全、Local-first、附件与 Settings 行为不得因未来视觉重构回归。
- P5.4 Mobile WebView/Lynx 真机完全离线重启仍保留为既有待验收边界。

## Next action

只执行 P5.7.1 UI/UX Audit：收集正式 Surface 当前截图、建立问题清单、识别可删除 UI、保留项和优先级；不要改正式 UI 代码。
