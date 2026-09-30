# P4.3 Typed HTTP API / Eotion SDK

P4.3 把现有 application services 暴露为 `/api` 下的 HTTP 路由。客户端通过 `@eotion/sdk` 使用同一套 `@eotion/contracts` 请求与响应类型；请求体由 contracts 的运行时 schema 严格校验。HTTP Controller 不访问 Repository。

## 路由

| 方法 | 路径 | 行为 |
| --- | --- | --- |
| POST | `/api/auth/register` | 用 email/password 注册，返回不含密码摘要的用户。 |
| POST | `/api/auth/login` | 登录并设置 Session Cookie，返回用户和到期时间。 |
| GET | `/api/auth/me` | 从有效 Session 恢复当前用户。 |
| POST | `/api/auth/logout` | 撤销当前 Session 并清除 Cookie。 |
| GET / POST | `/api/workspaces` | 列出当前用户的工作区 / 创建工作区。 |
| GET / PATCH | `/api/workspaces/:workspaceId` | 读取 / 重命名工作区。 |
| GET / POST | `/api/workspaces/:workspaceId/pages` | 列出 / 创建页面。 |
| GET / PATCH | `/api/workspaces/:workspaceId/pages/:pageId` | 读取 / 更新页面。 |
| GET / POST | `/api/workspaces/:workspaceId/pages/:pageId/blocks` | 列出 / 创建区块。 |
| GET / PATCH | `/api/workspaces/:workspaceId/pages/:pageId/blocks/:blockId` | 读取 / 更新区块。 |

Page 更新仅支持 `title`、`icon`、`orderKey`；Block 更新仅支持 `type`、`orderKey`、`props`。Page/Block 的父级只在创建时指定；移动、删除和真实 sync 留待后续工作。Block 创建的 `pageId` 取路径，不由请求体提供。客户端生成稳定的资源 `id`。

## 身份、权限与 Cookie

登录继续使用 P4.2 的 32 字节 opaque Session token。服务端只持久化 token 的 SHA-256 摘要；HTTP 响应 JSON 不包含原始 token、`tokenHash` 或 `passwordHash`。浏览器用 `credentials: 'include'` 发送 Cookie；受保护路由从有效 Session 解析用户 ID，任何请求体提交的 `userId` 或 `ownerId` 都不作为身份。

工作区仍是 owner-only：未认证返回 401，访问不存在或不属于当前用户的工作区返回 404。Page/Block 通过 workspace 范围内的 application service 查询，不按裸资源 ID 越过工作区边界。

Cookie 使用 `HttpOnly`、`SameSite=Lax`、`Path=/api` 和与 Session 到期时间一致的有效期；生产环境启用 `Secure`，因此生产 API 应通过 HTTPS 访问。Web 和 API 应部署在同站点，跨 origin 开发时通过 `WEB_ORIGIN` 配置允许的 Web origin。带 Origin 的写请求必须来自 API 自身或允许的 Web origin。HTTPS 反向代理若改写了 Host，需设置 `API_ORIGIN` 为公开 API origin；服务端不会信任未经校验的 forwarded header 作为授权来源。

## 包与边界

- `@eotion/contracts` 提供请求/响应 DTO 和严格的运行时请求 schema。请求体多余字段会得到 400，包括试图覆盖归属字段的输入。
- `@eotion/sdk` 提供 `auth`、`workspaces`、`pages`、`blocks` 类型化客户端，统一抛出包含 HTTP 状态的 API 错误，使用浏览器 `fetch`，不依赖 Node runtime。
- `MONGODB_URI` 为空时不注册业务 Controller；`/api/health` 仍可独立启动。
- 本阶段没有文件上传、对象存储接入、oplog operation ID、同步幂等、revision、RBAC 或 MCP。

SDK 使用 `new EotionApiClient({ baseUrl })` 创建客户端，`auth` 提供 `register/login/me/logout`，资源客户端提供 `list/create/get/update`。所有请求默认使用 `credentials: 'include'`；非 2xx 响应抛出 `ApiError`，其中 `statusCode` 以实际 HTTP 响应状态为准，可用于区分 401、403、404 和 400；响应体中的状态码不能覆盖 HTTP 身份/权限边界，消息与详情仍来自合法响应体。

P4.4 在该基线上新增 authenticated `POST /api/sync/operations`、SDK `sync.send` 与 `EotionOperationTransport`，供 `reconnectPending` 发送真实 oplog；canonical operation、receipt 与删除语义见 [P4.4 Sync](p4-sync.md)。上文路由表及“本阶段”范围仍描述 P4.3 当时的交付，不包含 P4.4 新入口。

P5.2 在相同基线上新增页面移动与删除入口：

| 方法 | 路径 | 行为 |
| --- | --- | --- |
| PATCH | `/api/workspaces/:workspaceId/pages/:pageId/move` | 用 `{ parentPageId: string \| null, orderKey: string }` 重挂页面。 |
| DELETE | `/api/workspaces/:workspaceId/pages/:pageId` | 删除无子页面的页面及其区块，返回 `{ deleted: true }`。 |

`PageMoveRequestSchema` 是 strict schema：提交 `workspaceId`、`id`、`title` 等额外字段会得到 400。服务端在同一工作区内校验目标父级，拒绝把页面移动到自己或自己的后代（400），跨工作区父级和不存在的父级同样 400，页面不存在或不属于当前用户返回 404。`PATCH /pages/:pageId` 仍拒绝 `parentPageId`，移动只能走 `/move`。删除按叶子语义：有子页面时返回 400 `Delete child pages first`，不做级联删除也不提升子页面的父级。SDK 对应 `pages.move(workspaceId, pageId, input)` 与 `pages.delete(workspaceId, pageId)`。页面树产品链路见 [P5.2 Page Tree](p5-page-tree.md)。

P5.3 新增 `DELETE /api/workspaces/:workspaceId/pages/:pageId/blocks/:blockId` 与 SDK `blocks.delete(workspaceId, pageId, blockId)`。HTTP 删除严格限定 Session、owner 和页面范围；目标缺失或属于另一页面返回 404，有子 Block 返回 400，成功返回 `{ deleted: true }`。Sync 的 `block.delete` 仍保持缺失目标幂等成功语义。正式编辑器链路见 [P5.3 Real Page Editor](p5-real-page-editor.md)。
