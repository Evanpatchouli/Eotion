# Current Task — P5.7.3 Design System v1

P5.6 Settings & Preferences 已 PASS（2026-10-01）。产品版本保持 0.0.1 / build 1。

P5.7.1 UI/UX Audit 已 PASS。
P5.7.2 Design Direction 已冻结为 **Quiet Studio**。

当前不进入 P5 Final Acceptance，也不修改正式 Product UI。

## Current phase

P5.7.3 — Design System v1。

正式设计 source of truth：

- `docs/design/design-direction.md` — Quiet Studio FROZEN
- `docs/design/design-system-v1.md` — human-readable DRAFT
- `docs/design/DESIGN.md` — AI / implementation-facing DRAFT

## Current decisions already frozen

- Document-first / Open Canvas。
- Low Chrome。
- Warm-neutral Quiet Studio。
- Sans Serif only。
- Fixed Editor Toolbar 默认 OFF。
- Expanded Sidebar 仅右上 / 右下圆角。
- Desktop / Tablet Sidebar 必须支持 collapse / reopen。
- Workspace / Page management 使用 anchored floating popover。
- Sidebar footer 为 full-row interaction。
- Stable synced：`已同步`。
- Offline/local-only：`离线 · 本地已保存`。
- Attachment upload/error 在最终插入位置原位转换。
- Slash Menu 单语言。
- Production icons 使用 EotionIcon + Morphicons + Lucide。
- Stitch 的 Tailwind / Material Symbols / Newsreader / Material token 不是 production spec。

## Completed in current phase

- Quiet Studio Dark Desktop Page 已批准。
- Dark semantic palette 已冻结，并修正 text-muted / danger 的 WCAG 对比度。

## Still open

不要提前猜：

- Settings detail width curve / cap。
- Sidebar expanded width。
- exact responsive breakpoints。
- collapse preference persistence。
- Mobile touch toolbar anatomy。
- Dialog/confirm visual spec。
- Image/File block 最终 border/background 强度。

这些通过 P5.7.3 / P5.7.4 后续高保真状态稿再冻结。

## Hard gate

Gate A 前不得重构正式 Product UI。

Gate A 至少需要：

1. Design Direction（已满足）。
2. Design System v1 PASS。
3. Core Screens approved。
4. 关键 Prototype / flow 通过评审。

## Next action

下一项：**Desktop Settings 高保真推演**。

目标只解决：

- Quiet Studio Settings visual language。
- Settings navigation density。
- setting-row anatomy。
- 1280 / 1440 / 1600 下的 detail width curve / max cap。
- form/control treatment。

Settings IA 保持 P5.6 已验收的 list-detail，不新增设置项，不把 Settings 设计成 Card dashboard。

后续顺序：

1. Desktop Settings。
2. Sidebar collapsed / workspace popover / page action / attachment failure companion states。
3. Mobile Page。
4. Mobile Settings。
5. Connectivity / Offline。

Stitch 只负责视觉稿，不再负责最终 DESIGN.md。
