# Current Task — Desktop Dev API Proxy

## Scope

修复 Electron dev renderer 的 `/api` 请求返回 HTML 问题。仅涉及 `apps/desktop/electron.vite.config.ts`、`docs/p5-product-shell.md` 和本文件。Electron renderer 继续复用 `apps/web`；生产 `file://` 部署边界不在本任务修复范围。

## Work Units

1. S1 execute：在 electron-vite 配置中从 `apps/web` 加载 mode 环境，并为 renderer 增加与 Web 一致的 `/api` dev proxy。
2. S1 execute：更新 P5.1 文档，说明 Desktop dev proxy、环境变量位置和无需额外启动 Web dev server。
3. S0 verify：运行 Desktop typecheck/build、真实 Electron dev 登录/Workspace/Page 与 Web dev smoke，调查 built Electron 的 API base。
4. Review：复核限定文件 diff 和配置行为。

## Progress

- 已完成 S1 实现与文档更新。
- Desktop typecheck、build 均通过。
- `pnpm dev:desktop` 的 renderer 为 `http://localhost:5173`；实际配置 `/api` target 为 `http://127.0.0.1:7137`，`changeOrigin: false`；环境变量覆盖到自定义端口的配置检查通过。
- 使用运行中的 `pnpm dev:api`（7137）与独立 Electron profile：未登录 `/api/auth/me` 返回 401 JSON；UI 登录成功，认证后的 me 返回 200；Workspace/Page 创建、正文服务端同步和刷新恢复通过。
- Web dev（7173）UI 登录、同一 Workspace/Page 读取通过。首次 smoke 的 Web 页面等待未通过；改用 Desktop 刷新后的最终路由并放宽真实服务等待时间后，完整真实链路通过。
- 临时测试账号、Session、Workspace、Page、Block、receipt 与独立 Electron profile 已清理。
- Built renderer 的 API base 为 `""`；无 `ELECTRON_RENDERER_URL` 的真实 `loadFile` 运行中，`/api/auth/me` 解析成 `file:///E:/api/auth/me` 并报 `Failed to fetch`。仅调查并写入文档，未修生产架构。
- 独立 Review 未发现行为 blocker；最终验证记录已同步。本任务完成，提交主题为 `fix(desktop): proxy api requests in dev`。
