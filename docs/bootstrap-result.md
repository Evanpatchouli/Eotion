# Bootstrap 验证结果

验证日期：2026-09-24

运行环境：Windows，Node.js 26.3.0，pnpm 10.33.2（与 `packageManager` 一致）

## 验证结果

| 命令 | 结果 |
| --- | --- |
| `pnpm install` | 成功，生成并更新了 `pnpm-lock.yaml`。 |
| `pnpm dev:web` | 成功，Vite 在 `http://localhost:5173` 启动；浏览器显示 Eotion 主 UI。 |
| `pnpm dev:desktop` | 成功，Electron Vite 编译 main/preload 并启动 renderer；`http://localhost:5173` 显示与 Web 相同的 Eotion UI。`pnpm build:desktop` 也成功，产物写入 `apps/desktop/out/renderer`。 |
| `pnpm dev:api` | 成功；watch 编译 0 错误。`GET http://localhost:3000/api/health` 返回 HTTP 200、`status: ok`，MongoDB 为 `disabled`。 |
| `pnpm dev:mobile` | 成功；Rspeedy 生成 Lynx 与 Web 开发 bundle，并输出 Lynx Explorer 二维码。 |
| `pnpm build:mobile` | 成功；生成 `apps/mobile/dist/main.lynx.bundle` 和 `main.web.bundle`。两个 bundle 都包含 `<webview>` 及其 `EOTION_WEB_URL`。 |

Electron 的 renderer 根目录和 HTML 入口都指向 `apps/web`，仓库没有第二份桌面产品 UI。移动端继续由 Vue Lynx 壳加载同一 Web App。

## 必要兼容修复

- TypeScript 6 要求 API 显式设置 `rootDir`，并不再接受无用途的 `baseUrl`；API 配置已相应调整。
- electron-vite 需要显式 renderer 输入；配置现在把 `apps/web/index.html` 作为入口。桌面包安装时也会执行 Electron 提供的安装脚本，以准备平台二进制。
- Vue Lynx 0.5.1 依赖 Rsbuild 1；移动端固定到兼容的 Rspeedy/Rsbuild 1.x 组合，并启用 Rspack layers 后开发和生产构建均通过。

pnpm 仍会报告 peer 警告（electron-vite 5 与 Vite 8、Vue Lynx CSS/template 插件、Rspeedy 0.9 与 TypeScript 6）。本次要求的启动和构建命令均通过。pnpm 自身另报告它的内嵌 Node 20.11.1 不符合仓库 engines；`node --version`、`pnpm exec node --version` 和 API 运行时均为 Node 26.3.0。

## Lynx Explorer 与 HarmonyOS 限制

本机未检测到 Lynx Explorer、DevEco Studio、`hdc`/`hvigorw`/`ohpm`，也没有 Android AVD 或已连接设备。因此已验证 Lynx bundle 包含 `<webview>`、bundle 生成和二维码输出，但未能在 Lynx Explorer 或 HarmonyOS 原生宿主中打开该 bundle。本次独立开发运行输出的 URL 为 `http://198.18.0.1:3000/main.lynx.bundle?fullscreen=true`；设备侧可达性需在有设备的网络环境中确认。

在有 HarmonyOS 工具链的机器上：

1. 安装 DevEco Studio 和 HarmonyOS SDK，并启动 HarmonyOS 模拟器或连接设备。
2. 按 [Lynx Explorer 快速开始](https://lynxjs.org/guide/start/quick-start.html) 安装 Harmony 模拟器 HAP；官方文档说明预构建 HAP 面向模拟器，真机需要从源码构建 Explorer。通过 `hdc install lynx_explorer-default-unsigned.hap` 安装。
3. 在 Eotion 仓库运行 `pnpm dev:mobile`，在 Explorer 中扫描二维码；模拟器也可粘贴终端输出的 bundle URL。
4. 将 `apps/mobile/src/config.ts` 的 `EOTION_WEB_URL` 改为开发机可从设备访问的局域网地址（不能使用设备自身的 `127.0.0.1`），并运行 `pnpm dev:web`。

完整 HarmonyOS 宿主集成需按 [Lynx Existing App 集成指南](https://lynxjs.org/guide/start/integrate-with-existing-apps.html) 在 ArkTS/HAP 工程中加入 Lynx 运行时并加载 bundle；该宿主工程不属于当前 v0.1 scaffold。
