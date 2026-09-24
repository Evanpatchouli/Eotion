# Eotion 引导路线图

## P0 - 仓库冒烟测试

退出标准：

- `pnpm install` 成功。
- `pnpm dev:web` 打开 Vue UI。
- `pnpm dev:desktop` 在 Electron 中打开完全相同的 Web UI。
- `pnpm dev:api` 在配置或不配置 Mongo 的情况下都能提供 `/api/health`。
- `pnpm dev:mobile` 生成 Vue Lynx bundle/二维码，并且移动端外壳可以在 Lynx Explorer 中打开。

在 P0 全部通过之前，不要添加产品功能。

## P1 - 移动端 WebView 概念验证

验证入口与操作说明见 [移动端 P1 演示页](p1-mobile-demo.md)。

先在 HarmonyOS 6 上验证，然后是 Android 和 iOS：

- 在 Lynx `<webview>` 中加载 Eotion Web；
- 局域网开发 URL 和生产 URL；
- WebView 尺寸调整/方向切换；
- 导航/返回处理；
- Lynx <-> Web 消息桥接；
- 后台/前台恢复；
- 剪贴板/文件/分享桥接可行性。

## P2 - 编辑器概念验证

向 `apps/web` 添加 Tiptap 3 编辑器。ProseMirror 不作为第二套编辑器单独接入；仅在 Tiptap 抽象不足时通过 `@tiptap/pm` 使用底层能力，并验证：

- 中文输入法组合输入；
- 选区/光标；
- 斜杠命令；
- Tiptap Extension/Command 作为默认扩展入口，必要的区块选择、Selection/Transaction、Decoration 等能力才下沉到 `@tiptap/pm`；
- 不额外直接引入 `prosemirror-*` 依赖，除非出现 `@tiptap/pm` 无法满足且已验证的具体需求；
- 5,000 个区块的合成文档；
- 触摸工具栏和长按行为；
- Web、Electron、HarmonyOS WebView 的一致性。

## P3 - 本地优先基础

- 在 `packages/` 中定义存储接口。
- Web IndexedDB 适配器。
- Electron SQLite 适配器，通过主进程/worker + 预加载 IPC。
- 在 HarmonyOS 上验证移动端存储桥接。
- 操作日志和重连语义。

## P4 - 服务器领域

- 用于工作区/页面/区块/文件元数据的 MongoDB schema。
- 认证/会话。
- 类型化契约和 SDK。
- 使用签名凭证/URL 的阿里云 OSS 直传。

避免使用一个包含所有区块的巨型 Page 文档。

## P5 - Agent 集成（MCP）

在 P4 提供认证、工作区/页面领域 API 和类型化契约之后再构建此部分。

- 作为 NestJS/Fastify 模块化单体的一部分，向 `apps/api` 添加 MCP 适配器；将工具路由到与其他客户端相同的应用服务和授权检查。
- 从有界的、工作区范围的工具开始，用于列出/搜索和读取页面；添加显式的页面/区块创建和更新操作，并定义审计和重试行为。
- 在每次调用时强制执行用户和工作区权限，验证输入，限制结果大小，并应用 API 速率限制。不要暴露直接数据库访问或无限制的破坏性/批量操作。
- 使用 Codex 和另一个兼容的 MCP 客户端验证设置和端到端行为。
- 记录支持的工具、认证设置和操作限制。

范围和​​安全边界见 [Agent 集成基线](architecture/agent-integration.md)。

## P6 - 协作

- 仅在单用户本地优先路径稳定之后再添加 Yjs。
- 决定协作服务器持久化/压缩策略。
- 仅在存在在线状态/扇出/水平扩展需求时才添加 Redis。

## P7 - 异步基础设施

仅在存在具体消费者时引入 Kafka，例如：

- 搜索索引；
- 审计管道；
- 通知；
- 分析；
- AI 索引。

除非有特定理由，否则保持 API 写入同步到 MongoDB。
