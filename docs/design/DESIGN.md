# Eotion DESIGN.md — Quiet Studio

Status: DRAFT / P5.7.3  
Human source of truth: `docs/design/design-direction.md` + `docs/design/design-system-v1.md`

This file is the compact AI / implementation-facing design contract. If this file conflicts with the two human design documents above, the human documents win.

## Direction

Quiet Studio:

- document-first
- low chrome
- warm neutral
- sans-serif
- open canvas
- contextual interaction
- local-first truthful feedback

Never turn Eotion into:

- SaaS dashboard
- admin panel
- card-heavy editor
- purple / gradient AI product
- glassmorphism UI
- Material-style component demo
- literary serif writing app

## Core rules

- No outer Editor / Document card.
- Fixed editor toolbar is OFF by default.
- Sidebar is flush to the left edge.
- Expanded Sidebar has only top-right and bottom-right 16px radius.
- Desktop / Tablet Sidebar must support collapse + reopen.
- Workspace and Page management use anchored floating popovers.
- Sidebar footer Settings / Logout are full-row interactions.
- Stable synced state: `已同步`.
- Offline local-only state: `离线 · 本地已保存`.
- Do not show both states at once in stable conditions.
- Raw HTTP / SDK / cleanup / object-storage language never appears in normal product UI.
- Slash Menu follows the active locale only; do not show bilingual duplicate labels.
- Attachment upload / success / failure happens in place at the final document insertion point.
- One failure has one primary error surface.
- Do not invent product metadata or actions not present in Eotion.
- Production icons: EotionIcon + morphicons/vue + Lucide data.
- Stitch HTML, Tailwind and Material Symbols are not production requirements.

## Light semantic colors

```text
canvas          #FAF9F6
sidebar         #F5F4F0
surface         #FFFFFF
surface-subtle  #F7F6F3
elevated        #FFFFFF
overlay         rgba(31,31,30,0.20)

hover           #EEEDE8
selected        #E6E4DD
focus           #3D3C38
border          #E8E6E1
border-subtle   #EFEEE9

text-primary    #1F1F1E
text-secondary  #5A5852
text-muted      #8F8D86

accent          #3D3C38
success         #4B6B54
warning         #9E6B34
danger          #A8423F
```

Dark tokens: NOT FROZEN.

## Typography

Sans-serif only:

```text
Inter,
-apple-system,
BlinkMacSystemFont,
"Segoe UI",
"PingFang SC",
"Hiragino Sans GB",
"Microsoft YaHei",
sans-serif
```

```text
Page Title   36 / 45 / 600 / -0.015em
Heading 1    24 / 32 / 600 / -0.01em
Heading 2    20 / 27 / 600 / -0.01em
Body         15 / 26 / 400
UI           14 / 20 / 400–500
Metadata     13 / 18 / 400–500
Caption      12 / 18 / 400
```

No Newsreader. No default serif headings.

## Spacing

Primary scale:

```text
4, 8, 12, 16, 20, 24, 32, 40, 48, 64
```

Use 6px / 10px only for justified optical correction or popover offset.

## Layout baseline

```text
Topbar: 44px
Document reading width: 720–740px
Tree row height: 32px
Sidebar right radius: 16px
```

Sidebar width and exact responsive breakpoints: NOT FROZEN.

## Radius

```text
control  6px
block    8px
popover  10px
dialog   12px
sidebar  16px
```

Do not add a surface just to use a radius.

## Surface hierarchy

Only:

```text
Canvas
Sidebar
Surface-subtle
Surface
Elevated
Overlay
```

Avoid decorative borders.

## Motion draft

```text
fast    120ms
normal  180ms
slow    240ms
```

Respect reduced motion.

## Popovers

- anchored to the trigger
- do not change document/tree layout
- elevated surface
- subtle border
- light shadow: `0 4px 16px rgba(0,0,0,0.06)`
- keyboard/focus return required

## Editor

- Page title directly on canvas.
- Body directly on canvas.
- No Editor outer border.
- Slash / keyboard / selection / contextual controls provide advanced actions.
- Mobile touch controls are separately designed.

## Attachments

Uploading block:
- final insertion position
- filename
- restrained progress
- only real product actions/data

Success:
- same position
- lightweight document-native file/image block

Failure:
- same position
- user-friendly error
- retry
- remove if product supports it
- no duplicate global error
- no cleanup terminology

## Error language

Classify transport errors internally, but display context-aware product copy.

Examples:

```text
network / transient service unavailable
→ 服务暂时不可用，请稍后重试。

401
→ 登录状态已失效，请重新登录。

403
→ 你没有权限执行此操作。
```

Never expose raw SDK fallback strings.

## Accessibility

- touch target ≈ 44×44px
- visible keyboard focus
- color is not the only status signal
- reduced motion respected
- popover focus return
- target WCAG 2.2 AA

## Not frozen yet

Do not invent these:

- Dark palette
- Settings responsive width cap
- Sidebar expanded width
- exact breakpoints
- collapse persistence rules
- Mobile touch toolbar anatomy
- Dialog visual details
- final image/file border strength

Wait for P5.7.3 / P5.7.4 approval.
