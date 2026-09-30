# P5.7.1 UI/UX Audit

## 状态

**IN PROGRESS / 第一批 Page & ProductShell 证据已审计。**

本阶段只审计，不修改正式产品 UI。

## 审计目标

本轮先审计正式 ProductShell / Page / Editor 在 Desktop、约 1024px 中等宽度和 390px Mobile 下的真实表现；后续再补 Settings、Login/Register、Connectivity、完整附件状态等 Surface。

当前证据由用户在 2026-10-01 提供，包括 Desktop Light（带红框标注）、Desktop Dark、中等宽度 Light/Dark、Mobile Sidebar drawer、Mobile Page + 图片附件。红框表示用户明确不满意、要求后续重新设计的重点区域；本阶段只记录，不修改正式 UI。

## Screenshot Baseline

> TODO：为以下 Surface 补充 Light / Dark、Desktop / Tablet / Mobile 的当前截图或链接。

| Surface | Desktop Light | Desktop Dark | Tablet | Mobile | Notes |
| --- | --- | --- | --- | --- | --- |
| Login | Excessive persistent chrome | Editor border、Workspace panel、Page active row、inline menus、Attachment card 同屏叠加 | 产品更像工程表单/后台，而不是文档工具 | P5.7 以 content-first / low-chrome 重新分层 |
| Duplicate context/status | Workspace 多处重复；已同步 + 已保存到本地并列 | 稳定态仍持续抢占注意力 | 合并、弱化或按需显示 |
| Inline menus disturb layout | Workspace 展开 panel / Page action menu 推动后续内容 | 导航树节奏跳动，操作与内容混在一层 | 优先评估 anchored popover/menu |
| Fixed non-mobile sidebar | 1024px/desktop 均不能 collapse | 中等宽度侵占正文，缺少专注模式 | 设计 desktop/tablet collapse + reopen + persistence |
| Desktop-density copied to touch | Mobile drawer tree/menu 与 touch toolbar 仍偏桌面控件思路 | 手机空间利用率和聚焦感差 | Mobile presentation 单独设计，能力共享但 UI 不硬复用 | 后续批次 |
| Register | Editor outer Card | 表达编辑区域边界 | 高概率可以移除 | Canvas 本身即编辑区；focus/context 通过局部反馈 |
| 正文 Workspace label | 显示所在 Workspace | 高概率可以移除/降级 | breadcrumb / Sidebar 已提供上下文 |
| 永久 local-save 文案 | 表达本地持久化 | 稳定态可弱化/隐藏 | 变化或异常时显示；正常态采用轻量 feedback |
| Inline Page action menu | Page CRUD | UI 布局应移除，能力保留 | anchored popover/context menu |
| Workspace 展开态重复 current row | 表示当前选择 | 可合并 | trigger 自身承担 current state，popover 列其他 Workspace/actions |
| Attachment Card chrome | 图片文件元信息/操作 | 图片场景可大幅减少 | inline media + contextual actions/caption | 后续批次 |
| Connectivity | TODO | TODO | TODO | TODO | 后续批次 |
| ProductShell | 已提供 | 已提供 | 已提供 | 已提供 | 当前批次 |
| Sidebar / Workspace switcher | 已提供 | 已提供 | 已提供 | 已提供 drawer | 当前批次 |
| Page Tree | 已提供 | 已提供 | 已提供 | 已提供 drawer | 当前批次 |
| Page / Editor | 已提供 | 已提供 | 已提供 | 已提供 | 当前批次 |
| Slash menu | 已提供 | 未单独提供 | 已提供结构 | 已提供结构 | 结构可保留；需移除中英双语重复 |
| Attachments | 已提供文件/上传中/失败 | 部分 | 部分 | 已提供图片 | 关键状态已具备，足够完成本轮 Audit |
| Settings | TODO | TODO | TODO | TODO | 后续批次 |
| Empty / Error / Offline | TODO | TODO | TODO | TODO | 后续批次 |

## Global Findings

### Information hierarchy

- Page 同时长期显示 topbar breadcrumb、正文上方 Workspace 名、Page Title、topbar “已同步”、正文区“已保存到本地”，上下文与状态存在明显重复。
- Workspace 名在 Sidebar、Workspace selector、展开的 Workspace panel、正文上方再次出现，层级过多而信息增量很低。
- “已同步”与“已保存到本地”语义不同，但在正常稳定态同时长期可见，视觉上被理解为两个并列状态，干扰 document-first。
- Page Title 应成为正文区域第一视觉焦点；当前其周围存在 Workspace label、远端保存状态以及大 Editor container，焦点被分散。

