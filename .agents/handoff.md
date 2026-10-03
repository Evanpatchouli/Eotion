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
- Next recommended action: 用户当前决定在 P5 Final Acceptance 前先推进 P5.7 UI/UX Foundation & Product Redesign。先做 P5.7.1～P5.7.4 设计阶段并通过 Gate A，再进入正式 UI 实现；范围见 `docs/p5-ui-ux-foundation.md` 和 `docs/design/*`。之后仍需处理或明确 P5.4 Mobile WebView 真机离线重启验收。
- Risks / blockers: Mobile LAN HTTP 无 Service Worker；IndexedDB pending 查询目前读取整个 oplog，历史 synced 记录很多时有性能成本（不影响当前数据正确性）。

## P5.5 后续上下文

P5.5 Attachments 已 PASS，见 `docs/p5-attachments.md`。附件通过既有 Block/oplog 同步；二进制在线上传，IndexedDB/SQLite cleanup queue 按 delete ack、存活引用与当前授权清理。产品回归更新为 72/72，storage/Electron 为 10/10，真实双客户端为 1/1；另完成线上 OSS 图片/文件、刷新、第二客户端、URL 字节和删除后 404 验收。GPT-6.1 Sol 独立 review 无剩余确定 blocker。P5.5 没有新增原生宿主，以上 P5.4 真机待验收依旧保留，也没有关闭整个 P5。


## P5.6 完成 / 下一阶段

P5.6 Settings & Preferences 已 PASS（2026-10-01），版本保持 0.0.1 / build 1，完整实现与验收见 docs/p5-settings.md。独立认证设置路由、宽屏双栏与 compact Index→Detail；昵称跨设备/缓存一致；scrypt 改密通过 Mongo 事务更新 hash/version 并 revokeAll，所有旧 Session 失效；Theme device-local system/light/dark 在生产入口前应用并实时响应系统；固定 Toolbar 默认 OFF，按 user/workspace/device 隔离且不关闭 touch/Slash；MCP/Agent 只有即将推出。

Web product 111/111、Settings 11/11、theme 3/3 + production 1/1、storage/Electron 11/11、offline-shell 1/1、real-sync 1/1；API/SDK/各端构建类型检查均通过。Light/Dark 1440×900、1024×768、390×844 实际截图与独立 review 无 blocker。真实双客户端验证昵称及改密后的旧会话/旧密码失效、新密码可登录。截图在系统临时目录 eotion-p56-visual-qa，临时测试 Mongo 容器已移除。

下一步：单独开始 P5 Final Acceptance。本次不声明整个 P5 PASS；上文 P5.4 目标移动 WebView/Lynx 真机完全离线重启边界仍保留。运行真实测试时可通过 EOTION_REAL_API_PORT / EOTION_REAL_WEB_PORT 避免占用现有服务，见 docs/runbooks/testing.md。


## P5.7 Design First

P5.7 已正式插入 P5.6 与 P5 Final Acceptance 之间。原因：当前核心功能链已成立，但现有 UI/UX 主要由工程实施逐步演化，用户希望在后续 P6+ 扩展前先冻结 Eotion 的视觉基调、交互原则和 Design System。

P5.7.1～P5.7.4 只做 Audit、Design Direction、Design System v1 和核心高保真页面；用户明确批准 Gate A 前不得重构正式 Product UI。P5.7.5 才是实现阶段，P5.7.6 建立 Light/Dark × Desktop/Tablet/Mobile 的 Visual Acceptance / screenshot regression 基线。

主计划：`docs/p5-ui-ux-foundation.md`。设计文档地图：`docs/design/README.md`。


## P5.7.1 Audit 完成 / P5.7.2 Stitch

P5.7.1 UI/UX Audit 已于 2026-10-01 PASS，核心问题见 `docs/design/ui-ux-audit.md`。重点包括：Editor giant bordered Card、Desktop/Tablet Sidebar 不可折叠、Sidebar footer row 不统一、Workspace/Page inline panel 推布局、稳定态 context/status 重复、Attachment nested card、upload placeholder 脱离插入位置、失败反馈重复、cleanup/raw HTTP 技术语言泄露、Settings detail 超宽屏偏窄、Slash Menu 中英双语重复。

用户明确偏好：展开 Sidebar 右上角与右下角圆角，左侧贴边；Login/Register 暂无明显问题，不作为 P5.7 重设计重点。

当前进入 P5.7.2。统一 Design Brief：`docs/design/stitch-design-brief.md`。第一轮在 Stitch 使用同一 1440×900 Desktop Page 场景探索至少 3 个视觉方向；用户选中/组合后再冻结 `design-direction.md` 和 Design System v1。Gate A 前不得修改正式 Product UI。


## P5.7.2 Quiet Studio 冻结

P5.7.2 已于 2026-10-01 PASS。Stitch 第一轮探索 Editorial Paper / Precision Studio / Ambient Focus，后续收敛为 Quiet Studio A/B，并最终批准 **Quiet Studio**：以 A 的 warm editorial / document-first 为主，吸收 B 的 Sidebar 层级、popover 精度和附件信息对齐；不采用 C 的 Document Card / purple / gradient / glassmorphism。

