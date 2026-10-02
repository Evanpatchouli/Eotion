# P5.8.2 共享编辑器基础

P5.8.1 建立了独立的 `DocumentEditor` 文档画布原语。P5.8.2 将它与正式 `EotionEditor` 的 Tiptap 创建和生命周期收敛到同一个 `useDocumentEditor` composable，两个 Vue 组件继续并存。

## 决策

- 新增轻量共享 `useDocumentEditor` core，统一 Tiptap `useEditor` 生命周期，以及输入/输出的 `cloneEditorDocument`、`StarterKit.configure({ link: false, underline: false })`、动态 `editable`、`aria` 属性和 `focus()` 行为。
- `DocumentEditor` 是纯文档原语：提供 JSON 文档、可编辑状态、无障碍标签和 focus 能力，不承载产品功能。
- `EotionEditor` 通过共享 core 创建编辑器，并继续提供产品 extensions 与 hooks。保留 BlockIdentity、图片/文件/todo 节点、slash command、附件上传与清理、IME、selection、transaction、输入/指针事件和移动端键盘工具栏等现有产品能力。
- `blockCodec.ts` 是正式页面唯一的 Block ↔ Editor JSON 映射边界。`PagePersistence` 经该映射读写区块；不再规划另一个 Editor Adapter。
- Tiptap JSON 是编辑器表示和序列化边界，不是 Eotion 永久 Domain Model。业务持久化仍以 Block 为准，Editor 实例、Transaction、EditorState 和 ProseMirror Node 不进入 store 或持久层。

## 消费边界

- P2 开发基准页实际消费 `EotionEditor` 暴露的 `editor`，用于加载和测量 5,000 块 fixture。因此保留 `EotionEditor` 的 `defineExpose({ editor })`；PageView、store 和 persistence 不消费该实例。
- `PageView` 将编辑器发出的 JSON 更新交给 `PagePersistence`；加载和保存的 Block 转换由 `blockCodec.ts` 完成。PageView、store 与 persistence 不消费暴露的 Tiptap Editor 实例。
- `DocumentEditor` 对外以 JSON、props/events 和 `focus()` 交互，不暴露 Tiptap 实例。

```text
DocumentEditor ─┐
                ├─ useDocumentEditor ─ Tiptap / ProseMirror
EotionEditor ───┘

PageView → EotionEditor update → EditorDocument → PagePersistence
         → blockCodec → Block → LocalStore / Sync
```

## 表示与生命周期限制

- 输入 `content` 是挂载时读取的初始文档；后续内容变化不覆盖正在编辑的文档。切换文档身份时由调用方用 Vue `key` 重建。
- JSON 在进入 Editor 和从 Editor 输出时深拷贝，避免调用方与编辑器共享嵌套对象。该边界不提供任意外部数据的验证、迁移或兼容转换。
- 文档必须符合当前 Tiptap schema。正式页面可保存的节点、marks、attrs 和 Block 转换规则由 `blockCodec.ts` 限定；Tiptap JSON 本身不扩大产品持久化契约。
- 继续使用 Tiptap 3 的 `useEditor`、`EditorContent`、扩展和 commands。ProseMirror 仅是 Tiptap 底层；只有已验证某项能力无法由 Tiptap 抽象表达时，才考虑通过 `@tiptap/pm/*` 使用底层 API。

## 验证入口

- P5.8.1 开发验证入口：`/#/__dev/editor-foundation`；浏览器回归：`apps/web/tests/editor-foundation.spec.ts`，覆盖初始内容、JSON 更新、输入/输出隔离、动态只读、focus、卸载/重挂，以及 shared editor 的 link/underline 粘贴边界。
- 正式编辑器、附件和持久化回归入口：`apps/web/tests/product-editor.spec.ts`、`product-attachments.spec.ts`、`product-sync.spec.ts`。正式编辑器的 Link 产品行为与 shared editor 的纯文档边界分别验证。
- 生产路由隔离回归：`pnpm --filter @eotion/web exec playwright test --config playwright.editor-production.config.ts`。

## P5.8.3 正式文档画布视觉收敛

- 正式 Page 的 `.product-editor-page` 控制唯一阅读列：Desktop 最大 740px，Mobile 使用 16px 两侧 gutter。Page 标题、保存状态和正文保持在同一列，编辑器自身不再限制正文宽度或提供卡片外框、背景、圆角、阴影与独立正文内边距。
- `DocumentEditor` 与 `EotionEditor` 通过 `styles/editor-content.css` 共用正文排版规则，包括正文颜色与字体、标题、列表缩进、引用和代码块。组件继续分别保留所需的最小编辑高度。
- 固定工具栏仍由 `fixedToolbar` 和现有用户偏好决定，只呈现紧凑的无边框文档控件；Mobile 的 `touchToolbar` 和键盘避让逻辑保持原样。附件上传、重试、清理及节点行为保持原样，仅上传状态外观对齐文档列。
- 视觉契约回归位于 `product-editor.spec.ts`，覆盖 Desktop / Tablet 展开与收栏时最大 740px 的阅读列、无编辑器卡片、工具栏开关、Light / Dark、390px Mobile 无横向溢出和 `DocumentEditor` 正文字体一致性。设置 `EOTION_VISUAL_QA_DIR` 可输出 Desktop Light / Dark 与 Mobile 截图。

## P5.8.4 Touch 编辑密度

