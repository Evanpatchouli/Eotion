# P5.7.2 Design Direction — Quiet Studio

## 状态

**✅ FROZEN / PASS（2026-10-01）**

P5.7.1 Audit 已完成，Stitch 已完成多方向探索、Quiet Studio A/B 收敛和 Final Direction Candidate。用户已批准 **Quiet Studio** 作为 Eotion 的正式 UI/UX 方向。

本文件冻结“Eotion 应该长什么样，以及为什么”。具体 token / component 数值进入 `design-system-v1.md`；核心页面与 companion states 进入 P5.7.4。

---

## Product Personality

- 克制
- 安静
- 清晰
- 精致
- 内容优先
- 专业但不企业后台化

## Primary Design Statement

Eotion 的界面应该像一个安静、可靠、长期耐看的知识工作室：用户打开页面时首先看到的是**标题和内容**，而不是编辑器容器、状态面板或一组长期常驻的控制器。

产品通过 typography、spacing、灰阶和少量 surface 建立层级；不依赖大量 Card / Border / Shadow。复杂能力通过 Sidebar、Slash、Popover、Contextual controls 和 Touch controls 按需出现。视觉上保持温润的中性基调，但不文学化、不复古、不追逐“AI 紫色 / 渐变 / 玻璃拟态”等潮流。

这套语言必须同时适合写作、技术笔记、知识管理，以及未来 MCP / Agent 等生产力能力。

---

## Design Principles

### 1. Document-first / Content-first

文档是第一视觉主角。

默认 Page 应接近：

```text
Page Title

正文

附件 / 媒体

正文
```

而不是：

```text
Context
Status
Page Title
┌ Editor Card ┐
│ Content     │
└─────────────┘
```

Editor 不拥有持续可见的外层 Card / Border。Canvas 本身就是编辑面。

### 2. Low Chrome

只让当前任务真正需要的 UI 常驻。

默认不长期显示：

- Fixed editor toolbar。
- 双重 save/sync 状态。
- Inline page management panel。
- Inline workspace management panel。
- 大型 editor container。
- Debug / HTTP / cleanup 术语。

需要时再通过：

- hover；
- focus；
- selection；
- Slash；
- anchored popover；
- context menu；
- mobile touch controls；

暴露能力。

### 3. Typography-driven hierarchy

优先使用：

- 字号；
- 字重；
- 行高；
- 留白；
- 灰阶；
- 对齐；

建立层级。

Border / Card 不作为默认信息架构工具。

### 4. Quiet Neutral

Light Theme 采用温润但克制的 neutral，而不是纯冷白或明显米黄。

Accent 只用于：

- focus；
- selection；
- primary action；
- semantic state；

不长期统治界面。

### 5. Progressive Disclosure

页面管理、工作空间管理、附件操作、编辑能力优先按需出现。

隐藏不等于不可发现：触发器、hover state、tooltip、keyboard、Slash 和 touch affordance 必须共同保证可发现性。

### 6. Responsive by available width

不按 Desktop / Tablet / Mobile 名称硬编码业务。

同一 IA 在不同可用宽度采用不同 presentation：

- 宽屏：Sidebar + document canvas。
- 中等宽度：允许 Sidebar collapse / focus mode。
- 紧凑宽度：Sidebar 作为 drawer；Settings 使用 Index → Detail。
- Touch controls 可与 pointer controls 不同，但能力语义一致。

具体 breakpoint 与默认折叠策略在 P5.7.4 后冻结。

### 7. Light / Dark same language

Dark 不是第二套产品。

两套 Theme 共用：

- typography；
- spacing；
- geometry；
- surface hierarchy；
- interaction pattern；

只替换 semantic color / shadow 等主题 token。

---

## What Eotion Should Feel Like

用户应感受到：

- 内容前面没有“编辑器框”挡着；
- Sidebar 安静、稳定、可收起；
- 页面树在管理操作发生时不会跳动；
- 浮层像从触发器自然长出来，而不是随机漂在页面上；
- 附件属于文档，而不是独立上传中心；
- 正常状态几乎没有状态噪音；
- 离线、失败、权限等异常出现时，反馈清楚且可行动；
- 连续使用几个小时不会因为高对比、彩色装饰和密集边框疲劳。

