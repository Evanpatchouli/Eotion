# P5.7.2 Eotion Stitch Design Brief

## 状态

**READY FOR EXPLORATION / 2026-10-01**

本文件是 P5.7.2 交给 Stitch 的主设计输入。目标不是让 Stitch“自由设计一个 Notion clone”，而是基于 P5.7.1 已审计的问题，探索 Eotion 自己的视觉方向。

本阶段只做设计探索，不修改正式 Product UI。

## Product

Eotion 是一个自研 Notion 类应用，当前 Product MVP 已具备：

- Workspace。
- Page Tree。
- Tiptap 文档编辑器。
- Local-first / offline editing。
- Web / Electron / Mobile WebView。
- 图片 / 文件附件。
- Settings。
- Light / Dark。
- Slash command。
- Mobile touch editing controls。

核心产品方向：**Content-first / Document-first。**

## Audience

当前主要目标用户：

- 希望快速记录、整理、编辑结构化内容的普通用户；
- 同时支持桌面、平板、手机；
- 不要求用户理解同步、对象存储、cleanup、HTTP 等工程概念。

UI 应成熟、安静、长期耐看，而不是展示“AI 产品感”或后台系统感。

## Core Design Goals

1. 文档内容成为视觉主角。
2. 默认界面尽量接近“标题 + 正文”。
3. 减少 persistent chrome。
4. 少用 Card / Border 建立层级。
5. 通过 typography、spacing、灰阶、surface hierarchy 建立秩序。
6. 常用能力可发现，不常用能力 progressive disclosure。
7. Desktop / Tablet / Mobile 使用同一设计语言，但 interaction presentation 可以不同。
8. Light / Dark 必须看起来是同一产品。
9. 操作反馈面向普通用户，不暴露工程术语。
10. 后续 P6+ 新功能能够自然沿用该设计系统。

## Existing Strengths To Preserve

- Page Title + Body 的核心 document structure。
- Sidebar / Workspace / Page Tree 的总体 IA。
- Mobile 使用 drawer，而不是永久 Sidebar。
- Fixed editor Toolbar 默认 OFF。
- Slash / keyboard / contextual / touch editing 作为隐藏复杂度的主要入口。
- Settings：Desktop list-detail，Mobile Index → Detail。
- Light / Dark 使用同源 token。
- Morphicons + Lucide 作为系统图标基础。
- Login / Register 当前体验无需强行重设计。

## Problems That Must Be Solved

### Page / Editor

- 当前 Editor 是巨大 bordered Card，像“富文本输入框”，不像 document canvas。
- Page 同时出现 Workspace label、breadcrumb、已同步、已保存到本地，信息重复。
- 正常稳定态状态反馈过多。
- Attachment Card 嵌套 Editor Card。

**探索目标：**

让 Page 更接近：

```text
Page Title

正文
正文

图片 / 文件

正文
```

而不是：

```text
Context / status
Page Title / status

┌────────────────────┐
│ Editor Card        │
│ ┌ Attachment Card┐ │
│ └────────────────┘ │
└────────────────────┘
```

### Sidebar

必须解决：

- Desktop / Tablet 可以 collapse / reopen。
- 中等宽度有真正的 focus mode。
- Workspace switcher 不重复 current Workspace。
- Workspace management 不直接做大块 inline panel。
- Page action menu 不推动 Page Tree 布局。
- Settings / Logout 使用完整 row hit area + hover/focus state。
- Expanded Sidebar 的 **右上角和右下角使用圆角**；左侧贴窗口边缘。

需要探索：

- collapse control 的位置；
- collapsed 后 reopen 入口；
- collapsed 状态是否记忆；
- Desktop / Tablet / Mobile 如何保持一致的产品感。

### Slash Menu

结构基本可保留。

要求：

- 中文界面只显示中文：
  - 文本
  - 标题
  - 项目列表
  - 图片
  - 文件
- 不在一项里同时放英文标题 + 中文翻译。
- i18n 未来通过翻译资源切换。
- 若存在第二行，只能提供补充说明，不是重复翻译。

### Attachment

必须探索更 document-native 的 attachment experience。

上传中：

- 不要固定跑到 Editor 顶部；
- 优先设计为最终插入位置的 inline placeholder；
- uploading → success/error 原位 transition；
- 不造成明显 layout jump。

失败：

- 同一失败只有一个主要 error surface；
- retry 清晰；
- 正文继续编辑；
- 不出现“附件清理 / cleanup / object lifecycle”等工程语言。

成功：

- 图片应更像正文 media，而不是上传控件 Card；
- 文件 row/card 可保留必要 metadata，但避免和 Editor outer Card 形成 nested card。

### Settings

IA 不需要推翻。

需要优化：

- Desktop Detail 不固定成很窄的一列；
- 在 1280px 左右保持舒适；
- 1440 / 1600 / wider 时可以适度变宽；
- 必须有 max cap，避免超宽文本行。

### Error / Connectivity

禁止普通用户看到：

```text
Eotion API request failed: 502
HTTP 503
cleanup pending
retry cleanup
```

产品语言应：