- Mobile / coarse pointer 的底部工具栏保留粗体、斜体、文本、二级标题、项目列表、图片、文件原有命令和顺序。控件使用 Morphicons；前两项及附件为纯图标，块类型使用图标和短标签。格式状态以 `aria-pressed` 和 Quiet Studio selected surface 表达。
- 工具栏保留横向滚动、44px 触摸目标、`visualViewport` 键盘避让和 safe-area 内边距；编辑器末尾按工具栏高度与键盘 inset 预留滚动空间。键盘出现且编辑器有焦点时，当前光标及后续输入位置滚动到工具栏上方。Mobile Page 标题和本地保存状态纵向排列，Desktop / Tablet 排列不变。
- `product-editor.spec.ts` 覆盖 390px 长标题、短视口、safe-area、模拟键盘 inset、格式状态及 Mobile Light / Dark 截图。

## P5.8.5 已支持块与格式入口

- Slash 菜单按「基础 / 块 / 媒体」展示 11 项中文命令：文本、一级标题、二级标题、项目列表、编号列表、待办、引用、代码块、分割线、图片、文件。保留搜索、上下键 / Enter / Esc 和 IME 输入保护；图片、文件继续使用原附件流程。
- Slash 与可选 Desktop fixed toolbar 共用块命令。Fixed toolbar 只显示文本、H1、H2、列表、编号列表、图片、文件，仍默认关闭。Mobile Touch Toolbar 保持 P5.8.4 的七项及顺序。
- Bold / Italic 仍可通过 Touch Toolbar 使用；Strike 使用 `Ctrl/⌘+Shift+S`，Inline Code 使用 `Ctrl/⌘+E`。这两个低频 mark 留待后续上下文格式入口，不加入主 Touch Toolbar。
- `blockCodec` 的 Block 类型映射不变。编号列表仅兼容 Tiptap 3 生成的 `type: null` 默认 marker，并在保存时去掉该无语义属性；其他 marker 值仍拒绝。回归覆盖新建块与 Strike / Inline Code 的保存、重载，以及菜单交互和响应式视觉。


## P5.8.6 选区格式菜单

- 正式 `EotionEditor` 在可格式化的非空文本选区附近使用 Tiptap Vue `BubbleMenu` 展示粗体、斜体、删除线和行内代码；不扩展 Mark / Block schema，也不改变固定或触摸工具栏命令。
- 菜单由编辑器焦点、文本选区、可格式化文本、IME 和 Slash 状态控制。Escape、选区折叠和失焦会关闭菜单；菜单按钮保留选区并调用既有 Tiptap mark 命令。
- 位置由 Tiptap 的 Floating UI 在选区上方计算，并允许翻转、平移以避开视口边缘。菜单浮于正文，不影响阅读列布局；触摸端保留原七项底部工具栏。
- 回归入口为 `apps/web/tests/product-editor.spec.ts` 的选区菜单交互、持久化/重载、边缘定位、Light / Dark 和 390px 触摸视口用例；附件和共享编辑器的原有回归仍适用。

## P5.8.6.1 输入方式决定选区菜单

- Eotion Bubble Menu 仅用于 mouse / fine-pointer 文本选区：`EotionEditor` 用 `!touchToolbar` 控制它是否启用。P5.8.6.1 时 Desktop 和 Tablet 的 mouse 输入显示四项菜单；Mobile 布局及 Tablet 的 touch / coarse-pointer 输入保留原七项 Touch Toolbar。
- Touch / coarse-pointer 环境保留系统原生 Selection Menu，Eotion 不在选区附近叠加第二套 Bubble Menu。iOS Safari 与 HarmonyOS 6 浏览器真机均验证：系统菜单占据文本选区附近的浮层区域，网页 Bubble Menu 无法可靠避免遮挡。这是跨端交互决策。
- `product-editor.spec.ts` 覆盖 Desktop / Tablet mouse、Tablet coarse/hybrid 与 Mobile coarse/touch，并检查 390px 页面无横向溢出。

## P5.8.7 Inline Link

- Link 是正式产品 Mark：`EotionEditor` 显式启用 Tiptap 3 Link，配置 `openOnClick: false`、`autolink: false`、`linkOnPaste: false`，并用产品 URL 校验限制为完整的 `http://` 或 `https://` 地址。普通点击正文链接不会跳出编辑页面。共享 `useDocumentEditor` 的 StarterKit baseline 仍关闭 Link 和 Underline；`DocumentEditor` 不承载产品 Link UI。
- `blockCodec.ts` 继续作为唯一持久化边界。Tiptap 3 默认生成 `href/target/rel/class/title` 五个 Link attrs；产品扩展把编辑器 Link schema 收窄为 `href`，避免粘贴来源的展示属性阻止正常保存。codec 校验安全 URL，并把 Link 规范化为 `{ "type": "link", "attrs": { "href": "https://example.com" } }`。读取 Block 时仅接受这个单字段语义结构；未知 Link attrs、危险 URL 和其他 Mark 的 attrs 均拒绝。
- Desktop / Tablet 的 mouse/fine-pointer 选区 Bubble Menu 提供第五项 Link，菜单内部切换为紧凑 URL 输入，可创建、预填修改及移除 Mark。输入框自动聚焦；Enter 应用、Escape 返回格式菜单；操作保留文字和选区。正文链接使用克制下划线。Touch / coarse-pointer 环境保留系统 Selection Menu 与七项 Touch Toolbar；已保存 Link 可加载、显示并继续编辑文字，显式创建入口留待后续阶段。
- 回归位于 `apps/web/tests/product-editor.spec.ts`：创建、修改、移除、组合 Mark 的保存与重载，危险 URL/attrs 的拒绝、菜单交互、Touch 边界、390px 溢出与 Light / Dark 截图。共享编辑器和生产路由隔离分别由既有测试保持。
