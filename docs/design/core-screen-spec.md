# P5.7.4 Core Screen Design

## 状态

**P5.7 GATE A RECONCILIATION — READY FOR FINAL USER SIGN-OFF（2026-10-03）。**

本文件在 P5.7 closeout 时记录核心生产页面，并整理为 Gate A 最终签字材料。

设计可以来自 Figma、高保真 HTML/CSS prototype、静态图或其他可稳定评审形式，但必须可以明确判断布局、视觉层级和关键交互。

## Design Source

- Tool / format: Google Stitch 高保真静态稿 + interaction annotations。
- Canonical specification: `design-direction.md` + `design-system-v1.md` + `DESIGN.md`。
- Production baseline: 当前六项页面与状态由多轮正式 UI 截图 review、真机交互迭代及现有回归测试形成；此处记录 production behavior，不把旧的 Stitch 静态稿当作唯一来源。
- Last updated: 2026-10-03。

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
- 稳定保存/同步反馈只在 ProductShell 顶部 `SyncStatus` 常驻；稳定在线时不得同时显示“已同步”与“已保存到本地”。本地持久化失败在编辑器附近显示错误与重试，离线状态为“离线 · 本地已保存”。

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

- Status: **PRODUCTION BASELINE DOCUMENTED; FINAL USER SIGN-OFF PENDING**
- Design link / asset: `apps/web/tests/product-editor.spec.ts` 的移动端行为/几何回归及可选人工 QA 截图；正式自动比图仅由 `apps/web/tests/visual-regression.spec.ts` 的 Mobile Page Light 提供。没有单独冻结的 mockup asset。
- Viewport: **390×844**。
- Theme: Light / Dark production themes。

### Intent

沿用同一 Web Page 与 open canvas；移动端不创建第二套编辑器 UI。`<768px` 当前 Page 阅读列宽 `calc(100% - 32px)`，390px 下标题和正文左右各 16px，且不产生横向溢出。

### Navigation

产品 Sidebar 使用 drawer；触摸输入显示固定于可视键盘区域的 Touch Toolbar。键盘 viewport 变化跟踪 `visualViewport`，并滚动 caret 避开工具栏。非 Mobile 但 coarse/hybrid 输入也显示该工具栏。

### Editing controls

44px 工具项；Desktop selection Bubble 在 touch 输入关闭，使用浏览器原生 Selection Menu。链接内容可保留与渲染，touch 不提供显式创建入口；Desktop Bubble 可创建、编辑和移除链接。

### Keyboard / IME behavior

IME composition 时不触发编辑器持久化；键盘 inset、短 viewport、安全区及 Light / Dark 有生产回归覆盖。真机与辅助技术最终视觉检查：**MANUAL CHECK REQUIRED**。

### Interaction annotations

现有功能回归覆盖正文、Light/Dark 主题、触摸工具栏几何和 touch 链接保留；可选 `page.screenshot()` 仅供人工 QA，不作像素比较。新增自动视觉比图锁定 390×844 Mobile Page Light；Mobile Dark 和真实系统 Selection Menu、辅助技术需最终人工签字（MANUAL CHECK REQUIRED）。

## Required Screen 4 — Mobile / Settings

- Status: **PRODUCTION BASELINE DOCUMENTED; FINAL USER SIGN-OFF PENDING**
- Design link / asset: `apps/web/tests/product-settings.spec.ts` 的 390px production layout / navigation / gutter 回归。
- Viewport: **390×844**。
- Theme: Light / Dark production themes。

### Intent

宽度小于 768px 时，Settings 在同一主 UI 中使用 Index → Detail，不显示产品 Sidebar。保持单一 topbar。

### Index → Detail behavior

Index 的 topbar Back 返回安全的 `returnTo`；Detail 的 topbar Back 返回 Index，并保留 `returnTo` 与 `workspaceId`。不添加或恢复 `.settings-compact-back`。Detail 内容 gutter 为 30px。

