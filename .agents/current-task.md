# Current Task — P5.1 Product Shell + Auth / Workspace

## 范围

基于 P4 Final Acceptance 封板基线 `2de1cf39d8fdf9b6ae6cc81365b8eec74765e09e`，建立 Web 正式产品入口、会话登录/恢复/退出与 Workspace 创建、切换、重命名。复用现有 API / SDK 和 Web 响应式 Shell。

非目标：P5.2 Page Tree、P5.3 正式编辑器、P5.4 产品 Sync、P5.5 附件，以及成员、邀请、删除或协作能力。

## 结果

**P5.1 PASS，可以进入 P5.2 Page Tree。本任务没有提前实现 P5.2+。**

- 正式 Hash 路由：`/#/login`、`/#/app`、`/#/app/:workspaceId`；未登录保护、登录后恢复 redirect、无效工作区恢复及退出后历史路由保护均已实现。
- 原示例首页保留于开发路由 `/#/__dev/workspace`，P1/P2/P3 开发页继续保留。
- 认证与 Workspace 通过 `@eotion/sdk` 使用现有 API。最近 Workspace ID 按用户隔离并经服务端列表校验；创建和重命名的名称 trim、空值阻止、失败反馈与服务端持久化已覆盖。
- Pages 只显示占位内容。没有实现 Page Tree、正式 Editor、产品 Sync 或附件 UI。

## 验收与验证

- 真实浏览器 + 临时 Mongo/API：Playwright Chromium 从未认证访问开始，实际走通登录、首个 Workspace 创建、F5 恢复 Session/Workspace、第二 Workspace 创建与切换、重命名并刷新、移动尺寸下侧栏切换、logout 撤销服务端 Session、返回受保护路由，以及已有账号自动进入最近 Workspace 和无效 ID 恢复。结果 PASS；视口 1440×900 与 390×844。浏览器日志中的 `/api/auth/me` 401 是预期的未登录检查，`/favicon.ico` 404 是开发服务器缺失静态图标，不影响产品请求；没有应用运行时异常或 Vite overlay。
- `pnpm --filter @eotion/web test:product`：6/6 PASS，覆盖正式路由、登录错误/pending/恢复、Workspace create/switch/rename、用户隔离和退出历史保护。
- P1～P4 回归（在本次手工验收前已通过，本轮未重跑）：API domain 2、HTTP/Sync/File 24、SDK 7、Storage 5、Desktop 4；合计 42 PASS、0 FAIL、0 SKIP。
- `pnpm --filter @eotion/sdk typecheck`：PASS。`pnpm --filter @eotion/sdk build`：PASS。
- `pnpm --filter @eotion/web typecheck`：PASS。
- `pnpm --filter @eotion/web build`：PASS。
- `pnpm --filter @eotion/desktop build`：PASS。
- 根及 Web package 未定义 lint script，本轮没有可运行的 lint 命令。
- 手工流程发现并修复 SDK 默认浏览器 fetch 未绑定全局对象的 `Illegal invocation`；真实浏览器链路随后通过。测试中初始三处是测试 URL / 断言与 UI 行为不一致，调整后产品测试 6/6 通过。

## 文档、限制与收尾

- 已更新 `docs/roadmap.md`，只将 P5.1 标记完成；P5.2～Final Acceptance 保持未开始。
- 已更新产品路由/API 开发代理、首次登录准备和测试入口文档：`docs/p5-product-shell.md`、README、架构/context/test runbook。
- 已执行 `git diff --check`，待提交前最终复核。
- 未执行 push。
- 桌面 renderer build 通过；本轮未在 Electron 原生窗口或实际移动设备完成 Auth/Workspace 登录验收。静态 Web 同源 API 路径实际验收通过，Electron file-origin/远端部署与真机仍按各自部署/设备条件验证。
- 临时 API、Web 服务和无持久卷 Mongo 容器均已关闭。

## Commit

本轮聚焦提交：`feat(p5): establish product shell and workspace flow`。不 push。
