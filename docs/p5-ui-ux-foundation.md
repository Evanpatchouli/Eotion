# P5.7 UI/UX Foundation & Product Redesign

## 状态

**Planned / 设计准备阶段。**

P5.7 位于 P5.6 Settings & Preferences 之后、P5 Final Acceptance 之前。

本阶段的目标不是继续堆功能，也不是对现有 CSS 做零散“美化”，而是在 Product MVP 封板前建立 Eotion 第一套正式、可复用、可扩展的 UI/UX 基线，使后续 P6+ 能沿同一产品语言继续增长。

P5.4 Mobile WebView/Lynx 真机完全离线重启验收仍作为独立待验收边界保留；P5.7 不自动关闭该项。

## 核心原则

P5.7 采用 **Design First**：

```text
现状审计
→ 设计方向
→ Design System
→ 核心页面高保真设计
→ 用户确认
→ 正式实现
→ Visual Acceptance
→ P5 Final Acceptance
```

在 P5.7.1～P5.7.4 完成并得到明确批准前：

- 不重构正式产品 UI。
- 不把新视觉方向直接写进 ProductShell / Editor / Settings 等正式组件。
- 不以“边写代码边定设计”为默认方式。
- 可以创建独立设计原型、静态稿或不进入正式产品链路的设计实验，但必须与生产 UI 隔离。

## 当前问题判断

当前 P5.1～P5.6 已验证核心产品功能，但 UI/UX 主要由工程实现过程逐步生成，缺少统一的专业设计输入和完整设计系统。

P5.7 要解决的不是单个按钮或某个页面，而是：

- 产品视觉基调尚未明确冻结。
- 多个 Surface 各自合理，但整体一致性不足。
- spacing / typography / radius / surface hierarchy 等仍存在局部自发演化。
- 部分 UI 过度依赖 border / card / persistent controls。
- Responsive 目前优先保证“不坏”，需要进一步升级为针对不同宽度的主动体验设计。
- 缺少经过批准的核心高保真页面作为后续实现的视觉 source of truth。
- 缺少稳定的 visual regression baseline。

## 暂定设计方向

以下是当前讨论形成的 **候选基线**，需要在 P5.7.2 中正式确认或修订：

- **Content-first / Document-first**：文档内容是视觉主角。
- **Low Chrome**：长期常驻 UI 尽量少；不常用能力按需出现。
- **Typography-driven hierarchy**：优先通过字体、留白、灰阶和节奏建立层级，而不是大量 Card / Border。
- **Quiet Neutral**：整体中性、克制，不让品牌色长期占据内容界面。
- **Progressive Disclosure**：次级操作通过 hover、selection、context、slash、menu 等按需暴露。
- **Responsive by available width**：按可用空间设计不同 presentation，而不是按设备名称硬编码。
- **Light / Dark 同源**：Dark 不做第二套 UI；两套主题来自同一个 Design System。
- **Morphicons 延续**：系统图标继续通过现有 EotionIcon + Morphicons + Lucide data 体系呈现。

以上原则并不代表具体字号、间距、颜色、圆角已经确定；具体值必须在 Design System v1 中完成设计和批准。

## 阶段拆分

### P5.7.1 — UX / Visual Audit

**✅ PASS（2026-10-01）。**

目标：只审计现状，不改正式 UI。

输出：

- 正式 Surface 截图基线。
- 问题清单。
- 一致性问题。
- 信息层级问题。
- 交互冗余。
- 可删除 UI。
- Responsive 问题。
- Light / Dark 问题。
- Accessibility / touch 问题。
- 值得保留的现有设计。

正式工作表：[`design/ui-ux-audit.md`](design/ui-ux-audit.md)。

### P5.7.2 — Stitch Design Brief & Direction Exploration

**当前阶段。**

目标：把 P5.7.1 的真实问题转换成严格 Design Brief，并通过 Stitch 对同一核心 Page Screen 做多方向视觉探索；先看到真实方案，再冻结 Design Direction。

第一轮要求：

- 使用统一 1440×900 Desktop Page 内容作为比较基准。
- 至少探索 3 个明显不同、但都符合 Eotion 产品约束的方向。
- 功能内容保持一致，只比较视觉 hierarchy、density、surface、navigation 和 interaction presentation。
- 不直接生成或修改 production UI。
- 不在第一轮提前冻结 Design System。

正式输入：[`design/stitch-design-brief.md`](design/stitch-design-brief.md)。

探索完成后，把最终采用/组合的设计方向写入 [`design/design-direction.md`](design/design-direction.md) 并冻结。

### P5.7.3 — Design Direction Freeze & Design System v1

目标：在 Stitch 方向探索被用户选定后，将最终 Design Direction 转换为可实施的系统。

至少定义：

- Typography。
- Spacing。
- Grid / content width。
- Radius。
- Color / semantic tokens。
- Surface。
- Border。
- Shadow。
- Icon。
- Motion。
- Focus。
- State。
- Desktop / touch density。
- Form controls。
- Menu / dialog / popover。
- Editor-specific primitives。

正式工作表：[`design/design-system-v1.md`](design/design-system-v1.md)。

