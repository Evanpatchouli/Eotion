# P5.7.3 Design System v1 — Quiet Studio

## 状态

**FROZEN（2026-10-03）— P5.7 已存在能力的 Design System v1。**

本次冻结记录现有生产 UI 经多轮截图与真机交互迭代形成的基线，不追认原计划中实施前的 Gate A 已通过。**P5.7 Gate A Reconciliation：READY FOR FINAL USER SIGN-OFF**；最终视觉签字仍待用户完成。

P5.7.2 Design Direction 已冻结为 **Quiet Studio**。

本文件是 Eotion 自己维护的设计系统 source of truth，不直接采用 Stitch 导出的 DESIGN.md。Stitch 输出只作为视觉探索证据；其中的 Newsreader、Material 风格 token、Tailwind / Material Symbols、虚构业务内容等均不进入本规范。

本版本冻结下列已存在能力与边界：Quiet Studio、桌面与移动已实现页面、Settings、编辑器触控交互、链接交互及当前 Connectivity 状态。列入 Future / Out of P5 的能力不属于本版本；未能由生产源码、自动化测试或已有人工迭代记录证实的视觉及无障碍细节标为 **MANUAL CHECK REQUIRED**。

---

## Naming

生产实现建议使用语义 CSS variable，例如：

```css
--e-color-canvas
--e-color-sidebar
--e-color-surface
--e-color-surface-subtle
--e-color-hover
--e-color-selected
--e-color-text-primary
--e-space-4
--e-radius-sidebar
```

规则：

- 语义优先，不以具体颜色命名。
- token 不绑定 Tailwind。
- 不使用 Material 风格多层 `surface-container-*` token。
- component class 保持语义，例如 `.page-tree-item`、`.attachment-block`。
- Dark Theme 替换 semantic values，不复制整套 component CSS。

---

## Typography

### Font family

默认 Sans Serif only：

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

Inter 不可用时必须自然 fallback；不得依赖用户额外安装字体。

### Type scale — P5 production baseline

| Token | Size | Line height | Weight | Tracking | Usage |
| --- | ---: | ---: | ---: | ---: | --- |
| Page Title | 36px | 45px | 600 | -0.015em | 文档主标题 |
| Heading 1 | 24px | 32px | 600 | -0.01em | 一级正文标题 |
| Heading 2 | 20px | 27px | 600 | -0.01em | 二级正文标题 / 当前 Stitch 基线 |
| Body | 15px | 26px | 400 | normal | 正文 |
| UI | 14px | 20px | 400–500 | normal | Sidebar、按钮、菜单 |
| Metadata | 13px | 18px | 400–500 | normal | 附件 metadata、breadcrumb |
| Caption | 12px | 18px | 400 | normal | 次级状态、辅助说明 |

原则：

- 不使用 Serif 作为默认 Page / Heading。
- 中文与 Latin 共用视觉层级，不强求像素级字面高度一致。
- 正文行高偏舒适，不追求代码编辑器式紧密。
- 不通过过多 weight 制造层级。

---

## Spacing Scale

P5 生产 token 使用有限 scale：

| Token | Value | Typical usage |
| --- | ---: | --- |
| 1 | 4px | icon/text micro gap |
| 2 | 8px | compact internal gap |
| 3 | 12px | row inner gap |
| 4 | 16px | standard component padding |
| 5 | 20px | medium content gap |
| 6 | 24px | section gap |
| 8 | 32px | major section rhythm |
| 10 | 40px | page rhythm |
| 12 | 48px | large separation |
| 16 | 64px | major canvas spacing |

允许少量 optical correction，例如 6px / 10px，用于：

- popover offset；
- icon baseline；
- thin control internal alignment。

禁止组件自行持续产生 17 / 19 / 27 / 43px 等无系统值。

---

## Layout / Grid

### Topbar

当前基线：

```text
44px
```

保持低存在感，只承载：

- sidebar reopen / navigation control；
- breadcrumb；
- sync state；
- 真正必要的 page-level actions。

### Sidebar

当前视觉方向：

- 左侧 flush to window edge；
- 仅右上 / 右下圆角；
- row height：**32px**；
- expanded width：Desktop **252px**、Tablet **210px**；
- Desktop / Tablet 必须支持 collapse；
- Mobile 使用 drawer。

### Document

Desktop Light 当前 approved target：

```text
comfortable reading width: 720–740px
```

