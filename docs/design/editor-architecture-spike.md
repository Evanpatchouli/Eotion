# P5.8.1 文档画布原语

开发验证入口：`/#/__dev/editor-foundation`；浏览器回归：`apps/web/tests/editor-foundation.spec.ts`。

生产路由隔离回归：`pnpm --filter @eotion/web exec playwright test --config playwright.editor-production.config.ts`。

`DocumentEditor` 与既有 `EotionEditor` 并存：前者是无产品副作用的 Tiptap JSON 文档原语，用来验证画布 API 与生命周期；后者继续承担正式页面的 block identity、附件、slash command 和保存协作。此 spike 不替换产品编辑器，也不把其职责迁入原语。未来若收敛，须由后续阶段定义正式页面与 Block 映射、持久化及扩展边界后再决定。

Tiptap 3 是编辑器集成层，ProseMirror 是它底层的编辑引擎。此原语只用 Tiptap 的 `useEditor`、`EditorContent`、扩展配置和 commands；直接操作 ProseMirror 会绕过产品统一的扩展与生命周期边界，当前没有需要绕过 Tiptap 的已验证理由。只有未来某项能力经验证无法由 Tiptap 抽象表达时，才考虑通过 `@tiptap/pm/*` 使用相应底层 API。

`content` 是挂载时读取的初始文档，后续 prop 变化不会覆盖用户编辑；切换文档身份须用 Vue `key` 重建。传入与 `update` 输出都在边界做 JSON 深拷贝，因此调用方与编辑器不共享嵌套对象。输入必须是可由当前 StarterKit schema 解析的 Tiptap `JSONContent` `doc` 节点；不支持的节点、mark 或 attrs 必须在进入原语前转换为有效 schema JSON。`editable` 可动态切换且不发内容更新；唯一公开方法是 `focus(): void`，Tiptap 实例留在组件内部。

```vue
<DocumentEditor :content="initialDocument" :editable="editable" @update="serializedDocument = $event" />
```

```ts
const initialDocument: EditorDocument = {
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello' }] }],
}
```

`DocumentEditor` 拥有 Tiptap Editor 实例：`useEditor` 在 setup 时准备引用，挂载时建立 Editor、卸载时 destroy。组件外部只能通过 JSON 与 `focus()` 交互；Editor、Transaction、EditorState 和 ProseMirror Node 不进入业务 store。当前链路止于序列化 JSON 交给调用方：

```text
Tiptap DocumentEditor -> serialized JSON -> caller
```

未来可由独立 Editor Adapter 负责文档与产品 Block 的映射，再接 Local Persistence 与 Sync；该适配、持久化和同步链路均不属于本 spike：

```text
Editor Adapter -> Document / Block -> Local Persistence -> Sync
```

这里的 Tiptap JSON 只是 Editor representation / serialization boundary，**不是 Eotion 永久 Domain Model**。`editorDocument.ts` 只定义当前序列化值和复制边界，不建立尚未需要的 Adapter 接口。

Schema 使用已有 StarterKit 3.31.3，禁用 link 和 underline；保留 paragraph、heading、text、bullet / ordered list、blockquote、code block、bold、italic、strike，以及默认的 hard break、horizontal rule、inline code 和 undo/redo。无自定义节点、插件注册表或直接 ProseMirror API。

限制：只接收有效、JSON-safe 的当前 schema 文档；不做任意外部数据验证或迁移。没有自动保存或持久化，开发页卸载重挂会回到初始值。生产构建不包含这个 DEV 入口。本轮未改变既有正式编辑器、产品页面、数据模型或同步行为。