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
- Quiet Studio Desktop Settings visual language 已批准。
- Settings navigation = 240px；detail = 520px min / 740px max，并冻结 1280 / 1440 / 1600 的目标宽度行为。
- Light text-muted 已修正为 #706E67，以满足 12–13px muted text 的 AA 基线。
- Desktop companion states 已批准：Collapsed Sidebar、Workspace Switcher Popover、Page Action Popover、Attachment Upload Failed。
- Popover focus-return / ESC / click-outside / zero-layout-shift 和附件单一原位错误 Surface 已冻结。

## Still open

不要提前猜：

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

下一项：**Mobile Page 高保真推演**。

目标只解决移动端尚未冻结的 presentation：

- 390×844 baseline。
- Product Sidebar → drawer。
- Mobile topbar / gutters。
- Open Canvas 在窄宽下的 typography / rhythm。
- touch editing controls。
- soft keyboard / IME coexistence。
- attachment block 在窄宽下的表现。
- uploading in-place。
- sync/offline feedback 在 Mobile 的位置和密度。

原则：不是 Desktop 缩小版；能力语义保持一致，但 presentation 可针对 touch 重组。

后续顺序：

1. Mobile Page。
2. Mobile Settings。
3. Connectivity / Offline。

Stitch 只负责视觉稿，不再负责最终 DESIGN.md。