这表示正文理想 reading column，不等于所有 block 必须死锁 720px。未来 table / code / wide media 可定义 wider block strategy。

主文档保持 Open Canvas，不使用 outer card。

### Settings detail

**✅ FROZEN（2026-10-02）**

Quiet Studio Desktop Settings 已通过 Light Theme 高保真推演与人工 review。Stitch 导出的三档 viewport / HTML 宽度存在不一致，因此正式规范采用人工归一化后的视觉行为，而不是逐字复制 prototype 数值。

- Settings navigation width：**240px**。
- Detail minimum width：**520px**。
- Detail preferred behavior：随可用空间温和增长。
- Detail maximum width：**740px**。
- 视觉目标：
  - 1280 viewport：约 **620px**。
  - 1440 viewport：约 **700–720px**。
  - 1600+ viewport：**740px cap**。
- Outer horizontal gutter：
  - 1280：**48px**。
  - 1440：**64px**。
  - 1600+：**80px**。

实现不要求机械使用某个固定 `48vw`；允许通过 `clamp()` / container calculation 达到上述视觉行为。

Settings 继续保持 P5.6 已验收的 Desktop list-detail IA。不得扩展成 full-width admin form，也不得重新把每个 section 包成 Card。

### Mobile gutters

- Settings Detail 当前 production gutter：**30px**（390×844 回归覆盖）。
- Page 当前 production 在 `<768px` 使用 `width: calc(100% - 32px)`，390px 下标题与正文左右各 **16px**；该值只适用于现有 Page，不扩展为所有未来屏幕通用 token。

---

## Radius

当前语义：

| Token | Value | Usage |
| --- | ---: | --- |
| control | 6px | compact controls / small selected surface |
| block | 8px | lightweight attachment / inline block |
| popover | 10px | menu / workspace popover |
| dialog | 12px | modal / confirm |
| sidebar | 16px | expanded Sidebar 右上 / 右下 |

原则：

- Canvas / Editor 不因“统一圆角”获得 Card。
- Radius 只用于真正有 surface 边界的元素。
- 不做 pill-heavy UI。

---

## Light Semantic Colors

### Surfaces

| Token | Value | Usage |
| --- | --- | --- |
| canvas | `#FAF9F6` | Document open canvas |
| sidebar | `#F5F4F0` | Sidebar |
| surface | `#FFFFFF` | 普通浮层 / controls surface |
| surface-subtle | `#F7F6F3` | Attachment / embedded subtle block |
| elevated | `#FFFFFF` | Popover / menu |
| overlay | `rgba(31,31,30,0.20)` | 极少量 modal overlay |

### Interaction

| Token | Value | Usage |
| --- | --- | --- |
| hover | `#EEEDE8` | Sidebar / menu row hover |
| selected | `#E6E4DD` | Current Page / selected row |
| focus | `#3D3C38` | keyboard focus |
| border | `#E8E6E1` | structural border |
| border-subtle | `#EFEEE9` | very subtle separation |

### Text

| Token | Value | Usage |
| --- | --- | --- |
| text-primary | `#1F1F1E` | Title / body |
| text-secondary | `#5A5852` | UI / metadata |
| text-muted | `#706E67` | secondary status / hint |

### Functional

| Token | Value | Usage |
| --- | --- | --- |
| accent | `#3D3C38` | restrained primary emphasis |
| success | `#4B6B54` | synced |
| warning | `#9E6B34` | offline / pending |
| danger | `#A8423F` | destructive / failed |

这些色值是当前 Quiet Studio Light baseline，与生产 `tokens.css` 一致。后续有意变更需同步更新设计规范与视觉快照；不得改回冷蓝 SaaS / purple AI 方向。

Light `text-muted` 已从 Stitch 初始 `#8F8D86` 修正为 `#706E67`：在 `sidebar #F5F4F0` 上约 4.64:1，在 `canvas #FAF9F6` 上约 4.85:1，适用于 12–13px muted text 的 AA 基线。

---

## Dark Semantic Colors

**✅ FROZEN（2026-10-02）**

Quiet Studio Dark 已通过 1440×900 Desktop Page 高保真推演与人工 review。保持与 Light 相同的 typography、spacing、geometry、surface hierarchy 和 interaction pattern，只替换主题语义色值。

### Surfaces

