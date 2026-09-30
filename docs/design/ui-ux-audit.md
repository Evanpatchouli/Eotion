# P5.7.1 UI/UX Audit

## 状态

**✅ COMPLETE / PASS（2026-10-01）**

本阶段只审计现有正式产品 UI/UX，不修改正式 Product UI。当前核心 Surface 已具备足够证据支撑 P5.7.2；后续如果发现新的明显问题可以追加，但不再为了穷举所有状态阻塞设计阶段。

## 审计目标

识别 Eotion 当前 Product MVP 在视觉层级、交互结构、响应式、状态反馈和产品语言上的系统性问题，并明确：

- 什么值得保留；
- 什么需要重设计；
- 什么应该删除而不是美化；
- 什么属于工程实现细节，不应暴露给普通用户；
- 哪些问题必须进入 Stitch Design Brief。

## Evidence / Screenshot Baseline

证据由用户在 2026-10-01 提供，包含 Desktop Light/Dark、中等宽度、390px Mobile、Sidebar drawer、Settings、Slash Menu、图片/文件附件、上传中与上传失败等真实状态。

| Surface | Desktop | Medium / Tablet-like | Mobile | Audit status |
| --- | --- | --- | --- | --- |
| ProductShell | Light / Dark 已提供 | 已提供 | 已提供 | Complete |
| Sidebar / Workspace switcher | 已提供 | 已提供 | drawer 已提供 | Complete |
| Page Tree | 已提供 | 已提供 | drawer 已提供 | Complete |
| Page / Editor | Light / Dark 已提供 | 已提供 | 已提供 | Complete |
| Slash Menu | 已提供 | 结构相同 | 结构相同 | Complete |
| Image attachment | 已提供 | 部分 | 已提供 | Complete |
| File attachment | 已提供 | 部分 | 结构可判断 | Complete |
| Attachment uploading | 已提供 | — | — | Complete |
| Attachment failure | 已提供 | — | — | Complete |
| Settings | Desktop 已提供 | 可由 Desktop 判断 | Compact 结构此前已验收 | Complete |
| Login / Register | 用户确认无明显问题 | — | — | Not a redesign priority |
| Connectivity / error feedback | 已提供关键错误态 | — | — | Complete for current scope |

用户在 PC-Light 截图中用红框标出的 Workspace dropdown、Workspace 展开 panel、Page row、Page action menu、child row，均视为明确不满意、必须进入后续设计探索的重点区域。

---

## Executive Conclusion

当前 Eotion 的核心问题不是某个颜色、圆角或字体不够精致，而是：

> **产品层级仍然偏“容器 + 控件 + 状态驱动”，而不是“内容 / 文档驱动”。**

最典型表现：

- Editor 被做成巨大 bordered Card；
- Workspace / Page 管理大量依赖矩形 panel 和 inline menu；
- 正常稳定态仍长期显示多组状态文字；
- Attachment 又在 Editor Card 内继续套 Card；
- Mobile 很多时候是 Desktop density 的压缩版；
- 工程错误和 cleanup 等内部概念有机会直接进入产品 UI。

P5.7 后续的核心不是“把这些框画漂亮”，而是重新决定哪些框、状态和控件根本不应该长期存在。

---

## Global Findings

### 1. Information hierarchy

- Page 同时长期显示 topbar breadcrumb、正文上方 Workspace 名、Page Title、topbar “已同步”、正文区“已保存到本地”。
- Workspace 名在 Sidebar、Workspace selector、展开 panel、正文上方重复出现，信息增量很低。
- “已同步”和“已保存到本地”技术语义不同，但正常状态下同时长期存在，会被用户理解成两个并列状态。
- Page Title 应成为正文区域第一视觉焦点，当前被 Workspace label、状态文字和 Editor Card 分散。

**方向：** 减少重复上下文；稳定态反馈弱化或隐藏；异常/变化时再显著出现。

### 2. Typography

