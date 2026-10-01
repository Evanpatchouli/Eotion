# P5.7.4 Core Screen Design

## 状态

**IN PROGRESS / 已开始批准核心稿。**

本阶段产出 P5.7 Gate A 前必须批准的核心高保真页面。

设计可以来自 Figma、高保真 HTML/CSS prototype、静态图或其他可稳定评审形式，但必须可以明确判断布局、视觉层级和关键交互。

## Design Source

- Tool / format: Google Stitch 高保真静态稿 + interaction annotations。
- Canonical specification: `design-direction.md` + `design-system-v1.md` + `DESIGN.md`。
- Visual artifacts: Stitch 导出稿已人工 review；正式仓库 asset 归档待 P5.7.4 收口时统一处理。
- Last updated: 2026-10-02。

> Stitch artifact 不是规范 authority；当图片、HTML、Stitch DESIGN.md 与正式设计文档冲突时，以正式设计文档为准。

## Required Screen 1 — Desktop / Page

- Status: **✅ APPROVED**
- Design: Quiet Studio Final Direction Candidate + approved companion states。
- Viewport: 1440×900 baseline。
- Light/Dark: Light approved；Dark 见 Required Screen 5。

### Intent

Document-first、Open Canvas、Low Chrome。Page Title 与正文直接位于 canvas，不存在 Editor outer Card。

### Layout

- Document reading width：720–740px。
- Topbar：44px。
- Sidebar row：32px。
- Expanded Sidebar 左侧贴边，仅右上 / 右下 16px 圆角。

### Persistent UI

只保留 Workspace/Page navigation、breadcrumb、低权重 sync state 和必要 navigation control。Fixed Editor Toolbar 默认 OFF。

### Contextual UI

已批准：

- Collapsed Sidebar + topbar reopen control。
- Workspace Switcher Popover。
- Page Action Popover。
- Attachment Upload Failed。

### Save / sync state

- 正常：`已同步`。
- offline/local-only：`离线 · 本地已保存`。
- 两者不得在稳定态同时常驻。

### Interaction annotations

- Sidebar collapse 后完全退出主内容区；document 保持居中。
- reopen：breadcrumb 前唯一 32×32px visual control；tooltip `展开侧边栏`。
- Workspace Popover：约 240px，trigger offset 约 6px。
- Page Action Popover：min-width 160px，4px padding。
- Popover：ESC / click-outside close；focus return；keyboard navigation。
- 所有 floating menus 均不得改变 Page Tree layout。

### Approved deviations from current implementation

- 移除巨型 Editor Card。
- Desktop/Tablet Sidebar 增加 collapse/reopen。
- Workspace/Page 管理从 inline panel 改为 anchored popover。
- Upload state/error 移到最终插入位置。
- 去除重复稳定态状态文案和面向用户的技术错误术语。

## Required Screen 2 — Desktop / Settings

- Status: **✅ APPROVED**
- Design: Quiet Studio Desktop Settings — Light。
- Viewport behavior: 1280 / 1440 / 1600 reviewed and normalized。
- Theme: Light。

### Intent

保持 P5.6 list-detail IA，应用 Quiet Studio typography/spacing/surface 语言，不做 Card dashboard。

### Layout

- Navigation：240px。
- Detail：520px min / 740px max。
- 1280 target：约 620px。
- 1440 target：约 700–720px。
- 1600+：740px cap。
- Outer gutter：48 / 64 / 80px。

### Navigation

- category label：12px muted。
- item row：34px。
- selected 使用既有 selected semantic token。

### Setting row anatomy

```text
[18px Icon] [Title 14px / 500]
            [Subtitle 13px / 400]      [Accessory]
```

row 约 48–56px；full-row interaction；必要时使用 border-subtle。

### Interaction annotations

- keyboard focus 需明确可见。
- bounded selector 只在真正需要离散选择时使用。
- 不新增 Settings-only radius/border token。
- MCP / Agent 仍只有“即将推出”。

## Required Screen 3 — Mobile / Page

- Status: TODO
- Design link / asset: TODO
- Viewport: TODO
- Theme: TODO

### Intent

> TODO

### Navigation

> TODO

### Editing controls

> TODO

### Keyboard / IME behavior

> TODO

### Interaction annotations

> TODO

## Required Screen 4 — Mobile / Settings

- Status: TODO
- Design link / asset: TODO
- Viewport: TODO
- Theme: TODO

### Intent

> TODO

### Index → Detail behavior

> TODO

### Back behavior

> TODO

### Interaction annotations

> TODO

## Required Screen 5 — Dark / Page

- Status: **✅ APPROVED**
- Design: Quiet Studio Dark Desktop Page。
- Viewport: 1440×900 baseline。

### Intent

Dark 是 Quiet Studio 的同源主题，不是第二套产品；保持相同 geometry / spacing / typography / surface hierarchy。

### Dark surface hierarchy

- canvas：`#1C1B1A`
- sidebar：`#181716`
- surface-subtle：`#22211F`
- surface/elevated：`#242321`
- 不新增 Card 层级。

### Contrast notes

正式 token 已人工修正：

- text-muted：`#8F8D86`。
- danger：`#D06A66`。

以 WCAG 2.2 AA 为实现验证下限。

## Required Screen 6 — Empty / Offline / Connectivity

- Status: TODO
- Design link / asset: TODO
- Viewport: TODO
- State represented: TODO

### Intent

> TODO

### Recovery action

> TODO

### Diagnostics strategy

> TODO

## Optional Additional Screens

| Screen | Why needed | Status | Asset |
| --- | --- | --- | --- |
| Desktop / Collapsed Sidebar | 冻结 focus mode / reopen presentation | ✅ APPROVED | Stitch reviewed |
| Desktop / Workspace Switcher Popover | 冻结 anchored Workspace interaction | ✅ APPROVED | Stitch reviewed |
| Desktop / Page Action Popover | 冻结 zero-layout-shift Page actions | ✅ APPROVED | Stitch reviewed |
| Desktop / Attachment Upload Failed | 冻结 single-surface in-place recovery | ✅ APPROVED | Stitch reviewed |

## Cross-screen Consistency Checklist

- [x] Desktop typography matches Design System.
- [x] Desktop spacing matches Design System.
- [x] Desktop surface hierarchy matches Design Direction.
- [x] Desktop controls use approved component anatomy.
- [ ] Production Morphicons usage to verify at implementation.
- [x] Light / Dark are the same product language.
- [ ] Mobile is intentionally designed, not merely compressed desktop.
- [x] Desktop persistent UI has explicit justification.
- [x] Save / sync / offline semantics follow the same feedback philosophy.
- [x] Approved Desktop interactions have annotations.

## Gate A Decision

### Approved Design Direction

> TODO

### Approved Design System version

> TODO

### Approved screen set

> TODO

### Required revisions before implementation

> TODO

### Final decision

- Reviewer: TODO
- Date: TODO
- Status: **TODO / NOT APPROVED**