| Token | Value | Usage |
| --- | --- | --- |
| canvas | `#1C1B1A` | Dark document open canvas |
| sidebar | `#181716` | Dark Sidebar |
| surface | `#242321` | bounded controls / panel surface |
| surface-subtle | `#22211F` | attachment / embedded subtle block |
| elevated | `#242321` | popover / menu |
| overlay | `rgba(0,0,0,0.45)` | modal overlay |

### Interaction

| Token | Value | Usage |
| --- | --- | --- |
| hover | `#2B2A27` | Sidebar / menu row hover |
| selected | `#33322E` | selected row |
| focus | `#C8C5BD` | keyboard focus |
| border | `#2E2D2A` | structural border |
| border-subtle | `#262522` | very subtle separation |

### Text

| Token | Value | Usage |
| --- | --- | --- |
| text-primary | `#EDECE8` | Title / body |
| text-secondary | `#A3A199` | UI / metadata |
| text-muted | `#8F8D86` | weak metadata / hints |

### Functional

| Token | Value | Usage |
| --- | --- | --- |
| accent | `#EDECE8` | restrained primary emphasis |
| success | `#6E9B7B` | synced |
| warning | `#C28D52` | offline / pending |
| danger | `#D06A66` | destructive / failed |

### Accessibility notes

Stitch 原始提议中的 `text-muted #73716A` 与 `danger #C9615D` 在关键 dark surfaces 上对比不足，因此正式规范采用上表修正版：

- `text-muted #8F8D86`：在 `surface-subtle #22211F` 上约 4.84:1。
- `danger #D06A66`：在 `surface-subtle #22211F` 上约 4.55:1。

`border #2E2D2A` 保持低对比，仅作为 subtle structure；当某 interactive control 的边界是唯一可识别线索时，不得只依赖该 border，需要 focus / state / surface 等共同表达。

Dark Theme 不是简单 invert，也不得增加额外 Card / Surface 层级。

---

## Surface Hierarchy

只保留有限层级：

```text
Canvas
Sidebar
Surface-subtle
Surface
Elevated
Overlay
```

### Canvas

用于：

- Page / Editor 主体。

默认无边框、无阴影。

### Sidebar

导航区域自己的材质层。

### Surface-subtle

仅用于需要轻量承托但不应“浮起来”的 inline block，例如附件。

### Surface

普通 control / bounded component。

### Elevated

只用于真正脱离文档流的：

- Popover；
- Menu；
- Dropdown；
- Dialog-like floating surface。

### Overlay

只用于需要阻断背景交互的 modal。

---

## Border Rules

默认：

> **No border is better than decorative border.**

允许 Border：

- 输入控件；
- Popover / menu；
- Attachment block（按当前生产组件的轻边界表达）；
- 真正结构分隔；
- focus / selected state。

禁止为了：

- 表示“Editor”；
- 表示“一组正文”；
- 表示“这里是一个 section”；

自动加 Card border。

---

## Shadow

当前只批准一档轻 elevation：

```text
popover:
0 4px 16px rgba(0,0,0,0.06)
```

原则：

- Sidebar 不靠重 shadow；
- Attachment 不靠 shadow；
- Document 无 shadow；
- 禁止彩色 shadow / glow。

未来 Dialog shadow 进入对应产品阶段再定义，不属于 P5 v1 冻结范围。

---

## Icons

Production source of truth：

- `EotionIcon`
- `morphicons/vue`
- Lucide icon data

不是：

- Material Symbols；
- 文本字符；
- emoji。

当前建议尺寸：

| Context | Size |
| --- | ---: |
| inline / tree | 16px |
| standard control | 18px |
| prominent control | 20px |
| empty/state illustration icon | 24px+ only when justified |

要求：

- `reducedMotion="user"`。
- Icon-only control 有 aria-label。
- Morph 只用于状态切换有意义的 icon。
- 不为了动画强行 morph。

---

## Motion

P5 motion token：

| Token | Duration | Usage |
| --- | ---: | --- |
| fast | 120ms | hover / micro feedback |
| normal | 180ms | menu / small surface |
| slow | 240ms | sidebar / larger layout transition |

上传 success：

```text
progress → completed metadata
≈ 180–200ms fade/morph
```

原则：

- Layout motion 不能延迟内容可用性。
- Sidebar collapse 动效不影响 document width 最终稳定。
- Reduced motion 下关闭非必要位移/弹性动画。

---

## Focus

Keyboard focus 必须清楚，但不长期像 selected state。

建议：

- 1.5–2px visual ring；
- 使用 `focus` semantic token；
- 与 border 有足够对比；
- 不通过只改变 background 表达 keyboard focus。

