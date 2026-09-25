# Eotion 架构基线

## 1. 客户端原则：Web 优先

`apps/web` 就是产品。它负责路由、编辑器 UI、工作区 UI、状态以及响应式交互模型。

```text
                       apps/web
                 Vue 3 + Vite UI
                        |
          +-------------+-------------+
          |             |             |
       Browser       Electron       Vue Lynx
                         |             |
                    same renderer    <webview>
                                       |
                                Harmony/iOS/Android
```

Web UI 有三种布局模式，但只有一套代码库：

- 桌面端：多窗格、鼠标/键盘、悬停/上下文菜单/快捷键。
- 平板端：可折叠/浮层侧边面板、触摸/混合输入。
- 移动端：单列、以抽屉/底部面板为导向的触摸交互。

运行时、布局和输入模式是不同的概念。一个狭窄的 Electron 窗口并不会自动成为移动端运行时。

## 2. 桌面端

`apps/desktop` 只包含 Electron 主进程/预加载相关关注点。electron-vite 将其渲染器根目录直接指向 `apps/web`。

平台 API 之后必须通过狭窄的预加载桥接暴露。不要在渲染器中启用 Node.js 集成。

## 3. 移动端

`apps/mobile` 使用 Vue Lynx 作为应用外壳。v0.1 在 Lynx 内置的 `<webview>` 中加载 Eotion Web。

之后的原生专属能力应置于类型化桥接之后：通知、深度链接、文件、分享面板、本地数据库和应用生命周期。

默认情况下，不要将整个 UI 移植到 Lynx。只有在有可衡量理由时，才应引入原生 Lynx 屏幕。

## 4. 服务器

从模块化单体开始：

```text
NestJS + Fastify
  auth
  users
  workspaces
  pages
  blocks
  files
  sync
  search
  mcp (planned agent-facing adapter)
       |
     MongoDB -------- Aliyun OSS
```

MCP 适配器将是同一应用能力的另一个接口，而不是一个独立服务，也不是绕过 API 授权的路径。其规划范围和安全边界见 [Agent 集成基线](agent-integration.md)。

Redis 是之后的缓存/在线状态/速率限制/分布式状态依赖。Kafka 是之后的事件骨干，用于索引、审计、通知和分析等异步工作负载。

## 5. 持久化与同步方向

不要将 MongoDB 集合直接镜像到 SQLite 表中作为数据库复制方案。

长期模型应同步领域操作/文档变更：

```text
Client edit
   -> local store
   -> oplog / CRDT update
   -> sync transport
   -> server
   -> MongoDB / collaboration persistence
```

P3 已实现的本地存储基础详见 [P3 本地优先基础](../p3-local-first.md)。当前各端状态：

- `LocalStore` 与 Mobile storage bridge 协议同属 `@eotion/storage`；通用 API/P1 协议留在 `@eotion/contracts`，后者不依赖本地存储。
- Web：IndexedDB，已实现。
- Electron：SQLite，位于 Electron 主进程之后，通过类型化预加载 IPC 访问，已实现。
- Android/iOS：平台原生持久化尚未实现。
- HarmonyOS：typed WebView bridge 已定义，原生存储宿主模块尚未实现，manual verification required。

P3 reconnect 依赖持久 oplog，以稳定 operation id 至少一次投递；同一 JS realm 中同一 store 对象的并发调用会合并，但跨实例和跨 renderer 不互斥。P4 的 sync transport/server 必须按 operation id 幂等。

## 6. 编辑器方向

编辑器应在所有目标平台上保持 Web 技术。Eotion 的编辑器框架只有 **Tiptap 3**；ProseMirror 是 Tiptap 的底层编辑引擎，不作为第二套编辑器并行接入。

```text
Vue 3
  -> Tiptap 3 (primary editor framework / extension surface)
       -> ProseMirror (underlying engine, via @tiptap/pm when needed)
       -> later Yjs
```

实现原则：

- 默认优先使用 Tiptap 的 Extension、Command、Node、Mark 等上层 API 实现编辑器能力。
- 只有当 Tiptap 抽象不足以实现区块选择、复杂 Selection/Transaction、Decoration、NodeView、剪贴板、拖拽等底层行为时，才下沉到 ProseMirror API。
- 需要 ProseMirror 能力时，优先从 `@tiptap/pm/*` 导入，保持与 Tiptap 使用的 ProseMirror 版本一致。
- 不单独维护一套 `prosemirror-*` 直接依赖，也不要形成“半套 Tiptap + 半套原生 ProseMirror”的并行架构；只有存在明确、经过验证的技术理由时才例外。

桌面端和移动端共享文档 schema/编辑器核心，但交互方式可能不同（悬停手柄 vs 长按/触摸工具栏）。

## 7. Agent 集成（规划中）

Eotion 将为兼容的 Agent 提供 MCP 服务。它属于 API 模块化单体，并将调用与其他 API 客户端相同的已认证应用服务。初始能力将聚焦于发现、搜索、读取，以及显式创建或更新工作区内容。见 [Agent 集成基线](agent-integration.md)。