Stitch 导出规范存在 Newsreader、Material-style token、30/32px 冲突及虚构业务内容等不一致，因此不作为 source of truth。正式方向见 `docs/design/design-direction.md`；Eotion 自维护的规范见 `docs/design/design-system-v1.md` 与 `docs/design/DESIGN.md`。

当前进入 P5.7.3。Gate A 前仍不修改正式 Product UI。Stitch 后续仅用于 Dark/Mobile/Settings/companion states 等视觉稿，不再负责最终规范。


## P5.7.3 Dark Theme 冻结

Quiet Studio Dark Desktop Page 已于 2026-10-02 通过人工 review。正式 Dark palette 已写入 `docs/design/design-system-v1.md` 与 `docs/design/DESIGN.md`。Stitch 原始 `text-muted #73716A` 与 `danger #C9615D` 因关键 dark surface 对比不足被修正为 `#8F8D86` 与 `#D06A66`。其余 Dark tokens 保留 Stitch 推导值。Stitch prototype 中残留的 Newsreader / Material Symbols / 虚构 metadata 不属于 Eotion source of truth。

下一项为 Desktop Settings 高保真推演，重点冻结 Settings detail responsive width/cap、navigation density、setting row anatomy 与 form/control visual treatment。Gate A 前仍不修改正式 Product UI。


## P5.7.3 Desktop Settings 冻结

Quiet Studio Desktop Settings Light 已于 2026-10-02 通过人工 review。Stitch 的三档 viewport 导出尺寸和 HTML max-width 与文字汇报不完全一致，因此正式规范采用人工归一化行为：Settings navigation 240px；detail min 520px / max 740px；1280 目标约 620px、1440 约 700–720px、1600+ 封顶 740px；outer gutter 分别 48 / 64 / 80px。Settings 继续保持 P5.6 list-detail IA，不新增功能，不做 Card dashboard。

Light `text-muted` 从 `#8F8D86` 修正为 `#706E67`，在 Light sidebar/canvas 上均达到约 4.6+:1，适合作为 12–13px muted text。下一项为 Desktop companion states：Collapsed Sidebar、Workspace Popover、Page Action Popover、Attachment Upload Failed。Gate A 前仍不修改正式 Product UI。


## P5.7.3 Desktop Companion States 冻结

Quiet Studio Desktop Companion States 已于 2026-10-02 通过人工 review：Collapsed Sidebar、Workspace Switcher Popover、Page Action Popover、Attachment Upload Failed 全部 APPROVED。未新增 token。

冻结要点：Sidebar collapsed 后完全退出主内容区，document 保持居中；breadcrumb 前唯一 reopen control，视觉约 32×32px（实现可扩大 pointer hit area 至约 36–40px），tooltip 为“展开侧边栏”。Workspace Popover 约 240px、trigger offset 约 6px；Page Action Popover min-width 160px、4px padding，固定动作“新建子页面 / 重命名 / 移动 / 删除”。所有 Popover 使用 anchored floating layer，ESC / click-outside 关闭，focus return，keyboard navigation，且不得造成 Page Tree layout shift。

Attachment Upload Failed 固定在最终插入位置，文案“上传中断”，操作“重试 / 移除”；同一次失败仅一个主要错误 Surface，不出现重复全局 banner，也不暴露 cleanup / object-storage 等内部术语。

下一项：Mobile Page 高保真推演（390×844 baseline），重点解决 drawer、mobile topbar/gutters、touch toolbar、IME coexistence、narrow attachment 与 mobile sync/offline presentation。Gate A 前仍不修改正式 Product UI。

## Mobile Native Hosts（Android + HarmonyOS）

本轮为 `apps/mobile` 增加了自有原生宿主：`apps/mobile-hosts/android`（Kotlin/Gradle/AndroidX）与 `apps/mobile-hosts/harmony`（ArkTS/Stage/Hvigor），二者加载 `pnpm build:mobile` 产出的本地 bundle，不依赖 Lynx Explorer，也不复制 Web UI。根命令为 `mobile:android:apk`/`aab` 与 `mobile:harmony:hap`/`app`，详见 `docs/runbooks/mobile-native-hosts.md`。

已实测：Android APK/AAB 构建成功；HarmonyOS HAP/App Pack 在 DevEco 自动调试签名下构建成功、`hap-sign-tool verify-app` 通过，并在 nova 14（HarmonyOS 6.1）真机安装、启动、常驻；两个宿主都读取到打包进产物的本地 bundle（187528 字节）并触发 Lynx `onFirstScreen`/`onLoadSuccess`。

未完成/阻塞：共享 `main.lynx.bundle` 在运行时抛 `ReferenceError: discriminator is not defined`（Android 与 HarmonyOS 完全一致），Lynx 首屏后 WebView 白屏。解码 bundle 可见 `background-thread-script` 顶层使用未声明的自由变量 `discriminator`（zod discriminated-union 路径）；`packages/contracts` 源码用的是字符串字面量，故为移动端打包链路缺陷。修复该 bundle 后，P5.4 的 Mobile WebView/Lynx 真机离线重启验收才具备继续条件。