### Typography

- Page Title 的视觉权重基本成立，可以作为后续方向的保留候选。
- UI 文本、正文、Sidebar label、状态文字的字号层级存在，但缺少更明确的系统节奏；多个 11～13px 灰字在同一屏同时出现，造成“工程状态面板”感。
- Editor 内容标题与 Page Title 都较粗，配合大边框容器后容易产生“两层卡片标题”感。
- 后续应以 Design System 统一 Page title / body / UI / caption，而不是局部继续调整。

### Spacing / rhythm

- Desktop 主内容在超宽屏上横向居中基本合理，但纵向首屏留白偏多，Page Title 与实际正文之间被大 Editor container 强化分隔。
- Sidebar 内 Workspace selector、展开 panel、Pages heading、Page tree 使用不同的 padding/radius/gap 组合，节奏不统一。
- Page tree 打开 inline action menu 后会把子页面整体向下推，破坏树本身的纵向节奏。
- Mobile 在 390px 下 Editor 外框 + Attachment 内框形成多层 gutter，实际内容宽度被连续吃掉。

### Surface / Card / Border usage

- **高优先级问题：Editor 被做成一个巨大有边框、圆角的 Card。** 这让 Eotion 更像“表单里的富文本输入框”，而不是 document canvas。
- Attachment 图片再次被放进有边框 Card，形成 “Editor Card → Attachment Card” 的嵌套框层级，Mobile 尤其拥挤。
- Workspace switcher 展开区域、Page action menu、active Page row 都大量依赖矩形 surface/border，Sidebar 呈现明显的“框框叠框框”。
- 后续 Design Direction 应明确默认 **无 Card / 无 Border**，只有真正需要边界、浮层或控件语义时再出现 Surface。

### Navigation

- **明确 UX 缺陷：非 mobile 宽度当前无法收起 Sidebar。** 这在 1024px 等中等宽度明显侵占文档空间，也剥夺 Desktop 用户专注写作模式；P5.7 必须设计 desktop/tablet collapse/reopen 行为。
- Mobile drawer 的基本模式可保留，但 drawer 内同时展开 Workspace panel 与 Page action menu 时信息密度过高。
- Topbar breadcrumb 对定位有价值，但与正文 Workspace label 重复；后续应只保留一套主要位置上下文。
- Desktop/Tablet Sidebar collapse 不应简单复制 Mobile drawer；需要明确折叠态、恢复入口、是否记忆状态以及窄宽度下的自动行为。

### Editor chrome

- 默认关闭 fixed toolbar 的方向正确，符合 document-first。
- 但 Editor 自身仍通过大边框持续表达“这里是一个编辑器”，Chrome 仍然过强。
- 中等宽度/touch 环境底部 toolbar 视觉重量很高，按钮等宽大框排列，更像独立控制面板而不是 keyboard accessory/contextual editing。
- Mobile fixed touch toolbar 占据明显垂直空间；后续应重新设计信息密度、图标/文字策略、横向 overflow 和键盘联动，而不是只换颜色。
- Slash Menu 的浮层尺寸、层次和选中态总体可用，不是 P5.7 重点推翻对象；当前主要问题是每项“英文标题 + 中文解释”实际在重复表达同一件事，造成无必要的信息密度。
- Slash Menu 应遵循当前界面语言，只显示一套本地化文本，例如“文本 / 标题 / 项目列表 / 图片 / 文件”。未来 i18n 通过翻译资源切换语言，不在同一菜单项同时展示中英文。
- 如未来确实需要 secondary description，应提供补充语义而不是翻译重复，例如“图片 — 从设备上传”，而不是“Image / 插入图片附件”。

### Interaction density

- Page row 同时承载展开箭头、文档图标、标题、active background、ellipsis；打开 menu 后又插入四个纵向动作，单个树节点的视觉重量过高。
- Workspace switcher 打开后重复显示当前 Workspace，并永久展示“新建工作区 / 重命名当前工作区”两项动作，作为切换器显得过重。
- Settings / Logout 固定在 Sidebar 底部目前可以使用，但账号、Workspace、Page 管理三类操作散落在不同区域，后续应重新审视入口层级。

