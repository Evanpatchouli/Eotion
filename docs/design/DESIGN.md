# Eotion DESIGN.md — Quiet Studio

Status: P5.7 Existing Production Baseline Frozen — 2026-10-03

Gate A: **READY FOR FINAL USER SIGN-OFF**. The user has not completed final visual sign-off. This closeout records the production UI formed through iterative screenshot and device review; it does not claim that the planned pre-implementation Gate A passed historically.

This document is the implementation-facing design contract.

## Source of Truth

Human design sources:

- `docs/design/design-direction.md`
- `docs/design/design-system-v1.md`

Implementation rules must follow the sources above. This file only records product-level constraints and must not duplicate design tokens.

## Direction

Quiet Studio is:

- document-first
- local-first
- open canvas
- warm neutral
- low noise
- contextual interaction

Never turn Eotion into:

- SaaS dashboard
- admin console
- card-heavy editor
- AI marketing UI
- glassmorphism interface

## Core Product Rules

- Document content is rendered directly on canvas.
- No outer editor/document card.
- Sidebar is flush to the left edge.
- Sidebar collapse/reopen must preserve document reading stability.
- Workspace and page actions use anchored floating popovers.
- Existing Mobile Page rename/move and Page delete confirmation use `EotionCommandOverlay` native dialogs; preserve their current responsive and focus behavior.
- Upload states stay at the insertion location.
- Local-first states must distinguish synced and local-only states.
- Page currently shows local persistence (“已保存到本地”) beside the title and remote sync (“已同步”) in the topbar; they can appear together. This is a known production screenshot item for final Gate A review, not an already-resolved visual state.
- Do not expose infrastructure terminology in product UI.
- Do not invent product actions, metadata, or settings.
- Typography baseline: Page Title 36/45/600; Body 15/26/400.
- Topbar 44px; desktop sidebar row 32px and right radius 16px; reading column 720–740px.
- Desktop `EotionButton` pointer height 28px and coarse pointer 36px are approved compact-button exceptions. Touch icon, navigation and disclosure controls target about 44px. Desktop Bubble actions are 32px.

## Layout Baseline

- Document reading width: 720–740px
- Desktop tree row height: 32px
- Sidebar right radius: 16px
- Sidebar width: 252px Desktop, 210px Tablet; below 768px use a drawer.
- Settings navigation width: 240px
- Settings detail width: max 740px

## Interaction Rules

Popovers:

- anchored to trigger
- never push document/tree layout
- support ESC close
- restore focus to trigger

Attachments:

- uploading, success and failure remain in-place
- failure primary text: 上传中断
- recovery action: 重试
- secondary action: 移除

Editor input:

- Mobile layout or touch/hybrid input uses the 44px Touch Toolbar, independent of the desktop fixed-toolbar preference. Track `visualViewport` changes for keyboard inset and caret visibility.
- Desktop Bubble is for fine/mouse input. Touch keeps the native Selection Menu; preserve existing links but do not expose explicit link creation there.
- Desktop Bubble supports link create, edit and remove.

## Settings

- Prefer typography and spacing over containers.
- Do not build admin-style full-width forms.
- Preserve Quiet Studio information hierarchy.
- MCP / Agent remain 即将推出 until implemented.
- Below 768px, Settings uses Index → Detail. The single topbar Back returns Index from Detail and `returnTo` from Index; Detail gutter is 30px. Preserve `returnTo` and `workspaceId`; do not restore `.settings-compact-back`.

## Accessibility

- Touch targets should generally approach 44×44px where practical, especially icon-only, navigation and disclosure controls.
- Compact text buttons are an intentional density exception: after direct visual inspection, the user approved `EotionButton` at 28px for desktop pointer and 36px for coarse/touch pointer (2026-10-02), because the previous height looked visually too tall. Do not mechanically raise these buttons back to 44px without new usability evidence; keep the sizing in the shared component rather than action-specific overrides.
- Visible keyboard focus required.
- Status must not rely only on color.
- Respect reduced motion.
- Target WCAG 2.2 AA.

## Non-frozen Items

Do not invent:

- breakpoints beyond the production `<768px` Mobile / `768–1199px` Tablet / `≥1200px` Desktop modes
- mobile toolbar behavior beyond the current production contract
- future generic dialog variants beyond existing Page actions
- future product capabilities
- Table / Callout / Mention blocks, future generic Dialog variants, wide blocks and collaboration UI are Future / Out of P5.

Visual or accessibility details not confirmed by production evidence remain **MANUAL CHECK REQUIRED** pending final user review.
