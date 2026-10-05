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
- Web IndexedDB 适配器；Mobile WebView 与 Web 共用同一个 adapter，并进行目标真机持久性验收。
- Electron SQLite 适配器，通过主进程/worker + 预加载 IPC。
- Mobile WebView 保持稳定 origin/storage partition；`mobile-webview` runtime/UI marker 不选择存储 adapter。origin 从远程切到 bundled/local 时重新评估数据迁移。
- 操作日志和重连语义。

## P4 - 服务器领域

目标：补齐正式产品所需的服务端基础，使 P5 可以直接围绕真实业务页面开发，而不是继续停留在 PoC / Demo。

进度：**P4 已完成，Final Acceptance 已通过**；六条退出条件的证据和验证结果见 [P4 Final Acceptance](p4-final-acceptance.md)。P4.1 服务端领域与 MongoDB 基础见 [P4.1 Server Domain](p4-server-domain.md)；P4.2 User、认证、Session 和 owner-only 工作区权限基础见 [P4.2 Auth / Session](p4-auth-session.md)；P4.3 类型化 HTTP API 与 SDK 见 [P4.3 Typed HTTP API](p4-http-api.md)；P4.4 真实 sync transport 与 operation ID 幂等见 [P4.4 Sync](p4-sync.md)；P4.5 File metadata、workspace HTTP 与 ali-oss-server 对象生命周期见 [P4.5 File Storage](p4-file-storage.md)。下一阶段为 P5 Product MVP；P5 正式附件 UI 仍属于 P5。

- 用于工作区/页面/区块/文件元数据的 MongoDB schema。
- 认证/会话与工作区级权限基础。
- 类型化契约和 Eotion SDK。
- 将 P3 的本地 oplog 接入真实 sync transport / server；服务端必须按稳定 operation ID 幂等处理至少一次投递。
- 文件元数据由 Eotion 管理；对象存储复用独立部署的 `ali-oss-server`，不在 Eotion 内重复实现 OSS 签名、上传或对象管理基础设施。
- `apps/api` 通过 `ali-oss-server` 提供的 SDK 连接该服务；开发环境连接本机运行的 `ali-oss-server`，部署环境连接已部署服务。
- 为 Eotion 配置专属的 `clientId` / `clientSecret` 和服务地址；密钥只存在于 Eotion 服务端配置中，不下发给 Web、Mobile WebView 或 Electron renderer。

避免使用一个包含所有区块的巨型 Page 文档。

P4 退出条件：

- 用户可以完成认证并建立有效会话。
- Workspace / Page / Block 的服务端领域模型、CRUD / 查询能力和权限检查可通过类型化 API 使用。
- P3 pending / failed operation 可以通过真实 transport 发送到服务端，重复发送同一 operation ID 不产生重复业务效果。
- 客户端重新上线后可以继续同步本地 oplog，并读取服务端持久化结果。
- 文件元数据链路可用，Eotion API 能通过 `ali-oss-server` SDK 完成所需对象存储操作。
- 相关 contract、SDK、integration test 和最小端到端验证完成。

## P5 - 产品 MVP（正式功能开发）

P4 ✅ Final Acceptance PASS。P5 按以下独立阶段验收：

- P5.1 Product Shell + Auth / Workspace：✅ 已完成，见 [产品入口与运行说明](p5-product-shell.md)。
- P5.2 Page Tree：✅ 已完成，见 [P5.2 Page Tree](p5-page-tree.md)。
- P5.3 Real Page Editor：✅ 已完成，见 [正式页面编辑器](p5-real-page-editor.md)。
- P5.4 Real Sync：✅ P5 范围通过。Web / Electron 正式链路与自动验收完成；HarmonyOS “杀 App + 完全离线冷启动”存在已接受限制，不再阻塞 P5，见 [P5.4 Real Sync](p5-real-sync.md) 与 [P5 Final Acceptance](p5-final-acceptance.md)。
- P5.5 Attachments：✅ 已完成，正式附件、持久清理、三种布局、自动测试与线上 OSS 最小验收通过，见 [P5.5 Attachments](p5-attachments.md)。
- P5.6 Settings & Preferences：✅ 已完成；账号昵称/安全改密、三态主题、隔离的固定编辑工具栏偏好、响应式 Settings 与 Light/Dark Visual QA、独立 review 均通过，见 [P5.6 Settings & Preferences](p5-settings.md)。
- P5.7 UI/UX Foundation & Product Redesign：✅ **PASS**。Quiet Studio 方向、Design System v1、核心 Screen Spec、自动视觉回归与正式 Product UI 已收敛；2026-10-06 用户完成最终视觉签字，见 [P5.7 UI/UX Foundation](p5-ui-ux-foundation.md)。
- P5.8 Editor MVP：✅ **PASS / FROZEN FOR P5**。已有 Paragraph、Heading、Bullet/Ordered List、Todo、Quote、Code Block、Divider；Bold、Italic、Strike、Inline Code、Inline Link；Image、File；Slash、鼠标选区 Bubble、Touch Toolbar、本地优先保存与同步。P5 不再增加 Table、Callout、Mention、Bookmark、Underline 等编辑器能力；后续阶段再评估。触摸端 Link 可显示/保留，显式创建入口不属于当前 P5。
- P5 Final Acceptance：✅ **PASS（2026-10-06）**。用户明确同意在不追加额外测试的情况下按既有证据封板；HarmonyOS 杀 App 后完全离线冷启动作为 Accepted Limitation，附件 cleanup 偶发状态作为 Future Debt 继续观察。见 [P5 Final Acceptance](p5-final-acceptance.md)。

