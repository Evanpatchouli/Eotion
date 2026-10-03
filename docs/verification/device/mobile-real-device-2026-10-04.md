# Mobile Real-device Acceptance — 2026-10-04

**结论：不得声明 Mobile Real-device Acceptance PASS。** Android 的两次完全离线进程重启、Session、Workspace/Page 和手动重试后的第二客户端一致性已验证；原生附件选择失败，真实软键盘/IME composition 未完成，Touch Toolbar 标题为 H2 而非本轮要求的 H1，自动重连未在观察窗口内完成。

用户在本轮开始后明确调整范围为“nova 14 可以不测，只测安卓”。HarmonyOS 全部记为 **NOT RUN**，不能沿用历史登录/权限修复结果冒充本轮验收。不重复测试成功登录，没有清除数据或卸载应用，没有修改产品代码。

## 环境和基线

- Git：本地 master `3625f74b9a1f9f7be91eb5a8c6f0680b9ff92acb`；执行 `git fetch origin master` 后与 origin/master 一致。
- Android：现有 MuMu，Android 12，模拟设备型号 PGT-AN00；这不是实体 Android 手机，不能外推所有硬件/IME 行为。ADB 的 `127.0.0.1:16384` 与 `127.0.0.1:7555` 均由同一 MuMu VM 进程提供，并非两台设备。
- 从该 master 重新执行 `pnpm mobile:android:apk`，覆盖安装成功，保留原已登录数据。包版本 0.0.1 / build 1，Lynx bundle 88,177 bytes。构建 SHA、bundle/产物 SHA256 见 [build-android.json](evidence/mobile-20261004-android/build-android.json)。
- WebView 加载 `https://eotion.evanpatchouli.space` 的正式 Web UI，不是 LAN 开发页。最新 master 是本轮原生包构建基线；未独立核实线上 Web 部署的 Git SHA，不能把原生包 SHA 当作线上 Web SHA。
- 竖屏 720×1280，横屏 1280×720，240dpi。竖屏通过 Android window manager 旋转设置获得。结束时已恢复 Wi-Fi、移动数据、非飞行模式、自动旋转和原 window manager 默认策略，关闭本轮启用的触点显示。
- 第二客户端：独立 Playwright Chromium context，访问同一正式 HTTPS 产品路由，独立 IndexedDB。仅在内存中复用既有 Session Cookie，未重新登录；Cookie 值未写入证据或提交。

## 验收矩阵

FAIL 在此表示该验收 Gate 未满足；环境导致未完成的项目另标 BLOCKED，并不据此认定产品缺陷。

| 项目 | Android | HarmonyOS | 边界 |
| --- | --- | --- | --- |
| Session 持久化 | PASS | NOT RUN | force-stop 后新 PID，认证 UI + 持久 Cookie 服务端验证 200 |
| Workspace / Page | PASS | NOT RUN | 已有页面、新测试页面之间切换、返回/重新进入；无白屏/崩溃或明显溢出 |
| 编辑器真机交互 | FAIL / PARTIAL | NOT RUN | 基本编辑与系统选择通过；真实 composition 未测，要求的 Touch Toolbar H1 未提供 |
| 离线两次 kill/restart | PASS | NOT RUN | 完全断网，A/B 分别在真实进程重启后保留 |
| 断网编辑后恢复同步 | FAIL / PARTIAL | NOT RUN | 自动恢复未通过；点击同步状态重试后完成同步 |
| 第二客户端最终一致 | PASS（手动重试后） | NOT RUN | Mobile → server → 独立 Web context，A/B 均存在 |
| 附件 / 文件选择 | FAIL | NOT RUN | 图片和文件均不打开系统 picker；上传、卡片、附件重启保留因此未执行 |
| Safe Area / IME | FAIL / BLOCKED | NOT RUN | 无键盘时竖/横屏和抽屉可用；实际键盘遮挡、composition 未完成 |

## Session 与 Workspace / Page

初始已登录。覆盖安装最新 master APK 后进入 Workspace；首次在线 force-stop 从 PID 4113 结束，重新启动后为 4329，未要求重新登录。后续再次独立记录 force-stop：`5439 → 无进程 → 6206`，见 [session-final-process.json](evidence/mobile-20261004-android/session-final-process.json)。

从设备持久 WebView Cookie 数据库只读取得已有 Session，在探针内存中调用正式 `/api/auth/me`，返回 200 且有认证用户 ID；记录只保存布尔值、状态码和 PID，见 [session-server-validation.json](evidence/mobile-20261004-android/session-server-validation.json)。这是设备 Cookie 的服务端有效性验证，**不是捕获 App 自身 `/auth/me` 请求**。结合重启后在线认证 UI 与“已同步”，证明持久 Cookie 对应的服务端 Session 有效，不能仅以缓存 UI 解释本次结果。