## What Eotion Must Not Feel Like

禁止把 Eotion 设计成：

- SaaS dashboard；
- 后台管理系统；
- Material Design demo；
- Card 套 Card；
- AI 紫色 / 渐变 / 光晕产品；
- 玻璃拟态；
- Windows Settings 克隆；
- 文学写作 App；
- 工程调试控制台；
- 固定工具条包围正文的传统富文本编辑器。

---

## Information Density

### Desktop

中等偏紧凑。

Sidebar 可以容纳较复杂 Page Tree，但不能逼仄。Document 区保持舒适长文阅读节奏。

### Tablet / Medium Width

优先保证文档有效宽度；Sidebar 必须可 collapse，不允许永久占据固定空间。

### Mobile

减少 persistent chrome。Touch target 不因视觉极简而缩小；交互 presentation 可以与 Desktop 不同。

---

## Navigation Philosophy

### Sidebar

保留：

- Workspace context。
- Page Tree。
- Settings。
- Logout。

要求：

- expanded Sidebar 左侧贴窗口边缘；
- **只在右上 / 右下使用圆角**；
- Desktop / Tablet 支持 collapse / reopen；
- Mobile 使用 drawer；
- footer 的 Settings / Logout 是完整 row interaction；
- active / hover / focus 使用同一 row anatomy。

### Workspace switching

使用锚定 Workspace trigger 的 floating popover。

禁止 inline panel 推动 Page Tree。

### Page actions

使用锚定 page-row ellipsis 的 floating popover / context menu。

禁止 action panel 改变树的纵向布局。

---

## Editor Philosophy

### Default reading/editing surface

Open Canvas。

Editor 外层没有持续 Border / Card / Surface。

### Persistent controls

默认不显示 Fixed Toolbar。

正常稳定态不同时长期显示：

- “已同步”
- “已保存到本地”

两套状态。

### Contextual controls

通过：

- Slash；
- selection；
- keyboard shortcut；
- context menu；
- touch toolbar；

提供编辑能力。

### Slash / command behavior

中文 UI 只显示中文。

禁止：

```text
Text
普通段落
```

应为：

```text
文本
```

若存在第二行，只提供补充语义，不重复翻译。

### Touch editing

Mobile / touch toolbar 是独立 presentation，不是 Desktop fixed toolbar 缩小版。

必须：

- 触摸目标约 44px；
- 不长期压缩正文；
- 与软键盘 / viewport 协调；
- 不因 Desktop Toolbar preference 被关闭。

---

## Attachment Philosophy

附件是文档内容，不是上传管理面板。

### Image

优先 inline media。Caption / menu 按需出现。

### File

允许轻量 block / row 表达文件名、必要 metadata 和 actions，但不得重新形成 nested card hierarchy。

### Uploading

Placeholder 必须位于最终插入位置：

```text
uploading
→ success
→ attachment block
```

或：

```text
uploading
→ error
→ retry/remove
```

原位转换，不让页面顶部出现独立上传中心。

### Failure

同一次失败只保留一个主要错误 Surface。

用户不需要知道：

- cleanup；
- orphan object；
- object storage；
- compensation queue。

这些由后台自动处理。

---

## Settings Philosophy

Settings IA 保持：

- Desktop / wide: list-detail。
- Compact: Index → Detail。

主要优化：

- Detail width 随可用空间适度增长并有 max cap；
- row / section / control 遵循 Quiet Studio；
- 不为了统一视觉强行重设计用户已经满意的 Login / Register。

---

## Feedback & Status Philosophy

### Normal synced

稳定正常状态：

```text
● 已同步
```

必须弱化，不抢正文。

### Local-only / offline

推荐产品文案：

```text
离线 · 本地已保存
```

必须和“已同步”语义严格区分。

### Saving / syncing

只在状态变化期间显示必要反馈，不永久占位。

### Error

错误文案必须 context-aware。

禁止直接显示：

- `Eotion API request failed: 502`
- HTTP endpoint；
- SDK fallback message；
- cleanup pending。

技术信息只进入：

- log；
- dev mode；
- 可展开 diagnostics。

---

## Brand / Accent Strategy

Quiet Studio 不依赖高饱和品牌色建立记忆。