### Responsive / compact behavior

- 1024px 下 Sidebar 仍固定占宽，且不能 collapse，是当前最明确的 responsive UX 问题。
- Mobile drawer 覆盖内容的方式基本合理，但 tree/menu 的 Desktop 信息密度直接搬入 drawer，仍有“桌面 UI 塞进手机”的痕迹。
- Mobile Page 的正文 gutter 尚可，但外层 Editor Card + 内层 Attachment Card 使 390px 有效内容宽度不足。
- Touch toolbar 在 Mobile 作为独立底栏存在有合理性，但当前控件尺寸/边框/文字组合过重，需要作为 Mobile 专属组件重新设计。

### Light / Dark consistency

- Light / Dark 的结构一致，Dark 已经避免明显纯黑大面，但两套主题都共享同样的 Surface/Border 过量问题。
- Dark 中 Sidebar 的多个 active/panel/editor 灰色矩形更加明显，使“层层容器”的问题被放大。
- P5.7 应优先修正 hierarchy / surface 结构，再调 palette；仅优化 Dark 色值无法解决当前观感。

### Accessibility / touch

- Mobile drawer close、tree actions 和 touch toolbar 都已有可见触控入口，基础可用性可保留。
- P5.7 设计阶段需确认 Desktop Sidebar collapse control 同时具备 icon、tooltip/aria-label、keyboard 可达性。
- Touch toolbar redesign 不能为了极简牺牲约 44px touch target。
- Page tree hover-only actions 在 Desktop 与触摸设备之间需要明确不同暴露策略。

### Motion / feedback

- 当前静态截图不能完整判断 motion；后续 Audit 需补 Sidebar collapse、popover/menu、sync state、attachment state 的动态证据。
- Workspace switcher 与 Page action menu 后续若改成 floating popover，应统一 enter/exit、focus management 和 reduced-motion。
- **正式 UI 不应直接显示 SDK / HTTP 工程错误文本。** 当前在后端未运行、用户点击“退出登录”时会直接显示 `Eotion API request failed: 502`，这对非技术用户不可理解，也暴露了实现层细节。
- 退出失败本身可以接受，但用户反馈应是产品语义，例如“暂时无法连接服务，请稍后重试”或“当前无法退出登录，请检查网络后重试”；HTTP status / endpoint / raw SDK message 只应进入日志、诊断面板或开发模式。

## Surface Findings

### ProductShell / Sidebar

**Keep**

- 左侧 Sidebar 作为 Workspace / Page 导航的总体信息架构。
- Mobile 使用 drawer 而不是永久占宽。
- Page tree、Workspace switch 的核心能力。
- Morphicons 图标体系。

**Problems**

- Desktop/Tablet Sidebar 无 collapse/reopen。
- Workspace selector 展开后当前 Workspace 被重复渲染，且 action panel 直接参与文档流。
- Workspace panel 和 Page menu 都使用较重的 bordered surface。
- 页面树节点的 active/highlight/controls 同时出现时视觉噪音偏高。
- 账号信息、Workspace 管理、Page tree、Settings/Logout 在窄 Sidebar 中缺少更清晰的层级节奏。
- **Sidebar footer 的“设置 / 退出登录”不是整行可点击。** 当前点击热区只包住文字/图标本身，hover 也没有形成整行背景反馈，与上方 Workspace / Page 列表项的交互语言不一致。
- Sidebar footer 应统一为完整 row interaction：整行 hit area、统一左右 padding、hover/active/focus-visible surface，与其它 Sidebar list item 使用同一套 density / state 规则；“退出登录”可以保持 danger/secondary 语义，但不应表现成孤立文本链接。
- 用户在 PC-Light 中以红框明确标记 Workspace dropdown、Workspace 展开 panel、Page row、Page action menu、child row 为重点不满意区域。

**Potential removals**

- 正文区域重复的 Workspace label（与 breadcrumb/sidebar 三重复，待 P5.7.2 决策）。
- Workspace switcher 展开态中重复显示当前 Workspace 的一整行（可考虑把 trigger 本身作为 current state）。
- Page action menu 的 inline 占位布局；能力保留，但 UI 应改成 anchored floating menu/popover。
- 非必要的 Page row 永久背景块/边框。

**Explicit visual preference**