Workspace 的 Page Tree 显示已有“测试清单”；打开后正文与原有粗体文字可见。本轮在产品 UI 新建测试 Page（标题“无标题”），再在两页和 Workspace 之间切换、关闭/重新打开抽屉，内容正常。已有页初期受到工具栏类型测试及一个空段落的临时修改；结束前已在严格校验正文未变后还原为未勾选 todo、保留原粗体文字、移除本轮空段落，并在 Android 重新打开确认。测试 Page 保留作复核，未删除用户原正文。

## 编辑器与 IME

普通段落实际完成英文输入、中文文本提交、换行、删除末尾 `X`、左右移动光标、长按文本选择。系统菜单显示“剪切 / 复制 / 粘贴 / 全选”，未同时出现 Eotion Bubble Menu，见 [system-selection.png](evidence/mobile-20261004-android/system-selection.png)。中文通过 MuMu 的 `input_text` 提交，**不是拼音候选或真实 composition**，不能据此声称 IME 不丢字/不重复字。

Touch Toolbar 实测粗体、斜体、文本、标题、列表。服务端测试 Page block JSON 确认 `bold`/`italic` marks 和 `bulletList`；标题按钮生成 `heading.attrs.level = 2`。`apps/web/src/components/editor/EotionEditor.vue` 的 Touch Toolbar 对应 `toggleHeading({ level: 2 })`；`docs/design/editor-architecture-spike.md` 原冻结规范也写“二级标题”。本轮新增验收要求的是 H1，因此对此次 H1 子项记 FAIL / 需求差异，**不将 H2 定性为违反现有产品规格**，不为测试改成 H1。

已有 todo 的正文短点击多次触发 checkbox 切换，而不是可靠定位输入光标；普通新 Page 可正常输入。当前 `AttachmentNodeView.vue` 将 todo NodeViewWrapper 渲染为包含 checkbox 和正文的 `label`，是定位线索；未把此前输入失败泛化为整个编辑器无法编辑，未认定唯一根因。

模拟器当前只有 SogouIME-chuizi 以及 Appium/Empty/Unicode IME。编辑普通段落时 `dumpsys input_method` 显示 `mInputShown=true`、有效 InputConnection、`mIsInputViewShown=true`，但 `dumpsys window` 的 InputMethod 窗口 `Requested w=720 h=0`；截图中没有实际软键盘，见 [IME 摘录](evidence/mobile-20261004-android/ime-excerpt.txt)。`show_ime_with_hard_keyboard` 原本已为 1。因此 caret/toolbar 与真实键盘共存、中文 composition、键盘打开时抽屉不被遮挡均为 BLOCKED；未安装替代输入法，未伪造键盘 inset。

## 完全离线的两次进程重启

1. 在线创建并打开测试 Page，输入 `ANDROID_ACCEPT_20261004_ONLINE`，等待“已同步”。作为离线流程的已有且已缓存 Page 使用。
2. 关闭模拟器 Wi-Fi/移动数据、启用飞行模式。`dumpsys connectivity` 为 `Active default network: none`，`ip route` 无路由，见 [网络摘录](evidence/mobile-20261004-android/offline-network.txt)。关闭 Wi-Fi 后 TCP ADB 不再响应，改用已有 MuMuManager guest shell 执行同等 Android 命令；没有恢复网络来操作。
3. 离线输入 `ANDROID_ACCEPT_20261004_OFFLINE_A`，等待“离线 · 本地已保存”。执行 `am force-stop` 并验证无 PID，再启动：`4961 → 无进程 → 5218`。仍保持离线，进入 Page，A 存在。见 [进程证据](evidence/mobile-20261004-android/offline-a-process.json)、[A 恢复截图](evidence/mobile-20261004-android/offline-a-restored.png)。
4. 继续离线输入 `ANDROID_ACCEPT_20261004_OFFLINE_B`，等待本地保存，再 force-stop/start：`5218 → 无进程 → 5439`。离线再次打开 Page，A/B 都存在。见 [进程证据](evidence/mobile-20261004-android/offline-b-process.json)、[A/B 恢复截图](evidence/mobile-20261004-android/offline-b-restored.png)。

流程开始前还做过一次未写入 A 的离线启动探查，不计作上述两次 Gate。没有用 reload 代替 kill/restart，没有用线上恢复替代离线恢复。

## 重连、oplog 与第二客户端

在设备仍无默认网络、完成两次重启后，用主机只读请求检查服务端：ONLINE 已存在，OFFLINE_A/B 都不存在，见 [server-before.json](evidence/mobile-20261004-android/server-before.json)。证明这两段确实尚未到服务器。

恢复模拟器网络后，ConnectivityService 显示默认 Wi-Fi 网络及 VALIDATED；连续观察截图和服务端读取仍显示“离线 · 本地已保存”，两段未 Push。随后点击产品已有同步状态的重试按钮，页面变为“已同步”。所以自动重连子项 FAIL，不能用手动成功覆盖这段失败记录；无数据丢失证据。