- 简洁；
- context-aware；
- 可行动；
- 技术细节只进入 diagnostics / dev log。

## Desired Personality

当前候选关键词：

- 克制
- 安静
- 清晰
- 内容优先
- 精致
- 轻量
- 专业但不企业后台化

这些词不是最终 Design Direction，Stitch exploration 可以挑战它们，但不能违背 Product Audit 的问题约束。

## Visual Principles To Explore

### A. Editorial / Document-first

特点：

- 最大程度减少 chrome；
- 更强 typography；
- 更像现代写作工具；
- 轻量 Sidebar；
- Page canvas 接近无边界纸面。

### B. Modern Productivity

特点：

- 保留适度 UI 层级；
- hover / selected / popover 更清楚；
- surface 使用克制；
- 比纯 editorial 更容易发现功能。

### C. Refined Desktop Productivity

特点：

- 可以借鉴高质量桌面软件的精致 interaction；
- 允许轻微 Fluent-like / native desktop 的细腻感；
- 不能变成 Windows Settings / 管理后台；
- 仍以 document-first 为核心。

第一轮请至少探索 **3 个明显不同但都符合 Eotion 约束的方向**。

## First Exploration Screen

为了公平比较视觉方向，第一轮不要分别画不同页面。

所有方案统一画：

- Viewport: 1440 × 900。
- Light mode。
- Desktop。
- Sidebar expanded。
- 一个 Workspace。
- Page Tree 中约 5～7 个页面，包含一个有子页面的节点。
- 当前打开一个普通 Page。
- Page 有标题、2～3 段正文、一个二级标题、一个图片附件、一个文件附件。
- Fixed Editor Toolbar OFF。
- 正常已保存/已同步状态。
- 不打开 Settings。
- 不打开任何 modal。

所有方案功能内容完全一致，只改变视觉方向和 interaction presentation。

## Required Behaviors In First Exploration

设计中必须表现或注明：

- Sidebar collapse control。
- Page action menu 是 floating/contextual，不推动 tree。
- Workspace switcher 是 popover/contextual，而不是 inline management panel。
- Sidebar footer 是整行 interaction。
- Sidebar 右上 / 右下圆角。
- Editor 没有巨大 outer Card。
- 正常稳定态不同时永久显示两个保存状态。
- Attachment 视觉上属于正文。
- 主要内容宽度在 1440 下舒适、不过宽。

## Do Not Do

- 不要照搬 Notion UI。
- 不要做成 ChatGPT Settings 风格整站。
- 不要做成传统 SaaS dashboard。
- 不要做成 Material Design demo。
- 不要用大面积渐变、AI 紫、玻璃拟态作为产品主基调。
- 不要每个 section 都用 Card。
- 不要让所有 action 永久可见。
- 不要把 mobile 仅视为压缩 desktop。
- 不要新增 Eotion 当前不存在的业务功能。
- 不要设计 AI chat panel、dashboard stats、template marketplace 等无关内容。
- 不要生成 production implementation 作为本阶段目标。

## Evaluation Criteria

三个方案将按以下维度比较：

| Dimension | Question |
| --- | --- |
| Document-first | 第一眼是否首先看到标题和内容？ |
| Visual hierarchy | 用户是否无需边框就能理解层级？ |
| Low chrome | 永久 UI 是否足够少？ |
| Discoverability | 精简后功能是否仍然可发现？ |
| Sidebar quality | 是否轻、清晰、可 collapse？ |
| Editor quality | 是否像 document canvas，而不是 input card？ |
| Attachment integration | 图片/文件是否真正属于文档？ |
| Consistency | Page / nav / actions 是否像同一产品？ |
| Long-term taste | 是否耐看，而不是追逐视觉潮流？ |
| Extensibility | 未来 MCP / Agent / Search 是否能沿用这套语言？ |

## Output Required From Stitch

第一轮每个方向至少提供：

1. 1440×900 Desktop Page 高保真图。
2. Direction name。
3. 3～6 个 design principles。
4. Sidebar 行为说明。
5. Page / Editor hierarchy 说明。
6. Attachment treatment 说明。
7. Save / sync feedback 说明。
8. 关键 typography / spacing / radius 的初步倾向。
9. 该方向的优点。
10. 该方向的潜在风险。

不要在第一轮就冻结 Design System。

## After First Exploration

用户选中一个方向或要求组合多个方向后，再进入：

1. Design Direction Freeze；
2. Design System v1；
3. Desktop Settings；
4. Mobile Page；
5. Mobile Settings；
6. Dark Page；
7. Offline / Connectivity；
8. Interactive Prototype；
9. Gate A。

## Source Documents

Stitch / Design Partner 在理解项目时，以以下文档为 source of truth：

- `docs/design/ui-ux-audit.md`
- `docs/p5-ui-ux-foundation.md`
- `docs/design/design-direction.md`
- `docs/design/design-system-v1.md`
- `docs/design/core-screen-spec.md`

当前阶段不要读取实现 CSS 数值并把它们当成设计标准；现有 UI 是待重设计对象，不是设计 source of truth。