品牌辨识来自：

- 温润 neutral；
- Open Canvas；
- Sidebar 右侧圆角；
- 低噪音 typography；
- 精确的 contextual interaction；
- Morphicons 动效。

Accent 应克制并服从内容。

---

## Light Theme Mood

关键词：

- warm neutral；
- paper-like but not literary；
- low glare；
- soft hierarchy；
- clean studio。

批准的视觉基线以 Quiet Studio Final Direction Candidate 为准，但 Stitch artifact 中任何新增业务内容、Material token、Newsreader 等均**不是** source of truth。

## Dark Theme Mood

尚未视觉冻结。

原则已冻结：

- 不使用纯黑大面积；
- 保持 Quiet Studio 的层级与温度；
- 不变成“黑色 + 高饱和 accent”；
- 不靠更多 surface/card 弥补对比。

具体 Dark tokens / screen 在 P5.7.3～P5.7.4 完成。

---

## Reference Products

只借鉴设计原则，不复制外观。

| Product / tradition | What to learn | What NOT to copy |
| --- | --- | --- |
| Notion | Document-first、progressive disclosure、内容优先 | 逐像素外观、品牌风格、全部交互 |
| Swiss / productivity tooling | 对齐、信息层级、长期耐看 | 冷硬工业感、过密 UI |
| Editorial layout | 阅读节奏、留白、文本优先 | Serif 默认品牌化、文学产品感 |
| Native desktop software | 精准 hover/focus、快捷操作 | OS 设置页视觉、复杂 chrome |

---

## Design Exploration Record

| Proposal | Strengths | Weaknesses | Adopted parts |
| --- | --- | --- | --- |
| Editorial Paper | 文档感、人文温度、留白 | Serif / 偏文学 | warm neutral、呼吸感 |
| Precision Studio | Sidebar 层级、生产力、对齐 | 易冷硬、曾引入 fixed toolbar | Sidebar density、popover 精度 |
| Ambient Focus | 现代、层次明显 | Document Card、紫色、渐变、SaaS 感 | 不采用主方向 |
| Quiet Studio A | 最符合 document-first、低 Chrome、耐看 | 初版略松 | **主视觉基底** |
| Quiet Studio B | 更精确、附件信息层级好 | fixed toolbar / 工具感过重 | 部分 hierarchy / density |
| Quiet Studio Final | A 为主 + B 精度 | Stitch spec artifact 不一致 | **正式方向** |

---

## Frozen Decisions

以下在 P5.7.5 Implementation 中不得由 Agent 自行改回：

- Design direction = **Quiet Studio**。
- Open Canvas；无 Editor outer Card。
- Sans Serif only。
- Fixed Toolbar 默认 OFF。
- Sidebar expanded 仅右上 / 右下圆角。
- Desktop / Tablet Sidebar 必须可 collapse / reopen。
- Workspace / Page management 使用 anchored floating interaction。
- Sidebar footer 为 full-row interaction。
- Stable state 不同时常驻两个 save/sync label。
- “已同步”和“离线 · 本地已保存”语义分离。
- Attachment uploading/error 在最终插入位置原位转换。
- Cleanup / HTTP / storage 技术术语不进入普通 UI。
- Slash Menu 单语言。
- 不使用 AI 紫色、渐变、glassmorphism、大型 document card。
- 不因 Stitch prototype 技术选择强制 Tailwind / Material Symbols。
- Eotion production icon system 继续使用 EotionIcon + Morphicons + Lucide data。

---

## Open Questions

以下不在 P5.7.2 猜测冻结：

- Dark Theme 最终色值。
- Settings detail 精确 responsive width curve / cap。
- Sidebar expanded width。
- Desktop / medium / compact 精确 breakpoint。
- Sidebar 用户手动折叠状态的持久化与 breakpoint 优先级。
- Mobile touch toolbar 最终 anatomy。
- File/Image attachment 最终 border 强度。
- Dialog / confirmation 的最终视觉规格。
- 全套 spacing / radius / motion token。

进入 P5.7.3 / P5.7.4 后解决。

---

## Approval

- Reviewer: User + ChatGPT
- Date: 2026-10-01
- Status: **PASS / FROZEN — Quiet Studio**