手动重试后，服务端 blocks 与独立 Chromium 正式 Page 的实际 `.tiptap` 正文均包含 ONLINE/A/B；第二客户端 `pageerror` 为空。见 [server-after.json](evidence/mobile-20261004-android/server-after.json)。第二客户端没有执行任何 A/B 写入，也没有复制 Mobile 的 IndexedDB。

oplog 的验证层级：设备 SyncStatus 显示“已同步”；当前 `SyncStatus.vue` 先检查 `sync.pending > 0`，再显示 synced，`productSync.ts` 在 pending/failed 为零、指定 Workspace snapshot Pull 和本地 replace 成功后才设置 synced。因而当前授权 Workspace 的 **pending=0 与 Pull 完成由真实 UI 加代码路径推导**；没有直接查询设备 IndexedDB 的 oplog 条目数，不能声称抓取了原始 pending 计数或整个数据库清空。历史 synced operation 本来就不必删除。

## 附件 / 文件选择

竖屏、在线、普通测试 Page 上分别点击图片和文件按钮，按钮有响应/焦点样式，但没有打开系统选择器；窗口焦点仍是 Eotion MainActivity。初次和复测结果一致，见 [图片按钮复测](evidence/mobile-20261004-android/image-picker-retest.png)，文件复测原始截图保存在下述忽略证据目录。未绕过系统选择器用 `setInputFiles` 冒充真机上传。

定位：Web 通过隐藏 `input[type=file]` 的 `.click()` 发起选择。缓存 `xelement-webview:4.1.0` AAR 的 `javap -c -p` 显示默认 `DefaultWebViewServiceImpl.initWebView()` 创建 Android WebView 并设置 `WebViewClient`，没有设置 `WebChromeClient`；其 client 只实现页面加载/错误回调，没有 `onShowFileChooser`。当前 MainActivity 注册默认 XElement behaviors，没有自定义文件选择 service。准确命令、AAR SHA256、反编译摘录和调查边界见 [picker 调查](evidence/mobile-20261004-android/xelement-picker-investigation.txt)。这与现场现象吻合，但不是对所有未检查层的排除证明；本轮未修复该原生能力边界。

图片选择/上传/显示、文件选择/上传/卡片显示及附件 kill/restart 保留均未完成。FAIL 是选择器入口失败，不是已观察到服务端上传失败；未发现可归因的权限拒绝日志，不笼统写“Android 不支持”。

## Safe Area 与日志

无键盘时竖屏顶部内容位于 36px 系统状态栏之下；抽屉打开/关闭、底部 Touch Toolbar 可见，无明显横向溢出或双滚动条。横屏顺手验证 Page Tree、正文及 Toolbar，可用。此 MuMu 隐藏系统导航栏，不能证明实体手机手势区/导航栏 inset；键盘高度为零，不能证明键盘打开时 caret/toolbar 不遮挡。Safe Area / IME 完整 Gate 因此未通过。

采集 Android `logcat`，最后在线重启的宿主摘录见 [runtime-host.txt](evidence/mobile-20261004-android/runtime-host.txt)：

- `Lynx initialized=true nativeLoaded=true`、`Bundled template read: 88177 bytes`、`Lynx template loaded`、`Lynx first screen`。
- 仍有非阻塞 Lynx error **321**（image prefetch helper）和 **2298**（Devtool 未启用时设置 enable-debug），UI 和保存/离线恢复仍工作；不将它们单独作为本轮失败原因。
- 本轮采集未发现 Eotion `FATAL EXCEPTION`、`discriminator` / error 201 或可归因的 JS exception。生产 WebView 调试关闭，没有完整 DevTools console/network trace，不能声称“零 runtime error”。
- 系统存在 NTP、模拟器 Watchdog 等 warning；断网重连过程有 ConnectivityService 的路由 code 64。作为环境日志保留，不因无关 warning 判产品失败。

## 证据、修改与后续

提交的脱敏 JSON、宿主日志摘录及不显示账号信息的 Page 截图位于 [evidence/mobile-20261004-android](evidence/mobile-20261004-android/manifest.json)，manifest 保存 SHA256。完整原始截图、logcat、IME/window/connectivity、测试 Page 节点、构建日志与 javap 调查保存在忽略目录：

`apps/mobile-hosts/release/runtime-verification/acceptance-20261004/`

本轮只提交验收文档、证据与任务/交接记录。产品功能、依赖、协议及宿主代码没有修改。后续应独立处理 Android 原生文件选择、Touch Toolbar H1 需求差异、todo 正文 touch 行为、重连后自动同步；用有真实可见中文输入法及导航/手势区的 Android 环境补完 composition/Safe Area，再重新判断 Android PASS。HarmonyOS 本轮不测，完整双平台结论继续保留。
