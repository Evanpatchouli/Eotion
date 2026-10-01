# Eotion DESIGN.md — Quiet Studio

Status: P5.7 Design Freeze

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
- Upload states stay at the insertion location.
- Local-first states must distinguish synced and local-only states.
- Do not expose infrastructure terminology in product UI.
- Do not invent product actions, metadata, or settings.

## Layout Baseline

- Document reading width: 720–740px
- Desktop tree row height: 32px
- Sidebar right radius: 16px
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

## Settings

- Prefer typography and spacing over containers.
- Do not build admin-style full-width forms.
- Preserve Quiet Studio information hierarchy.
- MCP / Agent remain 即将推出 until implemented.

## Accessibility

- Minimum touch target around 44×44px.
- Visible keyboard focus required.
- Status must not rely only on color.
- Respect reduced motion.
- Target WCAG 2.2 AA.

## Non-frozen Items

Do not invent:

- sidebar exact width
- unsupported breakpoints
- mobile toolbar details
- dialog details
- future product capabilities
