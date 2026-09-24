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

可能的本地存储：

- Web：IndexedDB
- Electron：SQLite，位于 Electron 主进程/worker 之后 + 类型化预加载 IPC
- Android/iOS：通过原生桥接的 SQLite 适配器
- HarmonyOS：通过 ArkTS/原生桥接的 SQLite/relationalStore 适配器

## 6. 编辑器方向

编辑器应在所有目标平台上保持 Web 技术：

```text
Vue 3
  -> Tiptap 3
  -> ProseMirror
  -> later Yjs
```

桌面端和移动端共享文档 schema/编辑器核心，但交互方式可能不同（悬停手柄 vs 长按/触摸工具栏）。

## 7. Agent 集成（规划中）

Eotion 将为兼容的 Agent 提供 MCP 服务。它属于 API 模块化单体，并将调用与其他 API 客户端相同的已认证应用服务。初始能力将聚焦于发现、搜索、读取，以及显式创建或更新工作区内容。见 [Agent 集成基线](agent-integration.md)。
