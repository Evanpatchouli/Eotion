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

`scripts/mobile-toolchain.ps1` 优先环境变量、已有 PATH/IDE 注册信息和常见安装目录。可设置 `ANDROID_HOME`、`EOTION_ANDROID_JAVA_HOME`、`DEVECO_STUDIO_HOME`、`HARMONY_SDK_HOME`；不将用户绝对路径提交到工程。找不到要求的 SDK/JDK 时命令会报出准确缺失项。

Windows Android 构建对子进程设置 JDK 官方 `jdk.net.unixdomain.tmpdir`，使用用户 `.gradle/eotion-sockets`，避免本机系统 Temp 的 AF_UNIX socket 连接错误。不改变全局环境或系统网络设置。

## 已知阻塞：共享 Lynx bundle 运行时缺陷

`pnpm build:mobile` 产出的 `main.lynx.bundle` 在宿主中执行到模块初始化时抛出：

```text
loadCard failed ReferenceError: discriminator is not defined
```

Android（logcat `EotionHost: Lynx error 201`）与 HarmonyOS（hilog `Lynx onReceivedError: 201`）报错与错误栈完全一致，bundle SHA256 也相同。解码 bundle 后可见 `background-thread-script` 顶层存在自由变量 `discriminator`（`new uf(rM({type:"union",options:rH,discriminator},...))`，来自 zod discriminated-union 代码路径），而该标识符在 bundle 中没有任何声明。`packages/contracts` 源码用的是字符串字面量 `z.discriminatedUnion('kind', [...])`，因此这是移动端 Lynx（Rsbuild/Rsbuild 层）打包产物的问题，不是宿主问题。

后果：两个宿主都能构建、安装、启动并加载本地 bundle（Android `Bundled template read: 187528 bytes`；Harmony `fetchTemplate bytes: 187528` 且 `Lynx onFirstScreen`/`onLoadSuccess` 触发），但 Lynx 首屏后无法继续渲染，WebView 呈现白屏。修复需要单独处理移动 bundle 的 zod/打包链路（例如让 `@eotion/contracts` 的运行时常量不再把 zod 带入 bundle），不属于本轮宿主任务。

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

本轮已在 Android 模拟器与 HarmonyOS 6.1 真机（nova 14，hdc 3.2.0f）实际安装并启动：包可安装、进程常驻、本地 bundle 被读取、Lynx `onFirstScreen`/`onLoadSuccess` 触发。**首屏之后的 WebView 内容被上面的共享 bundle 缺陷阻塞**，因此当前截图是白屏，不能标记为移动端验收通过。

仍未由自动化或本轮人工确认、需要后续真机核对的项目：launcher 名称/图标显示、登录与网络请求、登录持久化、页面/编辑器交互、键盘和旋转、安全区、附件文件选择、后台切换与重启、断网恢复，以及 Lynx `<webview>` 的文件/剪贴板/分享与原生生命周期能力。构建成功与进程存活都不能代替这些检查。生产 bundle 中不暴露 P1 开发路由，LAN 开发 Web 可继续使用 P1/P3 验证页。
