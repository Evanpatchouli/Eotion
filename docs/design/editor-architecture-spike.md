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

- P5.8.1 开发验证入口：`/#/__dev/editor-foundation`；浏览器回归：`apps/web/tests/editor-foundation.spec.ts`，覆盖初始内容、JSON 更新、输入/输出隔离、动态只读、focus、卸载/重挂，以及 link/underline 粘贴边界。
- 正式编辑器、附件和持久化回归入口：`apps/web/tests/product-editor.spec.ts`、`product-attachments.spec.ts`、`product-sync.spec.ts`。其中正式编辑器测试覆盖相同的 link/underline 粘贴边界以及保存和重载。
- 生产路由隔离回归：`pnpm --filter @eotion/web exec playwright test --config playwright.editor-production.config.ts`。
