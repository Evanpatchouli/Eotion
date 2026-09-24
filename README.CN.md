# Eotion

Eotion 是一个 **Web 优先、受 Notion 启发的​​工作区**。本仓库刻意只是一个精简的 v0.1 基础：一个 Vue 3 产品 UI，在桌面端由 Electron 复用，在移动端由 Vue Lynx 外壳嵌入，并配有 NestJS/Fastify 后端。

## 技术基线

- Web：Vue 3 + Vite + Vue Router + Pinia
- 桌面端：Electron + electron-vite，渲染器复用 `apps/web`
- 移动端：Vue Lynx + Lynx `<webview>`；目标平台为 HarmonyOS、Android 和 iOS
- API：NestJS + Fastify
- Agent 集成：MCP 服务计划在认证和核心工作区/页面 API 就位后作为 API 适配器实现
- 服务器数据库：MongoDB
- 未来基础设施：Redis + Kafka
- 对象存储：阿里云 OSS
- 本地数据：Web 上使用 IndexedDB；桌面端/移动端之后使用 SQLite/原生适配器
- 工作区：pnpm monorepo
- 语言：TypeScript

## 要求

- Node.js >= 22.12（Node 24/25/26 适用）
- pnpm 10.x
- 之后进行原生 Lynx 打包时：相应的 Android/iOS/HarmonyOS 工具链。当前可以先用 Lynx Explorer 进行开发。

## 安装

```bash
pnpm install
```

仓库在 `package.json` 中固定了 pnpm 10，并提交了 `pnpm-lock.yaml`。运行 `pnpm install` 以恢复工作区依赖。

已验证的命令以及仍需要设备/工具链的原生平台设置，见 [`docs/bootstrap-result.md`](docs/bootstrap-result.md)。

## 运行

### Web

```bash
pnpm dev:web
```

打开 `http://localhost:5173`。

### Electron 桌面端

```bash
pnpm dev:desktop
```

桌面应用将 `apps/web` 编译为其渲染器。这里刻意没有重复的桌面 Vue 应用。

### API

```bash
cd apps/api
cp .env.example .env
cd ../..
pnpm dev:api
```

`MONGODB_URI` 在首次冒烟运行中可以保持为空。API 将在没有 MongoDB 的情况下启动，并将其报告为已禁用。当配置了 URI 时，Nest 会初始化 Mongoose。

健康检查端点：

```text
GET http://localhost:3000/api/health
```

### 移动端外壳

移动端构建默认检测开发机器的局域网 IPv4 地址，并使用 `5173` 端口。需要覆盖地址时，在 `apps/mobile/.env` 中设置 `EOTION_WEB_URL`（见 `apps/mobile/.env.example`）。Web 开发服务器已监听 `0.0.0.0:5173`。

先在一个终端运行 Web 开发服务器：

```bash
pnpm dev:web
```

再在另一个终端运行 Lynx 开发服务器，并使用 Lynx Explorer 扫描/打开生成的 bundle：

```bash
pnpm dev:mobile
```

修改 `apps/mobile/.env` 后需重启 `pnpm dev:mobile`，新地址才会编译进 bundle。

移动端 P1 能力演示可通过开发模式下的侧边栏入口进入，也可直接打开 `http://localhost:5173/#/__dev/mobile-p1`。操作见 [`docs/p1-mobile-demo.md`](docs/p1-mobile-demo.md)。

## 仓库结构

```text
apps/
  web/        primary Vue 3 UI (Desktop/Tablet/Mobile modes)
  desktop/    Electron main + preload; reuses apps/web renderer
  mobile/     Vue Lynx shell + Lynx webview
  api/        NestJS + Fastify modular monolith
packages/
  domain/     framework-neutral document/page/block models
  contracts/  shared API/event contracts
  sdk/        minimal typed API client foundation
docs/
  architecture/
    architecture.md
    agent-integration.md
  roadmap.md
```

## 有意尚未实现的内容

这是一个运行优先的脚手架，而不是 Notion 克隆本身。Tiptap/ProseMirror、Yjs、MongoDB schema、认证、MCP 服务、SQLite、IndexedDB、OSS 上传、Redis 和 Kafka 都留待所有平台外壳验证通过后分阶段实现。MCP 服务将通过 API 暴露权限范围受限的工作区能力；目前尚未实现。

引导之后第一个高风险概念验证是：

1. HarmonyOS 6 上的 Vue Lynx。
2. Lynx `<webview>` 加载 Eotion Web。
3. 在该 WebView 内 Tiptap 编辑器中的中文输入法 + 软键盘 + 选区。
4. 后台/前台恢复和本地持久化。

见 `docs/roadmap.md`。
