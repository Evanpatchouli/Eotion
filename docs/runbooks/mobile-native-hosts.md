# Mobile Native Hosts

`apps/mobile` 是共享 Vue Lynx Shell，`apps/web` 是唯一产品 UI。原生宿主不依赖 Lynx Explorer：

```text
apps/mobile-hosts/android/   Kotlin / AndroidX / Gradle
apps/mobile-hosts/harmony/   ArkTS / Stage Model / Hvigor
apps/mobile-hosts/release/   忽略的发行产物与构建元数据
```

## Windows 构建

```bash
pnpm build:mobile
pnpm mobile:android:apk
pnpm mobile:android:aab
pnpm mobile:harmony:hap
pnpm mobile:harmony:app
```

四个平台命令均自动执行 `build:mobile`，将 `dist/main.lynx.bundle` 和构建元数据打入宿主，然后运行原生工具链。不要并发执行这些命令，也不要在打包期间运行另一个 `build:mobile`。`dev:mobile` 的 Explorer 二维码流程仍可用于开发。

版本只从根 `package.json.version` 与 `eotion.buildNumber` 读取：Android 的 `versionName/versionCode` 在 Gradle 配置时读取；Harmony 的 `AppScope/app.json5` 在构建时生成。修改根版本后重新打包即可，不维护平台版本副本。源图 `apps/mobile/resources/icon.png` 直接配置为两个宿主的 launcher icon，不使用机器外部图片。

生产默认 `https://eotion.evanpatchouli.space`。原生命令仅接受进程环境中的显式 URL 覆盖，避免 `apps/mobile/.env` 的开发地址进入默认发行包：

```powershell
$env:EOTION_WEB_URL = 'http://<LAN-IP>:7173'
pnpm mobile:android:apk
Remove-Item Env:EOTION_WEB_URL
```

共享 `build:mobile` 支持进程与 `.env` 覆盖；没有覆盖时 production 使用 HTTPS，`dev:mobile` 自动选择 LAN 地址。URL 在编译时注入 Lynx Shell，原生代码不维护 URL 或 LAN IP。Lynx WebView 的调试开关在 production bundle 中关闭。

## 工具链

- Android：SDK Platform 36、Build Tools 36.0.0、JDK 17–24（优先已有 JDK 21）、Gradle Wrapper 8.14.5、AGP 8.11.1、Kotlin 2.2.10；Android minSdk 26。Lynx Android runtime 4.1.0、PrimJS 4.1.1、WebView XElement 4.1.0。
- Harmony：DevEco Studio、HarmonyOS SDK、Hvigor/OHPM；最低兼容 `6.0.0(20)`，target SDK 由发现的本机 HarmonyOS SDK 元数据生成。使用 DevEco 内置 Node/Hvigor/OHPM，不使用 Docker。
- Harmony Lynx runtime 固定为 **4.0.3**：`@lynx/lynx` / `@lynx/xelement_webview` 4.0.3，`@lynx/primjs` 4.0.1-alpha.5。**不要升到 4.1.0**：OHPM 上 `@lynx/gfx@4.1.0` 的 `libs/` 为空，缺少 `liblynxgfx.so`，而 `liblynx.so` 需要它；设备日志会直接报 `Error loading shared library liblynxgfx.so`，进程在 Lynx 静态初始化时以 `TypeError: Cannot read property EventReporter of undefined` 退出（4.1.0 实测）。
- Harmony 宿主有三个必须同时满足的集成点，缺一都会白屏或编译失败：
  1. `entry/src/main/module.json5` 必须有 `"pages": "$profile:main_pages"`。缺失时 `windowStage.loadContent('pages/Index')` 报 `SetUIContentInner: failed to init or restore uicontent ... errorCode: 13`，Ability 窗口空白。
  2. `entry/oh-package.json5` 依赖中必须有 `@lynx/primjs`，否则缺少 JS 引擎库。
  3. `EotionTemplateResourceFetcher` 必须实现抽象成员 `fetchSSRData`，否则 ArkTS 编译报 `does not implement inherited abstract member 'fetchSSRData'`。
