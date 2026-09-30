# Handoff

> 仅在任务需要跨会话、跨 Agent、跨模型或暂停后继续时填写；任务完成后清理。

- Goal: P5.4 Real Sync 的完整退出验收。
- Current state: Web / Electron 的正式 local-first 链路与自动 E2E 已完成；P5.4 暂不标完整 PASS。
- Completed: Snapshot API/SDK、`page.move`、IndexedDB/SQLite 安全 hydrate、按当前账号 workspace 过滤 oplog、Page Tree/Editor 本地保存、Push→Pull、离线身份/工作区缓存、生产 Web Service Worker、保存与同步状态分离。
- Remaining: 在目标 Mobile WebView/Lynx 宿主使用稳定 HTTPS origin（或先决策 bundled/local origin 的迁移方案），完成真机完全断网重启、继续写入及重连验收，然后决定 P5.4 PASS。当前默认 LAN HTTP 开发地址不满足安全上下文，不能作为该验收路径。
- Key evidence: `docs/p5-real-sync.md`；独立 review 已检查覆盖保护、跨账号发送、活跃编辑器、空段落、Web/SQLite 语义。
- Files changed: `packages/contracts`、`packages/sdk`、`packages/storage`、`apps/api`、`apps/web`、`apps/desktop` 与 P5.4 文档/测试，详见本阶段提交。
- Validation completed: Web `test:product` 55/55、`test:storage` 9/9、`test:real-sync` 1/1、`test:offline-shell` 1/1；storage 6/6、Desktop 7/7、SDK 12/12、API domain 2/2、HTTP/Sync/File 全通过；相关 typecheck/build 与 `git diff --check` 通过。
- Decisions: 本地内容是 durable source of truth；Push 成功且无未同步本地 operation 才允许指定 workspace 的 snapshot replace；顺序多设备采用 Server 最后成功提交的 mutation，无 CRDT/revision merge。
- Next recommended action: 用户当前决定先推进 P5.6 Settings & Preferences；原生移动宿主暂缓。P5.6 范围见 `docs/p5-settings.md`。之后在 P5 Final Acceptance 前仍需处理或明确 P5.4 Mobile WebView 真机离线重启验收。
- Risks / blockers: Mobile LAN HTTP 无 Service Worker；IndexedDB pending 查询目前读取整个 oplog，历史 synced 记录很多时有性能成本（不影响当前数据正确性）。

## P5.5 后续上下文

P5.5 Attachments 已 PASS，见 `docs/p5-attachments.md`。附件通过既有 Block/oplog 同步；二进制在线上传，IndexedDB/SQLite cleanup queue 按 delete ack、存活引用与当前授权清理。产品回归更新为 72/72，storage/Electron 为 10/10，真实双客户端为 1/1；另完成线上 OSS 图片/文件、刷新、第二客户端、URL 字节和删除后 404 验收。GPT-6.1 Sol 独立 review 无剩余确定 blocker。P5.5 没有新增原生宿主，以上 P5.4 真机待验收依旧保留，也没有关闭整个 P5。


## P5.6 完成 / 下一阶段

P5.6 Settings & Preferences 已 PASS（2026-10-01），版本保持 0.0.1 / build 1，完整实现与验收见 docs/p5-settings.md。独立认证设置路由、宽屏双栏与 compact Index→Detail；昵称跨设备/缓存一致；scrypt 改密通过 Mongo 事务更新 hash/version 并 revokeAll，所有旧 Session 失效；Theme device-local system/light/dark 在生产入口前应用并实时响应系统；固定 Toolbar 默认 OFF，按 user/workspace/device 隔离且不关闭 touch/Slash；MCP/Agent 只有即将推出。

Web product 111/111、Settings 11/11、theme 3/3 + production 1/1、storage/Electron 11/11、offline-shell 1/1、real-sync 1/1；API/SDK/各端构建类型检查均通过。Light/Dark 1440×900、1024×768、390×844 实际截图与独立 review 无 blocker。真实双客户端验证昵称及改密后的旧会话/旧密码失效、新密码可登录。截图在系统临时目录 eotion-p56-visual-qa，临时测试 Mongo 容器已移除。

下一步：单独开始 P5 Final Acceptance。本次不声明整个 P5 PASS；上文 P5.4 目标移动 WebView/Lynx 真机完全离线重启边界仍保留。运行真实测试时可通过 EOTION_REAL_API_PORT / EOTION_REAL_WEB_PORT 避免占用现有服务，见 docs/runbooks/testing.md。