从本阶段开始，以真实用户流程和正式产品路由为主，不再以 `/__dev/*` PoC 页面作为主要开发载体。P1/P2/P3 开发页可以继续保留作为回归和诊断入口。

首个 MVP 聚焦单用户 / 多设备的 Notion 类核心体验：

- 登录、退出和会话恢复。
- Workspace 创建、切换、重命名及基础管理。
- 页面树与子页面：创建、打开、重命名、移动、删除。
- 将 P2 Tiptap 编辑器正式接入 Page，而不是只运行独立编辑器 Demo。
- Page / Block 的正式本地优先读写：自动保存、本地持久化、离线编辑、恢复网络后同步。
- 多设备读取已同步的数据，验证本地状态与服务端状态能够正确收敛。
- 图片 / 文件附件接入 P4 的 File domain，由 Eotion Server 通过 `ali-oss-server` SDK 处理对象存储。
- Settings 作为独立产品 Surface：账号昵称/密码、system/light/dark 主题、按 user + workspace + device 保存的固定编辑 Toolbar 偏好，以及 MCP / Agent 的“即将推出”预留 IA。
- Settings 在宽屏采用双栏 list-detail，在紧凑宽度采用 Index → Detail 单栏导航；不把桌面 Sidebar 强行塞进手机。
- 在 P5 Final Acceptance 前完成 P5.7：正式冻结 Eotion 的 UI/UX Design Direction、Design System v1、核心高保真页面和 visual regression 基线，避免 P6+ 在未定型的视觉语言上继续叠加。
- 桌面 / 平板 / 手机共用 `apps/web`，完成正式 Workspace / Page / Settings 页面所需的响应式交互。
- 最近页面、收藏和基础搜索不进入当前 P5 Feature Freeze；后续产品阶段再评估。

P5 退出条件：

- 新用户可以从登录开始，创建 Workspace 和 Page，并在真实页面中持续编辑内容。
- Web、Electron、Mobile WebView 均能打开同一正式产品页面，并完成核心读写流程。
- 离线编辑和常规页面 / 客户端重启路径不丢数据；恢复网络后能同步到服务端。HarmonyOS “杀 App + 完全离线冷启动”不在 P5 最终保证内，作为已接受限制记录。
- 第二个客户端可以读取已同步内容，核心单用户多设备路径可闭环。
- 文件 / 图片附件链路可用。
- Settings 可完成昵称/密码管理，Theme 支持 system/light/dark，固定编辑 Toolbar 默认关闭且偏好隔离正确；宽屏/紧凑 Settings 交互通过响应式验收。
- P5.7 Design Gate、正式 UI 实现与 Visual Acceptance 完成，核心 Surface 有稳定设计基线并通过视觉回归。
- P1/P2/P3 中验证过的高风险基础能力没有因正式产品集成而回归。

P5 不要求实现多人实时协作、完整权限体系、模板市场、复杂导入导出或大规模异步基础设施。

## P6 - Agent 集成（MCP）

在 P4 提供认证、工作区/页面领域 API 和类型化契约，且 P5 已形成稳定的真实产品能力之后再构建此部分。

- 作为 NestJS/Fastify 模块化单体的一部分，向 `apps/api` 添加 MCP 适配器；将工具路由到与其他客户端相同的应用服务和授权检查。
- 从有界的、工作区范围的工具开始，用于列出/搜索和读取页面；添加显式的页面/区块创建和更新操作，并定义审计和重试行为。
- 在每次调用时强制执行用户和工作区权限，验证输入，限制结果大小，并应用 API 速率限制。不要暴露直接数据库访问或无限制的破坏性/批量操作。
- 使用 Codex 和另一个兼容的 MCP 客户端验证设置和端到端行为。
- 记录支持的工具、认证设置和操作限制。

范围和安全边界见 [Agent 集成基线](architecture/agent-integration.md)。

## P7 - 协作

- 仅在单用户本地优先产品路径稳定之后再添加 Yjs。
- 决定协作服务器持久化/压缩策略。
- 仅在存在在线状态/扇出/水平扩展需求时才添加 Redis。

## P8 - 异步基础设施

仅在存在具体消费者时引入 Kafka，例如：

- 搜索索引；
- 审计管道；
- 通知；
- 分析；
- AI 索引。

除非有特定理由，否则保持 API 写入同步到 MongoDB。