- Page Title 的视觉权重基本成立，值得保留。
- UI text / body / caption 已有层级雏形，但缺少正式 typography scale。
- 多个 11～13px 状态/辅助文字同时出现，容易形成“工程状态面板”感。
- Editor 内标题 + Page Title + bordered editor 组合后产生“两层组件标题”感。

**方向：** P5.7.3 用统一 Typography System 重建层级，不局部修字号。

### 3. Spacing / rhythm

- 超宽 Desktop 主内容横向居中基本合理，但纵向首屏留白偏多。
- Sidebar 中 Workspace、Page heading、Tree、Footer 各自使用不同 padding / gap / radius 节奏。
- Inline Page action menu 展开后推开子页面，破坏 Page Tree 节奏。
- Mobile 的 Editor outer card + Attachment inner card 连续吃掉正文有效宽度。

**方向：** 建立正式 spacing scale；减少嵌套容器；浮层不参与树布局。

### 4. Surface / Card / Border

**Critical：Editor 作为巨大 bordered Card。**

这会让 Eotion 更像“表单里的富文本输入框”，而不是 document canvas。

其它问题：

- Attachment Card 嵌套 Editor Card；
- Workspace expand panel、Page action menu、active row 同时大量使用矩形 surface；
- Dark Theme 下这些灰色矩形更明显，层层容器感更强。

**方向：** 默认无 Card / 无 Border；只有真正需要边界、浮层或控件语义时才使用 Surface。

### 5. Navigation / Sidebar

- **明确 UX 缺陷：Desktop / Tablet Sidebar 目前无法 collapse / reopen。**
- 在约 1024px 中等宽度尤其侵占文档空间，也缺少专注写作模式。
- Mobile drawer 模式总体正确，但 drawer 内仍直接复用了较重的 Desktop tree/menu density。
- Workspace switcher 展开后再次显示当前 Workspace，并直接显示管理动作，结构偏重。
- Page action menu 作为 inline block 展开，推动树内容。
- Sidebar footer 的“设置 / 退出登录”不是整行 hit area，hover 也没有整行 surface，与上方列表项交互语言不一致。

**明确视觉偏好：**

- 展开的 Sidebar 右上角、右下角使用圆角；
- 左侧贴窗口边缘，不要求四角圆角；
- Desktop/Tablet expanded Sidebar 与 Mobile drawer 都要在高保真阶段验证这一处理。

**方向：**

- Desktop/Tablet 设计 collapse / reopen / focus mode；
- Workspace switching / Page actions 优先 anchored popover / context menu；
- Sidebar footer 使用统一整行 row anatomy；
- Sidebar 状态是否持久化在 Design System / UX spec 阶段确定。

### 6. Editor chrome

- Fixed toolbar 默认 OFF 的产品决定正确。
- Editor 自身大边框仍然是过强 Chrome。
- 中等宽度/touch toolbar 视觉重量高，更像控制面板。
- Mobile touch toolbar 应作为 Mobile-specific control 设计，而不是 Desktop toolbar 缩小版。

**Slash Menu：**

- 浮层大小、选中态、基本结构可保留。
- 当前每项“英文标题 + 中文说明”是在重复表达同一含义。
- 中文界面只显示中文；未来 i18n 使用翻译资源切换语言。
- 若保留第二行，第二行必须补充语义，例如“图片 / 从设备上传”，不能只是翻译重复。

### 7. Interaction density

- Page row 同时包含展开箭头、文档图标、标题、active surface、ellipsis，再加 inline action menu 后过重。
- Workspace switcher 同时承担 current state、switching 和 management，展开态视觉过重。
- Settings / Logout 固定在 Sidebar 底部可以保留，但交互 row 必须和 Sidebar 统一。

### 8. Responsive / compact

- 1024px 下固定 Sidebar 是当前最明确的 responsive 问题。
- Mobile drawer 基础正确，但 tree/menu 信息密度仍有“桌面 UI 塞进手机”的痕迹。
- Mobile document gutter 本身可接受，但 nested card 进一步压缩内容宽度。
- Touch toolbar 要保留约 44px 触控目标，但需要降低视觉重量。