- 用户希望展开的 Sidebar 作为独立 Surface 时，右上角与右下角使用圆角；左侧继续贴窗口边缘，不要求四角都圆。
- Desktop/Tablet 展开 Sidebar 与 Mobile drawer 都应在高保真阶段验证这一处理是否统一、自然；具体 radius 由 Design System v1 决定，不在 Audit 阶段提前定像素值。

**Priority**

**P0 / P5.7 核心重设计对象。**

### Page / Editor

**Keep**

- 大标题 + 正文的基本 document-first 方向。
- fixed toolbar 默认关闭。
- Slash / keyboard / contextual 能力继续作为隐藏复杂度的主要入口。

**Problems**

- Editor 巨大 border/radius container 让正文像表单输入框。
- Workspace label、breadcrumb、sync/local-save 状态重复。
- “已保存到本地”长期漂在标题右侧，距离正文和状态上下文都较远。
- 空白文档也维持巨大 Editor 框，内容量与容器视觉重量不匹配。
- Mobile 中嵌套 Card 严重压缩正文宽度。

**Potential removals**

- 默认 Editor 外边框与 Card surface。
- 正文上方重复 Workspace label。
- 正常稳定态长期显示的一个或多个 save/sync 文案；应研究按需/弱化反馈。

**Priority**

**P0 / 定义 Eotion 产品气质的首要 Surface。**

### Attachments

**Keep**

- 图片 inline 出现在正文中的基本行为。
- 文件附件保留文件名、类型/大小和更多操作的基本信息结构是合理的。
- 上传中支持取消、失败后支持重试，这些能力应保留。
- “正文仍可继续编辑，附件任务独立处理”的产品语义应继续保留。

**Problems**

- Mobile 图片被包进独立 bordered Card，再嵌在 bordered Editor 中，层级太重。
- 图片上下留白与 footer 占据较多空间，视觉更像上传组件而非文档内容。
- **上传中 placeholder 当前固定出现在 Editor 内容顶部**，与用户实际插入附件的位置脱节。它更像“全局上传任务面板”，并且上传成功/失败后会造成正文上方明显布局变化。
- 对 document-first 编辑器，更自然的方向是：上传 placeholder 尽量出现在最终附件将存在的文档位置，成功后原位 morph/替换成真实附件节点；如果确实存在全局任务，则使用独立、轻量、不挤压正文的 transient status。
- **上传失败存在重复反馈。** 当前同一个故障会同时出现：
  1. 页面顶部“1 个附件待清理，联网同步后自动重试 / 重试清理”；
  2. 上传任务条目中的“附件服务暂时不可用，请稍后重试 / 重试”；
  3. Editor 内额外红色“附件服务暂时不可用，请稍后重试”。
  三层信息表达同一事故，视觉和认知噪音都过高。
- “附件清理 / 重试清理 / cleanup pending”是对象补偿与垃圾清理的内部实现概念，不属于普通用户 mental model。只要数据安全仍有保障，应自动后台处理，不要求用户理解“清理队列”。
- 如果 cleanup 确实长期失败并产生用户需要行动的风险，也应翻译成结果导向的产品语言，例如“有 1 个未完成的附件任务，将在联网后自动处理”，而不是暴露 cleanup 技术术语。
- 成功后的文件 block 结构基本可用，但当前 full-width bordered card 与 Editor 外框叠加，整体仍偏“控件组件”，应在取消 Editor Card 后重新评估是否还需要完整边框。

**Potential removals**

- 默认附件 Card 外壳；图片可研究更接近 inline media，caption/actions 按需出现。
- 永久可见的 footer chrome（需在可发现性与简洁之间重新设计）。
- 独立于插入位置的 Editor 顶部上传任务区域（优先研究 inline placeholder）。
- 对普通用户可见的“附件清理 / cleanup”技术状态。
- 同一上传失败的重复错误条 / alert；一个任务应有一个主要错误 Surface，必要时辅以全局汇总，但不能三处重复。

**Priority**

**P0 / High。** 附件是正文体验的一部分，上传中/失败应在 P5.7 与 Editor 一起重设计，而不是单独做成文件管理控件。

### Settings

**Keep**

