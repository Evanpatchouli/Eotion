# P5.7.3 Design System v1 — Quiet Studio

## 状态

**DRAFT / 当前进入 P5.7.3。**

P5.7.2 Design Direction 已冻结为 **Quiet Studio**。

本文件是 Eotion 自己维护的设计系统 source of truth，不直接采用 Stitch 导出的 DESIGN.md。Stitch 输出只作为视觉探索证据；其中的 Newsreader、Material 风格 token、Tailwind / Material Symbols、虚构业务内容等均不进入本规范。

当前只冻结已经充分验证的 Desktop Light 基线和核心语义。Dark、Mobile、Settings 宽度曲线、完整 responsive 断点和部分 component anatomy 仍需在 P5.7.3～P5.7.4 继续确认。

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

### Type scale — current draft

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

当前建议使用有限 scale：

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
- expanded width：**暂不冻结，P5.7.4 再验证**；
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

**TBD。**

冻结原则：

- 1280 左右保持紧凑；
- 1440 / 1600 / wider 时适度增长；
- 有 max cap；
- 不铺满大屏；
- 具体 clamp / cap 在 Settings 高保真稿后确定。

### Mobile gutters

**TBD after P5.7.4 Mobile Page.**

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
| text-muted | `#8F8D86` | secondary status / hint |

### Functional

| Token | Value | Usage |
| --- | --- | --- |
| accent | `#3D3C38` | restrained primary emphasis |
| success | `#4B6B54` | synced |
| warning | `#9E6B34` | offline / pending |
| danger | `#A8423F` | destructive / failed |

这些色值是当前 Quiet Studio Light baseline。P5.7.4 Visual QA 可做小幅 optical tune，但不得改回冷蓝 SaaS / purple AI 方向。

---

## Dark Semantic Colors

**TBD / 未冻结。**

必须通过 Dark Page 高保真稿后填写。

约束：

- 不是简单 invert。
- 不使用大面积纯 `#000`。
- 保持 Quiet Studio 的低眩光和 warm-neutral 感。
- surface hierarchy 不能因为 dark 而增加层级。
- success / warning / danger 保持低饱和、可读。

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
- Attachment block（最终强度待稿件确认）；
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

Dialog shadow 在 Core Screen / Dialog 设计后补充。

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

当前 draft：

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

最终 WCAG contrast 在实现 QA 验证。

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

保留 P5.6 已验证的 accessibility 语义；视觉进入 Settings 高保真后再微调。

### Menu Item

统一 full-row hit area。

支持：

- icon；
- label；
- optional shortcut；
- destructive state。

### Popover

- 必须 anchored；
- 不参与原文档/树布局；
- 使用 `elevated` + border + light shadow；
- 关闭逻辑与 keyboard/focus 明确。

### Dialog / Confirm

**TBD visual details**，但禁止 browser `alert/confirm/prompt`。

---

## Editor-specific Primitives

### Page Title

36 / 45 / 600。

直接位于 Canvas，无 title card。

### Body

15 / 26 / 400。

### Selection

保持编辑器原生可感知性，具体 selection color 待 Light/Dark QA。

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

**TBD after Mobile Page design。**

必须：

- 约 44px touch target；
- 不依赖 Desktop fixed toolbar preference；
- 不永久抢占过多 viewport。

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

原位显示：

- 上传中断 / context-aware message；
- 重试；
- 移除。

不能同时再出现重复全局 error。

---

## Sync / Connectivity UI

### Synced

```text
● 已同步
```

低视觉权重。

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

---

## Responsive Density

### Wide Desktop

- Sidebar 默认 presentation：expanded candidate。
- Document 保持 720–740px reading width。
- 具体 wide threshold 待 P5.7.4。

### Medium / Tablet

- Sidebar 必须可以收起。
- 默认策略、自动策略和 user preference 优先级未冻结。

### Mobile / Compact

- Sidebar = drawer。
- Settings = Index → Detail。
- Document / touch toolbar 在 P5.7.4 设计。

---

## Accessibility Baseline

- Touch target：约 44×44px。
- Keyboard：所有 Sidebar / Menu / Settings / Editor command 关键路径可操作。
- Focus-visible：必须可见。
- Reduced motion：尊重用户偏好。
- Color 不是唯一状态信号。
- Popover 有正确 focus return。
- Error / status 使用合适 live region，不把整页变成 alert。
- 最终 contrast 以 WCAG 2.2 AA 为最低目标，具体在实现阶段验证。

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

Gate A 后、Implementation 前，由 Codex 调查现有 token/hard-code 后填写。

当前禁止把旧 token 直接视为新规范。

| Current | Quiet Studio | Status |
| --- | --- | --- |
| current app background | canvas | TODO |
| current sidebar background | sidebar | TODO |
| current surface tokens | semantic surface hierarchy | TODO |
| current text tokens | text-primary/secondary/muted | TODO |
| current borders | border / border-subtle | TODO |

---

## Frozen in this draft

已可作为 P5.7.4 source of truth：

- Quiet Studio Light visual direction。
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

## Still open before Design System PASS

- Dark semantic palette。
- Settings width curve/cap。
- Sidebar expanded width。
- Exact responsive breakpoints。
- Sidebar collapse preference behavior。
- Mobile typography/density optical adjustments。
- Touch toolbar final anatomy。
- Dialog/confirm visual spec。
- Image/File attachment exact border/background treatment。
- Full interactive companion states。
- Core screen visual approval。

---

## Approval

- Reviewer: User + ChatGPT
- Date: 2026-10-01
- Status: **DRAFT — approved direction encoded; not yet Design System PASS**