当前正式 token 的已核查对比度见本页 Light/Dark color notes；完整组件状态的 WCAG 对比仍需最终人工 QA。

---

## Interaction States

### Hover

轻 surface，不改变布局。

### Active / Pressed

比 hover 稍深，但不做明显 scale animation。

### Selected

用于：

- 当前 Page；
- 当前 Workspace；
- 当前 Setting nav。

不与 hover 混淆。

### Disabled

降低 contrast，但保留 label 可读性。

### Loading

优先局部，不用全屏 spinner 覆盖已有 local-first 内容。

### Error

就近、context-aware、可行动。

### Success

尽量瞬时或弱化，不让成功 toast 长期占位。

---

## Controls

### Button

- 共享 `EotionButton` 默认采用紧凑高度：desktop pointer 28px，coarse/touch pointer 36px；各 variant 共用高度，页面操作区不再重复覆盖。
- 这是 2026-10-02 用户基于实际视觉检查主动要求的密度调整：此前按钮高度肉眼观感偏高，因此 36px 是有意保留的 compact text-button 规格，而不是待修复的 44px 缺失。除非后续真机可用性验证表明确有问题，不要机械恢复为 44px。
- Primary 使用克制 accent，不做彩色渐变。
- Secondary / ghost 尽量由 typography + hover 表达。
- Danger 只在 destructive action 使用。
- 不让所有 action 都表现成 bordered button。

### Icon Button

- hit target 与视觉 icon 分离；
- Desktop pointer 最小可交互区域建议约 32px；
- touch 约 44px。

### Input

- Boundary 清晰但轻；
- focus 提升边界，不改 layout。

### Switch / Radio

保留 P5.6 已验证的 accessibility 语义。

Settings 高保真后冻结的视觉原则：

- bounded choice 仅在确有离散选项承载需要时使用轻量边界；
- 不把每个 setting row 都做成独立 Card；
- keyboard focus 使用清晰 2px 左右 focus ring，避免被外层 radius 裁切。

### Menu Item

统一 full-row hit area。

支持：

- icon；
- label；
- optional shortcut；
- destructive state。

### Popover

**✅ Desktop companion states 已冻结（2026-10-02）。**

通用：

- 必须 anchored；
- 不参与原文档/树布局；
- 使用 `elevated` + border + light shadow；
- Light popover baseline：`border: #E8E6E1`、`radius: 10px`、`shadow: 0 4px 16px rgba(0,0,0,0.06)`；
- menu row 使用 full-row hit area；
- ESC / click-outside 关闭；
- 关闭后 focus 回到 trigger；
- keyboard arrow navigation / focus-visible 必须可用；
- menu 打开/关闭不得造成 Page Tree 或 Document layout shift。

Workspace Switcher：

- 宽度约 **240px**；
- 与 workspace trigger 相距约 **6px**；
- 当前 workspace selection 克制表达；
- 只包含现有 workspace 行为，不扩展管理能力。

Page Action Popover：

- `min-width: 160px`；
- 内衬 **4px**；
- 锚定当前 Page row 的 ellipsis；
- actions 固定为：`新建子页面`、`重命名`、`移动`、`删除`；
- `删除` 使用 danger 语义，但不作为默认初始焦点。

### Existing Page Action Dialog / Confirm

当前 P5 产品在 Mobile Page 重命名/移动、以及 Page 删除确认中使用 `EotionCommandOverlay` 的原生 `<dialog>`；不是浏览器 `alert/confirm/prompt`。移动端 dialog 保留 `calc(100% - 32px)` 的宽度上限、16px 内容内边距，移动目标列表在短 viewport 内滚动；删除确认展示标题、说明与“取消”/danger“删除”。焦点、取消、错误保留与树布局稳定由 `product-pages.spec.ts` 覆盖。该现有形态属于 P5 v1；未来通用 Dialog 变体和 shadow 扩展另行设计。

---

## Editor-specific Primitives

### Page Title

36 / 45 / 600。

直接位于 Canvas，无 title card。

### Body

15 / 26 / 400。

### Selection

保持浏览器原生文本选区高亮；P5 未定义独立 selection color token。真实宿主 Selection Menu 与高亮视觉仍需设备 QA。

### Slash Menu

- 单语言；
- 中文当前只显示中文；
- row 使用 Menu anatomy；
- second line 仅补充语义。

### Context Controls

hover / selection / slash 按需暴露。