### P5.7.4 — Core Screen Design

目标：在正式实现前产出并批准至少 6 张核心高保真页面。

最低要求：

1. Desktop / Page。
2. Desktop / Settings。
3. Mobile / Page。
4. Mobile / Settings。
5. Dark / Page。
6. Empty / Offline / Connectivity state。

当前优先使用 Stitch 作为高保真设计工作台；也可以辅以 Figma、高保真 HTML/CSS prototype 或其它可稳定评审的形式。

每张设计必须包含必要 interaction annotation，而不仅是截图。

正式工作表：[`design/core-screen-spec.md`](design/core-screen-spec.md)。

### Gate A — Design Approval

**这是 P5.7 的强制门禁。**

只有用户明确批准：

- Design Direction。
- Design System v1。
- 核心页面设计。
- 至少两个关键 Interactive Prototype / flow（若 Stitch 能稳定表达）。

才能开始 P5.7.5。

没有 Gate A，不得以“先做一版看看”为理由重构正式 UI。

### P5.7.5 — Implementation

目标：严格实现已经批准的设计，而不是重新设计。

实施时：

- 已批准设计稿 / prototype 是视觉 source of truth。
- Design System 是 token / component source of truth。
- Codex / implementation agent 主要负责实现、响应式、accessibility、状态、测试，不承担关键审美决策。
- 如果实现中发现设计缺口，先回到设计文档补决策，再继续编码。

具体 implementation plan 在 Gate A 通过后单独生成；当前文档不提前填充实现任务。

### P5.7.6 — Visual Acceptance & Regression

目标：

- 对 Light / Dark、Desktop / Tablet / Mobile 建立正式视觉基线。
- 用 Playwright screenshot comparison 或等价机制保护关键 Surface。
- 检查 approved design 与实现的偏差。
- 做最终 UI/UX review，而不仅是功能测试。

正式工作表：[`design/visual-acceptance.md`](design/visual-acceptance.md)。

## 需要覆盖的正式 Surface

P5.7 至少覆盖：

- Login / Register。
- Connectivity / Backend unavailable。
- ProductShell。
- Sidebar / Workspace switcher。
- Page Tree。
- Page header。
- Editor。
- Slash menu。
- Touch toolbar / contextual controls。
- Attachment upload state。
- Image block。
- File block。
- Menu / popover / confirm。
- Settings Index / Detail。
- Light / Dark。
- Empty / Loading / Error / Offline / Synced state。

`/__dev/*` PoC 页面不是 P5.7 视觉 source of truth。

## 允许删除 UI

P5.7 不只是“把现有东西画得更漂亮”。

每个长期存在的 UI 都要问：

- 用户是否需要它长期可见？
- 能否在 context / hover / selection / slash / menu 中按需出现？
- 删除后是否反而提升内容优先级？
- 这个状态是否真的需要一条独立文字长期占位？

P5.7 允许基于设计审计：

- 删除长期常驻控件。
- 合并重复状态。
- 降低视觉层级。
- 重组布局。
- 改变 compact presentation。

但不得破坏已验收的产品能力和安全 / Local-first invariant。

## 模型与设计协作

P5.7 可以使用多个模型作为 Design Partner。

建议：

- 对同一 Design Brief 并行获取多个独立方案。
- 比较信息层级、视觉密度、移动端交互、一致性和原创性。
- 最终设计由用户确认，不由模型评分自动决定。
- 可以组合不同方案的优点，但最终必须收敛到一套 Eotion Design System。

不得让不同模型各自直接修改正式 UI，造成多套视觉语言并存。

## P5.7 不做

设计阶段不做：

- 新业务功能。
- P6 MCP / Agent。
- 协作。
- 新数据模型。
- 新同步机制。
- 原生 HarmonyOS / Android / iOS UI 重写。
- 为了视觉重构改变已验证的权限、安全或附件生命周期语义。

## P5.7 Exit Criteria

只有以下全部满足才能声明 P5.7 PASS：

1. UI/UX Audit 完成并经人工确认。
2. Design Direction 已冻结。
3. Design System v1 已冻结。
4. 至少 6 张核心高保真页面得到批准。
5. 正式产品按照批准稿完成实现。
6. Light / Dark、Desktop / Tablet / Mobile 通过 Visual QA。
7. 关键 Surface 建立视觉回归基线。
8. P5.1～P5.6 的功能、安全、Local-first、附件、Settings 行为没有回归。
9. Accessibility 与 touch 关键路径无 blocker。
10. 独立 UI/UX review 与工程 review 无 blocker。

P5.7 PASS 后才进入 P5 Final Acceptance。

## 当前设计文档

- [UI/UX Audit](design/ui-ux-audit.md) — ✅ P5.7.1 PASS
- [Stitch Design Brief](design/stitch-design-brief.md) — P5.7.2 当前输入
- [Design Direction](design/design-direction.md) — 等 Stitch exploration 后冻结
- [Design System v1](design/design-system-v1.md)
- [Core Screen Spec](design/core-screen-spec.md)
- [Visual Acceptance](design/visual-acceptance.md)