### 9. Light / Dark

- 当前 Light/Dark 结构一致，Dark 没有明显纯黑大面，基础可保留。
- 真正问题是两套 Theme 都共享 Surface/Border 过量。
- Dark 下“层层灰色容器”更加明显。

**方向：** 先修 hierarchy / surface，再调 palette，不把 P5.7 变成单纯换色。

### 10. Settings

**可保留：**

- 独立 Settings Surface；
- Desktop list-detail；
- Compact Index → Detail；
- 个人 / 外观 / 工作空间 / 功能分组；
- Appearance 三态信息结构。

**问题：**

- Desktop detail 当前固定窄宽，在约 1280px 尚可，但 1440/1600/更宽屏幕上显得“窄表单漂在大画布中间”。
- Detail 应随可用宽度适度增长，同时设置上限，不能无限拉长文本行。

**方向：** responsive content width + max cap；不推翻 Settings IA。

### 11. User-facing error language

当前后端未运行时，点击退出登录会直接显示：

```text
Eotion API request failed: 502
```

这是 SDK / HTTP transport 诊断文本，不应进入普通用户产品 UI。

**原则：**

- network failure → “无法连接服务，请检查网络或稍后重试。”
- 500 / 502 / 503 / 504 → “服务暂时不可用，请稍后重试。”
- 401 → “登录状态已失效，请重新登录。”
- 403 → “你没有权限执行此操作。”
- 404 → 按业务上下文描述“内容不存在或已被移除”。
- 429 → “操作过于频繁，请稍后再试。”
- unknown → “操作失败，请稍后重试。”

底层 error classification 可以统一，但最终文案必须 context-aware。

原始 status / URL / endpoint / SDK fallback message 只进入日志、开发模式或可展开诊断。

### 12. Attachments

**Keep：**

- 图片作为正文内容；
- 文件名、类型/大小、更多操作；
- 上传中取消；
- 失败重试；
- 附件失败不阻塞正文继续编辑。

**问题：**

1. Image Card 嵌套 Editor Card，Mobile 尤其重。
2. 上传中 placeholder 固定出现在 Editor 顶部，与用户真实插入位置脱节。
3. 上传成功/失败会让正文顶部发生明显 layout jump。
4. 同一次失败可能同时显示页面顶部 cleanup、上传条目失败、Editor 红色错误，形成重复反馈。
5. “附件清理 / 重试清理 / cleanup pending”属于内部对象补偿生命周期，不应要求普通用户理解。

**方向：**

- 优先研究 inline upload placeholder；
- 一个附件失败只保留一个 primary error surface；
- cleanup 默认后台自动处理；
- 真正需要用户行动时转换成结果导向产品语言；
- 在移除 Editor outer Card 后再决定 File block 是否仍需要完整 border。

---

## Repeated Anti-patterns

| Pattern | Evidence | Impact | Proposed direction |
| --- | --- | --- | --- |
| Excessive persistent chrome | Editor border、Workspace panel、active rows、inline menus、Attachment card | 像工程表单/后台 | Content-first / low chrome |
| Duplicate context/status | Workspace 多处重复；已同步 + 已保存到本地 | 稳定态持续抢注意力 | 合并、弱化、按需显示 |
| Inline menu changes layout | Workspace/Page action panel 推动后续内容 | 导航跳动 | Anchored floating UI |
| Fixed non-mobile Sidebar | 1024px/desktop 都不能 collapse | 侵占正文/无 focus mode | Collapse + reopen |
| Desktop density copied to touch | Mobile drawer/tree/touch toolbar | 手机空间利用差 | Mobile-specific presentation |
| Technical language leaks | raw 502、cleanup | 普通用户无法理解 | Product error translation |
| Nested cards | Editor → Attachment | 文档感下降 | Flatten surface hierarchy |