### Fixed Toolbar

默认 OFF。

### Touch Toolbar

当前 production contract：layout 为 Mobile，或输入模式为 touch / hybrid 时显示触摸工具栏；Desktop fixed toolbar preference 不控制它。工具项 hit area 至少 44px，并通过 `visualViewport` resize / scroll 更新键盘 inset，尽量使光标保持在工具栏上方。触摸选区使用浏览器原生 Selection Menu；不显示 Desktop Bubble。具体真机视觉与键盘行为仍需在 Gate A 最终手工签字中检查。

### Attachment Block

Document-native。

#### Uploading

最终插入位置原位显示：

- icon；
- filename；
- restrained progress；
- cancel（如当前产品支持）。

#### Success

原位转成正式附件。

只显示现有真实 metadata，不允许设计系统虚构：

- upload byte totals；
- 更新时间；
- download/share；

等未实现能力。

#### Error

**✅ Desktop failure state 已冻结（2026-10-02）。**

原位显示：

- 文件名；
- `上传中断`；
- `重试`；
- `移除`。

规则：

- 保持在原最终插入位置；
- block 继续使用 `surface-subtle` + `block radius 8px`；
- danger 只强调错误状态，不把整个 block 染红；
- `重试` 是主要恢复动作；
- `移除` 是次要/放弃动作；
- 同一次失败只保留一个主要错误 surface；
- 不出现顶部重复 error banner；
- 不暴露 cleanup / object-storage / compensation 等技术术语；
- 不虚构 byte totals / timestamp / download / share。

Desktop pointer 下 recovery actions 目标区域不得小于约 32px。

---

## Sync / Connectivity UI

### Synced

```text
● 已同步
```

低视觉权重。

稳定保存/同步反馈只使用 ProductShell 顶部 `SyncStatus` 一处常驻入口。稳定在线状态不得同时常驻“已同步”与“已保存到本地”；Page 标题旁不显示本地保存状态。本地持久化失败仍在编辑器附近显示错误及重试。

### Offline / Local-only

```text
离线 · 本地已保存
```

和 synced 严格区分。

### Technical diagnostics

raw HTTP / SDK / endpoint / cleanup 只进入：

- developer logging；
- expandable diagnostics；
- test output。

Connectivity screen 只描述当前生产状态组合：backend unavailable 时可用 cached identity 和本机已有 workspace snapshot 恢复；没有本地 snapshot 时明确提示该工作区尚未保存在本机、当前离线无法打开；已有本地内容仍可保存并在顶部显示“离线 · 本地已保存”；同步失败提供“重试”；恢复后顶部显示“已同步”。本地保存失败仍由编辑器就近显示错误与重试。不得据此增造新页面、按钮或状态。

---

## Settings Primitives

### Navigation

- width：240px。
- category label：12px / muted。
- navigation item：34px row height。
- selected 使用既有 `selected` token。
- 与主 Product Sidebar 同源，但不做像素级镜像。

### Setting row

标准 anatomy：

```text
[18px Icon]  [Title 14px / 500]
             [Subtitle 13px / 400]      [Accessory]
```

- row height：约 48–56px（取决于是否有 subtitle）。
- full-row interaction。
- accessory 右对齐。
- 必要时使用 `border-subtle` 做轻分隔，不默认加 Card。
- selected/checked state 不改变布局。

### Section rhythm

- Title → description：8px。
- Description → section heading：32px。
- Section heading → control group：12px。
- Section → section：40px。
- 不新增 Settings-only radius / border token。

---

## Responsive Density

### Wide Desktop

- Sidebar 默认 presentation：expanded candidate。
- Document 保持 720–740px reading width。
- Sidebar collapsed 时完全退出主内容区，document reading column 继续稳定居中。
- collapsed topbar 在 breadcrumb 前提供唯一 reopen control。
- reopen control 视觉按钮约 32×32px、control radius 6px；实现可将 pointer hit area 扩大到约 36–40px，而不放大视觉尺寸。
- tooltip：`展开侧边栏`。
- 当前断点：`<768px` Mobile drawer；`768–1199px` Tablet 210px sidebar；`≥1200px` Desktop 252px sidebar。

### Medium / Tablet

- Sidebar 必须可以收起。
- 当前生产默认展开，用户可在本次会话中手动 collapse/reopen；`desktopSidebarCollapsed` 为组件状态，未提供跨会话 preference。设计系统不虚构持久偏好。