- 宿主使用 `hilog` 域 `0xE071`、tag `EotionHost` 记录生命周期与 Lynx 回调；Android 对应 tag 也是 `EotionHost`。排查首屏时先用这些日志确认 `fetchTemplate`/模板加载。
- Harmony 宿主必须同时声明 `ohos.permission.INTERNET` 和 `ohos.permission.GET_NETWORK_INFO`：前者允许 HTTP，后者让 ArkWeb 正确报告 `navigator.onLine`。仅有 INTERNET 时可能能登录却一直显示“离线 · 本地已保存”，因为 Web 同步流程在 `navigator.onLine === false` 时直接退出。参见 [OpenHarmony Web FAQ 的网络状态问题](https://github.com/openharmony/docs/blob/master/en/application-dev/faqs/faqs-arkui-web.md#what-should-i-do-if-the-network-status-fails-to-be-detected-on-the-loaded-html-page-api-version-9)。不要靠覆盖 `navigator.onLine` 或删除 Web 离线判断来修复宿主权限缺失。

`scripts/mobile-toolchain.ps1` 优先环境变量、已有 PATH/IDE 注册信息和常见安装目录。可设置 `ANDROID_HOME`、`EOTION_ANDROID_JAVA_HOME`、`DEVECO_STUDIO_HOME`、`HARMONY_SDK_HOME`；不将用户绝对路径提交到工程。找不到要求的 SDK/JDK 时命令会报出准确缺失项。

Windows Android 构建对子进程设置 JDK 官方 `jdk.net.unixdomain.tmpdir`，使用用户 `.gradle/eotion-sockets`，避免本机系统 Temp 的 AF_UNIX socket 连接错误。不改变全局环境或系统网络设置。

## Mobile runtime contract 依赖边界

Mobile 的运行时协议必须直接从 `@eotion/contracts/mobile` 导入。该 leaf entry 只定义 `MOBILE_P1_CHANNEL` 与 Ping/Pong 类型，没有 Zod 或其他运行时依赖，也不回引 contracts 根入口。根 `@eotion/contracts` 继续重导出这些 value/type，保持 Web、API、SDK、Desktop 兼容；subpath 与根入口保持同样的 TS source / Node CommonJS 条件导出方式。

此前 Mobile 从 contracts 根入口读取频道常量，连带执行根模块的 Zod API/Sync schema 初始化。源码的 `z.discriminatedUnion('kind', [...])` 经当前 Lynx 构建链变成 `{type:"union",options:...,discriminator}`，其中 `discriminator` 是未声明自由变量，导致 Android/HarmonyOS 同时报 error 201 和白屏。缺陷已通过隔离实际不需要的 schema 依赖关闭；未修改 Zod、优化选项、bundle 或原生 runtime。具体是哪一个上游转换 pass 产生该自由变量未单独定位，不能据此声称整个 Zod/Lynx 组合已经修复。

回归检查：`pnpm --filter @eotion/contracts test` 构建 CJS 后验证 subpath 不加载根入口/Zod、根入口兼容性、leaf 无依赖，以及 Mobile TS/Vue script 不从根入口导入运行时值；不匹配 minified 符号。

## 产物与签名

当前版本的目标文件在 `apps/mobile-hosts/release/`：

- `Eotion-0.0.1-android.apk`：标准 Android debug 签名，用于测试安装。
- `Eotion-0.0.1-android.aab`：未配置正式 signing 的 release App Bundle，不能直接作为 APK 安装。
- `Eotion-0.0.1-harmony.hap`：用本机 DevEco 自动调试签名产出的 HAP。
- `Eotion-0.0.1-harmony.app`：同一调试签名的 App Pack。

缺少 Harmony signing 时，命令仅生成带 `-unsigned` 的 HAP/App Pack，供编译检查；不能称为真机可安装。真机调试签名需要华为调试证书、设备匹配的 profile 和私钥。[官方自动签名说明](https://developer.huawei.com/consumer/cn/doc/HarmonyOS-Guides/ide-signing-auto)

先运行一次 Harmony 构建生成工程配置，用 DevEco 打开 `apps/mobile-hosts/harmony`，连接设备、登录华为账号并完成自动调试签名。下一次根命令会读取 IDE 写入的 `build-profile.json5`，将选中的签名配置保存到忽略的 `signing.local.json` 并复用。也可用 `EOTION_HARMONY_SIGNING_CONFIG` 指向已有 JSON 签名配置（对象包含 `name/type/material`，材料路径为本机绝对路径）。显式配置必须有效，缺少文件会失败。

`build-profile.json5`、`AppScope/app.json5`、本机 SDK 配置、bundle、图标副本、签名配置、私钥/证书/profile 均为生成或本机文件，不提交。仓库没有正式商店签名密钥；不要将包含密码的生成配置复制到文档或日志。

每个产物旁有 `.json` 元数据：version、buildNumber、Git SHA、URL、bundle SHA256、产物 SHA256、签名状态。签名状态不代表已经真机验收。

## 真机验收

Android：`adb devices -l` 确认 online，然后 `adb install -r apps/mobile-hosts/release/Eotion-<version>-android.apk`，用 `adb shell am start -n space.evanpatchouli.eotion/.MainActivity` 启动。

Harmony：`hdc list targets` 确认目标，用 `hdc install apps/mobile-hosts/release/Eotion-<version>-harmony.hap` 安装已签名包，`hdc shell aa start -a EntryAbility -b space.evanpatchouli.eotion` 启动。

2026-10-04 已关闭共享 bundle blocker：`build:mobile`、Android APK、已调试签名的 Harmony HAP 均构建成功，并在 Android SDK API 36 模拟器、MuMu 与 HarmonyOS 6.1 nova 14 实际安装启动。三个设备均真实显示生产 Eotion 登录页，有截图证据；不以回调或进程存活单独作为通过依据。

- APK/HAP 打入同一个 88,177 字节 bundle（旧包为 187,528 字节），SHA256 `0f98a277417b57bcb5fe5e4fed6b1ea22cba154ea8c87142bc4f9b2a22923664`；归档检查验证包内 bundle 与构建产物一致。
- 解码 background script：`discriminator` 计数为 0，旧包的 Zod discriminated-union 错误文本均消失；production URL、`webview`、`eotionRuntime=mobile-webview` 保留。完整 Rspack Lynx module graph 检查包含 `contracts/src/mobile.ts`，无 contracts 根入口或 Zod 模块。
- Android：`Bundled template read: 88177 bytes`、`Lynx template loaded`、`Lynx first screen`；nova 14：`fetchTemplate bytes: 88177`、`onLoadSuccess`、`onFirstScreen`、`onRuntimeReady`。本次启动均无 `discriminator` / error 201，WebView 白屏消除。
- Android SDK 模拟器输入框可输入，测试用无效凭据收到生产认证接口的 `Invalid credentials` 响应；生产 `/api/health` 返回 `status: ok`。没有现成测试账号/Session，本轮未验收成功登录后 Workspace/Page。nova 14 登录页截图确认后用户继续使用手机，未追加输入/登录操作。
- Android 有非阻塞 error 321（image prefetch helper）与 2298（Devtool 未启用时设置 enable-debug），登录页仍实际显示；这些日志不能描述成“零错误”。本轮不扩展到这些独立宿主能力。

本次截图、启动日志、bundle 解码、完整模块图和构建/回归日志保存在忽略目录 `apps/mobile-hosts/release/runtime-verification/`。该结论仅关闭共享 bundle 运行阻塞，不代表全部 Mobile / P5 真机验收通过。

同日后续验收：用户在 nova 14 登录成功后遇到“离线 · 本地已保存”，MuMu 正常。仓库 manifest 和设备已安装包均仅声明 INTERNET。补上 GET_NETWORK_INFO 后，HAP 构建/调试签名/包内 bundle 检查通过；覆盖安装保留用户登录数据，同一 nova 14 页面从“离线 · 本地已保存”恢复为“已同步”。只改宿主权限，未改 Web 同步语义或 runtime 版本；前后 UI layout 与截图证据保存在上述忽略目录。此前未验收成功登录的记录是 blocker 修复时的范围，不应理解为此后仍无法登录。

同日完整验收轮次的范围后由用户调整为仅 Android，详见 [2026-10-04 Mobile 验收](../verification/device/mobile-real-device-2026-10-04.md)。最新 master APK 在 MuMu Android 12 覆盖安装；Session 强制停止后恢复且持久 Cookie 的 `/api/auth/me` 验证 200，Workspace/Page 与两次完全离线进程重启保留 A/B 通过。网络恢复后未自动同步，点重试后“已同步”，服务端与独立 Web 客户端均读取到 A/B。图片/文件不打开系统选择器；XElement 默认 WebView 没有设置 WebChromeClient/onShowFileChooser。Touch Toolbar 标题实际 H2，与本轮 H1 要求不同。MuMu IME 窗口高度为零，真实 composition 和键盘安全区未验证。仅形成验收文档/证据，未改产品功能，**完整 Android / 双平台 Mobile Acceptance 均不得声明 PASS**。

仍需后续核对：真实中文软键盘和导航/手势区、附件文件选择、自动重连、todo 正文 touch 行为、Touch Toolbar H1 需求差异；HarmonyOS 本轮各项仍待测试，不能把先前成功登录或网络权限修复外推为全部通过。launcher、剪贴板/分享等本轮范围外能力另行验收。构建成功与进程存活都不能代替这些检查。生产 bundle 中不暴露 P1 开发路由，LAN 开发 Web 可继续使用 P1/P3 验证页。
