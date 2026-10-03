# Desktop production API connectivity

Desktop dev 和 production 均复用 `apps/web` 与 `@eotion/sdk`，SQLite/preload 不变。

## 配置与启动

- Dev：`pnpm dev:desktop` 的 `/api` 继续走 Vite proxy。`apps/web/.env` 的 `EOTION_API_PROXY_TARGET` 只用于 dev/preview，不是 production 配置。
- Production：`apps/desktop/.env`（参考 `.env.example`）的 `EOTION_DESKTOP_API_ORIGIN` 在 `electron-vite build` 时编入 main，作为默认值。也可在启动进程时设置同名变量覆盖默认值，无需重建。它是 HTTPS origin，例如 `https://app.example.com`，不含 `/api`、路径、凭据、query 或 fragment；不包含 secret。
- `pnpm build:desktop` 后启动 `apps/desktop/out/main/index.js`，不设置 `ELECTRON_RENDERER_URL`。Desktop renderer 的 SDK base 固定为空，始终请求同源 `/api`；Web 的 `VITE_API_BASE_URL` 配置不影响此生产模型。
- 缺少/无效 production origin 时，main 输出诊断并打开 bundled `file://` UI。这只能用于查看本地外壳，不具备生产 API connectivity，不能作为部署成功。

```powershell
$env:EOTION_DESKTOP_API_ORIGIN = 'https://app.example.com'
pnpm build:desktop
Remove-Item Env:ELECTRON_RENDERER_URL -ErrorAction SilentlyContinue
pnpm --filter @eotion/desktop exec electron out/main/index.js
```

该 origin 必须实际提供 HTTPS `/api`，TLS 证书正常受信任。反向代理终止 TLS 时，API 的 `API_ORIGIN` 设置为同一公开 origin，并使用 `NODE_ENV=production`。不更改现有 API Auth 或 Cookie 模型。

## Origin、Cookie 与离线启动

Electron 默认持久 Session 的 HTTPS protocol handler 在配置的 API origin 下从 `out/renderer` 读取 UI 与静态资源；地址栏虽是 HTTPS，页面源码仍是本地 bundle。只有该 origin 的 `/api` 和 `/api/**` 通过同一 Session 的 Chromium `session.fetch` 转交真实 API，绕过自定义 handler，保留请求 method/body。主进程核验 Chromium 提供、网页不可伪造的 `initiatorOrigin`，拒绝异源发起方及缺少可信发起方的写请求；可信同源写请求使用规范 API Origin（Electron main fetch 默认不发送该 header）。冲突 Origin 被拒绝，服务端 SameOriginGuard 继续生效。API redirect 被拒绝，静态路径不回退为远端 HTML；磁盘访问检查路径和 realpath containment。窗口及子 frame 导航继续被阻止。

Renderer 与 API 同源，SDK 的 `credentials: include` 使用 Chromium Cookie jar。HttpOnly、Secure、SameSite=Lax、Path=/api 的 Session Cookie 无须跨站例外；Cookie 内容不经 preload/IPC 暴露。API 原有 SameOriginGuard 和精确 WEB_ORIGIN allowlist 保持不变，本方案不需要新增 CORS 例外或 `Origin: null` 许可。

相比之下，`file://` 的 opaque Origin 到远端 HTTPS 是跨站调用：绝对 `VITE_API_BASE_URL` 只修复 URL，无法建立可靠的 SameSite=Lax Cookie Session。真实 build 对照中，绝对 HTTPS 登录请求可读且返回 201，但随后 `credentials: include` 的 `/auth/me` 返回 401；因此请求能通不代表 Session 成立。专用 IPC HTTP transport 会新增序列化、取消、上传和 Cookie 管理边界；同源 protocol 可以直接保留既有 SDK，无需本地 HTTP server、第二套业务 API 或 Session token bridge。

启动 UI 和静态资源直接读磁盘，不需要 API、DNS 或 Vite。Desktop 不注册 Web 的 Service Worker。API 暂时不可达时，已有可信 cached identity 与 snapshot 按现有 Local-first 规则恢复，SQLite 持续写入正文/oplog；恢复 API 后按既有权限检查、Push→Pull 流程同步。首次登录或未缓存内容仍需要在线 API。

更换 origin 会更换 Cookie/浏览器缓存命名空间；既有 SQLite 内容不自动转换为其他部署/账号的数据。部署时保持 origin 稳定。

## 真实 build 验收

独立脚本 `pnpm --filter @eotion/web test:desktop-production-real` 不启动 Vite；先构建 Desktop/API，再运行 `playwright.desktop-production.config.ts`。测试使用随机隔离 Mongo database、`NODE_ENV=production` API、HTTPS reverse proxy、临时 Electron profiles。TLS fixture 使用 `EOTION_TEST_TLS_PFX`（空口令）或 key/cert 配置；只在测试 Electron 命令行给该证书配置精确 SPKI 例外，生产代码无 TLS bypass。

测试覆盖 bundled renderer 登录、`/auth/me`、Workspace/Page 编辑、SQLite、Session restart、API listener 关闭产生 connection refused、kill/restart 后继续离线编辑、恢复 listener 后 pending Push→Pull、第二个独立客户端读取最终正文。此 API unavailable 模式证明离线启动不依赖 API；不等同于操作系统所有网络接口人工断开。

验收结果在完成本轮实际运行后记录于 P5 文档。开发与存储回归继续使用 `desktop-storage.spec.ts` 和 `desktop-product-sync.spec.ts`。

PowerShell 7 可重复运行示例（Mongo 必须支持事务，测试只删除随机隔离 database）：

```powershell
./scripts/create-desktop-test-tls.ps1
$env:P4_TEST_MONGODB_URI = 'mongodb://127.0.0.1:27018/?replicaSet=eotionP5C&directConnection=true'
pnpm --filter @eotion/web test:desktop-production-real
```

脚本只在临时目录生成三天有效的 localhost PFX，不安装根证书、不修改系统 trust store。测试端口为 API 7147 / HTTPS 7447；不得让其他服务占用。也可提供正常受信任测试证书，此时不设置 SPKI 例外。测试结束自动删除随机数据库和 Electron profiles；外部提供的 TLS 文件由调用者管理。

协议行为参考 Electron 官方 [protocol.handle](https://www.electronjs.org/docs/latest/api/protocol#protocolhandlescheme-handler) 与 [net.fetch](https://www.electronjs.org/docs/latest/api/net#netfetchinput-init)。验收依据是本仓库真实 build 运行结果。
