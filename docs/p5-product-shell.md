# P5.1 Product Shell + Auth / Workspace

## 产品入口与范围

Web 继续使用 Hash Router，适用于浏览器、Electron renderer 和 Mobile WebView 的同一份 Web App：

- `/#/login`：使用已有账号的邮箱和密码登录。
- `/#/register`：使用邮箱和密码创建账号；注册成功后回到登录页，邮箱自动填入，用户手动输入密码登录。
- `/#/app`：恢复会话后进入最近使用且仍可访问的工作区；没有可用记录时进入列表第一项；列表为空时创建第一个工作区。
- `/#/app/:workspaceId`：工作区产品 Shell，可创建、切换及重命名工作区。刷新保留当前路由。
- `/#/app/:workspaceId/page/:pageId`：P5.2 起打开该工作区中的一个页面，详情见 [P5.2 Page Tree](p5-page-tree.md)。
- `/#/__dev/workspace`：原示例首页。原有 `mobile-p1`、`editor-p2`、`storage-p3` 开发路由不变，仍只在开发构建中注册。

产品侧栏的 Pages 区域在 P5.2 中已由真实页面树替换占位提示。P5.3 正式编辑器、P5.4 正式同步和 P5.5 附件 UI 尚未实现。

## 启动与账号

1. 按 [API 开发说明](../README.md#api) 配置 MongoDB 并启动 `pnpm dev:api`。未配置 Mongo 时只有 health 接口，不能使用产品认证/工作区。
2. 启动 `pnpm dev:web`，打开 `http://localhost:7173/#/register` 创建账号，或打开 `http://localhost:7173/#/app` 使用已有账号登录。
3. 注册使用现有 `POST /api/auth/register` 接口，不会自动建立 Session；成功后在登录页手动输入密码登录。不要将真实密码写入源码、日志或提交记录。

Web SDK 默认请求同源 `/api`；Vite 开发服务器将其代理到 `http://127.0.0.1:7137`。API 使用其他端口时，在启动 Web 前设置 `EOTION_API_PROXY_TARGET`。代理不放宽现有 Origin 校验；跨 origin 调用时需在 API 的 `WEB_ORIGIN` 配置实际 Web origin，或设置公开 `API_ORIGIN`。需要直连远端 API 时使用 Web 的 `VITE_API_BASE_URL`（不包含 `/api` 后缀），并遵守 [P4 Cookie/CORS 约束](p4-http-api.md)。生产 Web 应在 HTTPS 同站点部署并反向代理 `/api`，Vite dev proxy 不包含在静态产物中。

Electron 继续复用同一套产品源码。打包后的 `file://` renderer 直连远端 Cookie Session 的 origin/部署方案不属于此次 Web 验收，不能将 Web 的同源验证等同于该路径已通过。Mobile WebView 使用稳定的同站点 Web URL。

## 状态与行为

- 认证、Workspace 列表/请求状态和 Shell 局部 UI 分开维护；当前 Workspace 由路由 ID 与已授权列表派生。
- HttpOnly Session Cookie 由 SDK 自动携带；客户端不持久化原始 token。恢复 Session 完成前显示恢复状态，不先闪现登录表单。恢复请求网络或服务错误显示重试，401 才视为未认证。
- 登录后进入原受保护产品地址（若提供合法内部地址）或 `/app`；已登录访问 `/login` 或 `/register` 进入产品区域。
- 退出调用现有 API 撤销 Session；成功后清理本地用户及工作区缓存并回到登录页。退出请求失败时显示错误并允许重试，不宣称服务器 Session 已撤销。
- 最近 Workspace ID 按用户保存在本地偏好中，每次使用前检查可访问列表；存储不可用时退回首个工作区。它不是认证凭据或权限依据。
- 无效或不可访问的 Workspace 显示明确不可用状态，可返回工作区入口或切换其他工作区。
- 创建/重命名使用原 SDK 和契约。名称 trim 后不能为空，提交中禁重复操作；失败显示可见错误，成功使用服务端返回值立即更新，刷新后从服务端恢复。

## 验证入口

- 产品浏览器行为：`pnpm --filter @eotion/web test:product`（`tests/product-flow.spec.ts` 与 `tests/product-pages.spec.ts`）。
- 开发页布局、Safe Area、缩放、LocalStore 回归：Web 现有 Playwright 测试；Electron 存储测试前先构建 desktop。
- API、SDK、Sync transaction/receipt、File 回归按 [Testing Runbook](runbooks/testing.md)。

产品行为测试用受控 HTTP 响应覆盖 pending/error/empty/session 边界；真实 API + Mongo 浏览器链路的实际验收结果记录在 `.agents/current-task.md`。