### Back behavior

回归覆盖单一 topbar、Back 可操作区域至少 44×44px、Index/Detail 切换、返回目标及无横向溢出。读屏器与真机视觉最终检查：**MANUAL CHECK REQUIRED**。

### Interaction annotations

P5.6 list-detail content 保持产品原有语义；本屏只记录当前 topbar Back 与 Index / Detail 交互，不另加移动端专属返回控件。

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

- Status: **PRODUCTION STATE COVERAGE DOCUMENTED; FINAL USER SIGN-OFF PENDING**
- Design link / asset: `apps/web/tests/product-sync.spec.ts` 与 `apps/web/src/components/product/SyncStatus.vue`；没有独立的 Connectivity 页面 mockup。
- Viewport: **1440×900 Desktop backend-unavailable 截图基线**；390×844 同一状态有响应式功能测试。
- State represented: backend unavailable、cached identity / workspace snapshot、无本地 snapshot、同步失败及重试、离线本地已保存、恢复后已同步。

### Intent

仅记录当前正式产品中的连接与同步状态，不创造新 UI。服务不可用时，已有 cached identity 和 workspace snapshot 可恢复本地产品；若无本地 snapshot，明确告知该工作区尚未保存到本机、离线无法打开。

### Recovery action

已有本地修改仍可保存，状态显示“离线 · 本地已保存”；同步失败显示待同步数量及“重试”；恢复后回到“已同步”。点击当前状态提供的重试入口触发重试。

### Diagnostics strategy

用户 UI 只显示可行动状态，不呈现 raw HTTP、SDK、endpoint 等诊断信息。断网/暂时不可用和权限错误按既有行为区分；不把无 snapshot 表现为空 workspace。具体布局、屏幕阅读器播报和色彩对比最终人工检查：**MANUAL CHECK REQUIRED**。

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
- [ ] Production Morphicons appearance and touch affordance — **MANUAL CHECK REQUIRED**.
- [x] Light / Dark are the same product language.
- [x] Mobile Page / Settings use their documented production navigation and interaction behavior, not only a compressed desktop layout.
- [x] Desktop persistent UI has explicit justification.
- [x] Save / sync / offline semantics follow the same feedback philosophy.
- [x] Approved Desktop interactions have annotations.
- [x] Mobile Page / Settings / Connectivity document current production behavior at 390×844.
- [x] Settings back routes preserve `returnTo` and `workspaceId`; exactly one topbar Back is present.
- [x] Touch toolbar, `visualViewport`, fine/mouse Bubble, and touch link behavior match the implemented boundary.
- [ ] Final visual and accessibility pass across real devices, including the single persistent sync status and contextual local-save error — **MANUAL CHECK REQUIRED**.

## P5.7 Gate A Reconciliation

Production screens were implemented and refined through multiple screenshot reviews and real-device interaction iterations. This is the factual closeout sequence. It does not establish that the original pre-implementation Gate A passed.

### Design Direction represented in this baseline

Quiet Studio（此前已冻结的 Design Direction）。

### Design System version proposed for sign-off

Design System v1 — **FROZEN（2026-10-03）** for capabilities already present in P5 production.

### Screen set proposed for sign-off

Required Screen 1–6 current production baselines and approved desktop companion states listed above. Future / Out of P5 items are excluded.

### Required revisions / checks before final sign-off

完成最终视觉签字；逐项完成标记为 MANUAL CHECK REQUIRED 的真机、视觉及无障碍检查。现有 Mobile Page rename/move 和 Page delete 使用的 `EotionCommandOverlay` dialog/confirm 属 P5 生产基线；Table / Callout / Mention、未来通用 Dialog 变体、wide blocks、collaboration 不在本次冻结范围。

### Final decision

- Reviewer: User — pending.
- Date: Pending final user sign-off.
- Status: **READY FOR FINAL USER SIGN-OFF** (2026-10-03).
