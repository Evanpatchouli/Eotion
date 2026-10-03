# Current Task — Mobile Native Hosts

目标：共享 apps/mobile Vue Lynx shell；Android Kotlin/Gradle 与 HarmonyOS ArkTS/Stage/Hvigor 宿主加载本地 bundle，不复制 Web UI。

## Work Units
1. S0 investigate / scout：本机工具链/设备与官方 Harmony API。
2. S2 decide / main：最小宿主、共享版本/URL/图标流程与签名边界。
3. S1 execute：独立平台宿主、根构建编排与文档。
4. S0 verify：实际 bundle/APK/AAB/HAP/App Pack 构建、签名与真机安装启动。
5. Review：复核 diff 与文档一致性。

## Final Evidence
- Android：`pnpm mobile:android:apk`、`pnpm mobile:android:aab` 实际成功；`Eotion-0.0.1-android.apk` 为 debug 签名，`Eotion-0.0.1-android.aab` 为未配置正式 signing 的 release bundle。
- HarmonyOS：`pnpm mobile:harmony:hap`、`pnpm mobile:harmony:app` 实际成功，DevEco 自动调试签名生效；`Eotion-0.0.1-harmony.hap` / `.app` 经官方 hap-sign-tool `verify-app` 通过，并在 nova 14（HarmonyOS 6.1）真机安装、启动、进程常驻。
- 两个宿主都从打包进产物的本地 bundle 加载：Android `Bundled template read: 187528 bytes`；Harmony `fetchTemplate bytes: 187528` 加 `Lynx onFirstScreen` / `onLoadSuccess`。
- 本轮修复的 Harmony 集成点：4.1.0 的 `@lynx/gfx` HAR 缺 `liblynxgfx.so`（改用 4.0.3）；`module.json5` 缺 `pages` profile；`fetchSSRData` 抽象成员未实现。
- 已知阻塞：共享 `main.lynx.bundle` 运行时报 `ReferenceError: discriminator is not defined`，Android 与 HarmonyOS 报错一致，首屏 WebView 白屏；属移动 bundle 打包缺陷，详见 runbook。

## Invariants
- 根 package.json version/eotion.buildNumber 是唯一版本来源。
- 命令自动重建/复制 apps/mobile/dist/main.lynx.bundle。
- 原生发行默认 production HTTPS；开发保留 EOTION_WEB_URL。
- 不提交签名私钥/证书/profile；编译成功不代表真机通过。