- Settings 作为独立 Surface 的整体信息架构基本成立。
- Desktop 左侧设置导航 + 右侧 Detail 的 list-detail 结构可以保留。
- 导航分组（个人 / 外观 / 工作空间 / 功能）清晰。
- Appearance 三态选择的基本信息结构合理。
- Compact Index → Detail 的既有产品方向继续保留。

**Problems**

- **Desktop Detail 当前固定内容宽度过窄。** 在约 1280px 宽度时尚可，但屏幕继续增宽后内容仍维持同样窄度，右侧留白明显失衡，页面显得像“窄表单漂在大画布中间”。
- Settings Detail 的宽度策略应从固定 max-width 改为 responsive content width：随可用宽度适度增长，同时保留上限，避免超宽屏文本行无限拉长。
- 当前 Appearance 内容本身并不拥挤，因此问题不是“需要铺满整个屏幕”，而是缺少随 viewport 扩展的中间增长区间。
- Settings 顶部 title / 返回区当前可用，但后续高保真设计仍需统一其与 ProductShell topbar 的视觉语言。

**Potential removals**

- 暂无明确需要删除的核心 Settings 内容。
- 后续可重新评估 section description 的密度，但当前不是主要问题。

**Priority**

High（布局比例问题），但不需要推翻 Settings IA。

### Login / Register / Connectivity

**Keep**

- 用户确认当前 Login / Register 页面没有明显 UI/UX 问题，P5.7 暂不将其作为重点重设计对象。
- 已有 Connectivity 产品化页面的总体方向可继续保留：普通用户看到简洁说明和重试入口，技术诊断信息应折叠隐藏。

**Problems**

- **后端未运行时，从 ProductShell 点击“退出登录”会直接显示 `Eotion API request failed: 502`。**
- 这是 SDK / HTTP transport 层诊断文本泄露到 Product UI，不符合面向普通用户的产品文案。
- 用户可以接受“后端不可用时暂时无法退出”，但不能接受 raw 502 / raw API error 直接展示。
- 错误转换不应只修 logout 一处；P5.7 应建立统一的 user-facing error translation 规则，避免未来 Profile、Workspace、Attachment、Sync 等 Surface 再次把底层异常直接透传给用户。

**Desired error presentation**

- Network / fetch failure → “无法连接服务，请检查网络或稍后重试。”
- 500 / 502 / 503 / 504 → “服务暂时不可用，请稍后重试。”
- 401 → “登录状态已失效，请重新登录。”
- 403 → “你没有权限执行此操作。”
- 404 → 根据业务上下文显示“内容不存在或已被移除”等产品语义。
- 409 / validation / business 4xx → 使用具体、可行动的业务提示。
- 429 → “操作过于频繁，请稍后再试。”
- 未知错误 → “操作失败，请稍后重试。”
- 原始 HTTP status、URL、endpoint、SDK fallback message 只进入开发日志或可展开诊断，不直接进入普通用户正文。

以上是产品语义方向，最终文案应按具体操作场景做 context-aware 映射，而不是机械按 status code 生成一句通用句子。

**Potential removals**

- 普通用户界面中的 raw `Eotion API request failed: <status>`、endpoint、transport message。
- 正常产品错误态中不必要的工程术语。

**Priority**

High。属于正式产品错误反馈基础规范，不是单个页面视觉问题。

## Repeated Anti-patterns

> TODO：记录跨页面重复出现的问题，例如过度 Card、重复状态、永久 Toolbar、间距漂移等。

| Pattern | Evidence | Impact | Proposed direction |
| --- | --- | --- | --- |
| TODO | TODO | TODO | TODO |

## UI That May Be Removed

> TODO：优先记录“可以删掉”而不是“需要美化”的 UI。

| UI element | Current purpose | Can remove/hide? | Alternative interaction |
| --- | --- | --- | --- |
| TODO | TODO | TODO | TODO |

## Strengths Worth Preserving

- Page title + body 是正确的核心信息架构，应围绕它减法而不是推翻。
- Sidebar / Page Tree / Workspace 的功能分区本身合理。
- Mobile drawer 比“手机永久 Sidebar”正确。
- fixed editor toolbar 默认 OFF 的产品决策正确。
- Slash Command、keyboard、contextual/touch controls 是实现 Progressive Disclosure 的现成基础。
- Light/Dark 已共享 token 体系，P5.7 应重设 token/层级而不是回退到两套样式。
- Morphicons + EotionIcon 继续作为统一 icon/motion 基础。

## Priority Matrix