### Mobile / Compact

- Sidebar = drawer。
- Settings = Index → Detail。
- Settings Index 的唯一 topbar Back 返回 `returnTo`；Detail 的唯一 topbar Back 返回 Index 并保留 `returnTo` / `workspaceId`。不恢复 `.settings-compact-back`。
- Document 继续使用同一 Web UI；Mobile / coarse / hybrid 使用 Touch Toolbar 与原生 Selection Menu。

---

## Accessibility Baseline

- Touch target：icon-only、导航、disclosure 等高精度点击目标原则上约 44×44px；共享紧凑文本按钮 `EotionButton` 是已批准例外，coarse/touch pointer 高度为 36px（2026-10-02 用户实测确认此前高度偏高）。
- Keyboard：所有 Sidebar / Menu / Settings / Editor command 关键路径可操作。
- Focus-visible：必须可见。
- Reduced motion：尊重用户偏好。
- Color 不是唯一状态信号。
- Popover 有正确 focus return。
- Error / status 使用合适 live region，不把整页变成 alert。
- 最终 contrast 以 WCAG 2.2 AA 为最低目标，具体在实现阶段验证。
- 页面整体、真实设备辅助技术操作、颜色对比及 Page 两处保存状态并存时的最终视觉核验：**MANUAL CHECK REQUIRED**；不以自动测试覆盖宣称完成。

---

## Implementation Independence

Design System 定义：

- appearance；
- hierarchy；
- interaction；
- token semantics；
- responsive behavior。

不规定：

- Tailwind；
- Material Symbols；
- Stitch HTML；
- React；
- 特定 CSS utility framework。

Eotion P5.7.5 继续基于现有 Vue / semantic CSS / CSS variables / Morphicons 架构实施，除非另有技术决策。

---

## Token Migration Mapping

原计划在 Gate A 后、Implementation 前填写；production implementation 已先行。本轮通过 `apps/web/src/styles/tokens.css` 核对正式语义 token：

| Current | Quiet Studio | Status |
| --- | --- | --- |
| `--e-color-canvas` | canvas | 已核对 Light/Dark 数值 |
| `--e-color-sidebar` | sidebar | 已核对 Light/Dark 数值 |
| `--e-color-surface`、`--e-color-surface-subtle`、`--e-color-elevated` | surface hierarchy | 已核对 Light/Dark 数值 |
| `--e-color-text-primary/secondary/muted` | text hierarchy | 已核对 Light/Dark 数值 |
| `--e-color-border`、`--e-color-border-subtle` | structural borders | 已核对 Light/Dark 数值 |

`apps/web/src/styles/base.css` 仍保留旧 `--surface` / `--text-*` 等变量供其它现存界面使用；不把这组 legacy 名称误称为已迁移的 Quiet Studio token，也不为本轮作全局 CSS 重构。

---

## Frozen for P5 existing capabilities

已作为 P5 当前生产能力的 source of truth：

- Quiet Studio Light / Dark visual direction。
- Desktop Settings visual language / width behavior。
- Desktop companion states：Sidebar collapse/reopen、Workspace Popover、Page Action Popover、Attachment Upload Failed。
- Sans Serif only。
- Open Canvas。
- Light semantic palette。
- Sidebar right radius = 16px。
- Tree row = 32px。
- Page Title / Heading / Body 基线。
- Document reading width = 720–740px。
- Limited surface hierarchy。
- Anchored Popover。
- Single-language Slash Menu。
- Attachment in-place lifecycle。
- Synced vs Offline semantic distinction。
- EotionIcon / Morphicons / Lucide。

---

## Future / Out of P5

- Table / Callout / Mention blocks and their visual anatomy。
- 未来通用 Dialog 变体与更广的 confirm visual spec；当前 Page action dialog/confirm 已纳入 P5 基线（仍禁止 browser `alert/confirm/prompt`）。
- Wide blocks and their responsive behavior。
- Collaboration UI and its interaction states。

以上不属于本次已存在能力冻结范围，不作为本轮实现内容。已存在能力的最终视觉签字仍是 Gate A 的待办。

---

## Approval / Reconciliation

- Design System v1 state: **FROZEN（2026-10-03）**，范围为 P5 已存在能力。
- Gate A state: **READY FOR FINAL USER SIGN-OFF**。
- Final visual reviewer / sign-off date: **待用户签字**。
- 历史说明：不声明原计划的实施前 Gate A 曾通过。