## UI That May Be Removed / Hidden

| UI element | Current purpose | Direction |
| --- | --- | --- |
| Editor outer Card | 表达编辑区域 | 高概率移除；Canvas 本身即 Editor |
| 正文 Workspace label | 定位 Workspace | 高概率移除/降级 |
| Stable local-save text | 表示本地持久化 | 稳定态弱化/隐藏 |
| Inline Page action panel | Page CRUD | UI 移除，能力迁到 popover/context |
| Workspace expanded duplicate current row | 当前 Workspace | 合并到 trigger |
| Image attachment full Card chrome | 媒体与操作 | 研究 inline media/context actions |
| Editor-top upload task area | 上传进度 | 优先 inline placeholder |
| Cleanup user-facing status | 内部补偿 | 默认完全隐藏 |
| Slash bilingual labels | 语言说明 | 单语言 i18n |

## Strengths Worth Preserving

- Page Title + Body 的核心 document structure。
- Sidebar / Workspace / Page Tree 的总体信息架构。
- Mobile Drawer。
- Fixed editor Toolbar 默认 OFF。
- Slash / keyboard / contextual / touch controls。
- Settings list-detail / compact Index → Detail IA。
- Light/Dark 共享 token 系统。
- Morphicons + EotionIcon 图标/动效体系。
- Login / Register 用户当前满意，不为“全站重构”强行重画。

## Priority Matrix

| Finding | Severity | Frequency | P5.7 action |
| --- | --- | --- | --- |
| Editor giant bordered Card | Critical | Every Page | Redesign |
| Desktop/Tablet Sidebar cannot collapse | High | Every non-mobile session | Redesign + implement |
| Sidebar footer inconsistent row | High | Every session | Unified row anatomy |
| Context/status duplication | High | Every Page | Remove / merge |
| Page inline action menu | High | Frequent management | Floating interaction |
| Workspace expanded panel too heavy | High | Workspace switching | Redesign |
| Nested attachment card | High on mobile | Media docs | Redesign |
| Upload placeholder detached from insertion point | High | Attachment upload | Inline placeholder |
| Attachment failure repeated feedback | High | Upload failure | Single primary error |
| Cleanup terminology exposed | High | Failure path | Hide / translate |
| Settings fixed narrow width | High on wide desktop | Settings | Responsive width + cap |
| Raw HTTP / SDK error | High | Error paths | Error translation layer |
| Touch toolbar too heavy | Medium/High | Touch editing | Mobile-specific redesign |
| Slash bilingual duplication | Medium | Slash use | Single-language i18n |
| Dark palette tuning | Medium | Dark mode | Tune after hierarchy |

## P5.7.2 Questions That Must Be Answered

1. Page 默认是否可以接近纯“标题 + 正文”，让 Editor container 视觉上消失？
2. 正常稳定态究竟保留哪些 save/sync feedback？
3. Workspace context 只在哪一个位置承担主要定位？
4. Workspace switch / Page action 如何改成不推动布局的 contextual/floating interaction？
5. Desktop/Tablet Sidebar 如何 collapse/reopen？是否记忆状态？中等宽度如何进入 focus mode？
6. Sidebar 展开态右侧圆角如何与整体 Shell 协调？
7. Mobile Page 如何减少 nested card / persistent chrome？
8. Touch editing bar 怎样保留可发现性和 44px touch target，又不成为视觉主角？
9. Attachment 如何从“上传控件”转成“文档内容”，并做到 inline upload/error transition？
10. Settings detail 的 responsive width curve / max cap 应该是什么？
11. 用户错误反馈如何既友好又保留可诊断性？
12. Eotion 的 typography / spacing / surface hierarchy 应该如何统一？

## Approval

- Reviewer: User + ChatGPT
- Date: 2026-10-01
- Status: **PASS — P5.7.1 complete; proceed to P5.7.2 Stitch Design Brief & Direction Exploration**