| Finding | Severity | Frequency | User impact | P5.7 action |
| --- | --- | --- | --- | --- |
| Editor 作为巨大 bordered Card | Critical | Every Page | 直接决定产品气质 | Redesign |
| Desktop/Tablet Sidebar 不可折叠 | High | Every non-mobile session | 侵占内容/缺少 focus mode | Redesign + implement |
| Sidebar footer 不是整行交互 | High | Every session | hit area 小、hover 语言不一致 | 统一 row anatomy / states |
| Context/status 重复 | High | Every Page | 持续视觉噪音 | Remove/merge |
| Page action inline menu 推动 tree | High | Frequent page management | 导航跳动、视觉过重 | Floating interaction |
| Workspace expanded panel 过重/重复 | High | Workspace switching | Sidebar hierarchy 混乱 | Redesign |
| Nested attachment Card | High on mobile | Media documents | 有效宽度与文档感下降 | Redesign |
| Upload placeholder 脱离插入位置 | High | Attachment upload | 像全局任务面板、造成正文布局跳动 | 优先 inline placeholder / in-place transition |
| Attachment failure 重复三层反馈 | High | Upload failure | 同一事故重复占据注意力 | 单一 primary error + 必要汇总 |
| Cleanup 技术术语暴露 | High | Failed upload / compensation | 用户被迫理解内部对象生命周期 | 后台自动处理 + 产品语义翻译 |
| Slash Menu 双语重复 | Medium | Every slash command use | 信息密度高且不利于 i18n | 单语言翻译资源 |
| Touch toolbar 视觉过重 | Medium/High | Touch editing | 挤压正文、像控制面板 | Mobile-specific redesign |
| Settings Detail 固定宽度偏窄 | High on wide desktop | Settings | 超宽屏比例失衡，主视图显得漂浮且局促 | responsive content width + cap |
| Raw HTTP / SDK error 泄露到 UI | High | Error paths | 非技术用户无法理解，暴露工程细节，产品感被破坏 | 统一 user-facing error translation + diagnostics separation |
| Dark palette 本身 | Medium | Dark mode | 当前可用，结构问题更大 | Tune after hierarchy |

## Audit Conclusion

第一批证据已经确认：当前最主要的问题不是单个颜色、圆角或字体，而是 **产品层级仍以“容器 + 控件 + 状态”驱动，而不是以文档内容驱动**。

Page/ProductShell 的 P5.7.2 Design Brief 必须重点回答：

1. Eotion Page 是否可以默认接近“标题 + 正文”，Editor container 视觉上消失。
2. 正常稳定态究竟需要保留哪些 save/sync feedback。
3. Workspace context 只在哪一个位置承担主要定位。
4. Page tree action、Workspace switching 如何改成不推动布局的 contextual/floating interaction。
5. Desktop/Tablet Sidebar 如何 collapse/reopen，并在中等宽度形成真正的 focus mode。
6. Mobile Page 如何减少 nested card / persistent chrome，并重新定义 touch editing bar。
7. Attachment 如何从“上传控件 Card”转成“文档内容”。

Settings 第一批已补充：整体 IA 可保留，但 Desktop Detail 需要从固定窄宽改成“随可用宽度增长、设上限”的响应式内容宽度；Sidebar footer 的设置/退出登录需要统一为整行 list-item interaction。

Login / Register 由用户确认当前无明显问题，暂不作为 P5.7 重设计重点。Connectivity / error feedback 已确认一个系统性问题：底层 SDK/HTTP 错误不能直接透传到正式 UI，必须建立 context-aware 的用户友好错误翻译层，并把技术细节留给日志/诊断。

Slash / Attachment 关键状态也已完成第一轮审计：Slash Menu 结构基本可保留但必须移除中英双语重复；Attachment 的主要问题集中在“上传 placeholder 脱离正文插入位置、失败反馈重复、cleanup 技术术语暴露、Card 嵌套过重”。

至此 P5.7.1 的核心 Surface 已具备足够证据，可以进入收口；若后续发现新的明显问题，可继续补充 Audit，但不必为了穷举所有状态阻塞 P5.7.2 Design Brief。

## Approval

- Reviewer: User + ChatGPT
- Date: 2026-10-01
- Status: READY FOR CLOSEOUT — core Product/Page/Settings/Error/Slash/Attachment evidence complete
