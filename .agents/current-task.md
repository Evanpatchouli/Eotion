# Current Task — P5.7.2 Stitch Design Brief & Direction Exploration

P5.6 Settings & Preferences 已 PASS（2026-10-01）。产品版本保持 0.0.1 / build 1。

P5.7.1 UI/UX Audit 已 PASS（2026-10-01），见 `docs/design/ui-ux-audit.md`。

当前不进入 P5 Final Acceptance，也不修改正式 Product UI。

## Current phase

P5.7.2 — Stitch Design Brief & Direction Exploration。

主计划：`docs/p5-ui-ux-foundation.md`。

当前设计输入：

- `docs/design/stitch-design-brief.md`
- `docs/design/ui-ux-audit.md`

等待探索后填写：

- `docs/design/design-direction.md`
- `docs/design/design-system-v1.md`
- `docs/design/core-screen-spec.md`

## Current action

使用 Stitch 对**同一个 1440×900 Desktop Page 场景**进行至少 3 个视觉方向探索。

要求：

- 功能内容完全一致，只比较视觉语言与 interaction presentation。
- 必须解决 Audit 中的核心问题：Editor giant card、Sidebar collapse、Workspace/Page inline menus、状态重复、附件 document integration。
- 展开 Sidebar 右上/右下圆角。
- 中文 Slash Menu 不做中英双语重复。
- 不设计无关新功能。
- 不把 Stitch 生成代码直接作为 production source。

用户选中或组合方案后，才进入 Design Direction Freeze 和 Design System v1。

## Hard gate

Gate A 前不得重构正式 Product UI。

Gate A 至少需要：

1. 用户批准 Design Direction。
2. 用户批准 Design System v1。
3. 用户批准核心高保真页面。
4. 关键 Prototype / flow 通过评审。

## Existing constraints

- 不新增业务功能。
- 不进入 P6 MCP / Agent。
- 不创建 HarmonyOS / Android / iOS 原生 UI。
- Morphicons 图标体系保留。
- P5.1～P5.6 的功能、安全、Local-first、附件、Settings 行为不得回归。
- P5.4 Mobile WebView/Lynx 真机完全离线重启仍保留为既有待验收边界。
