# P6 MCP

P6 通过 MCP 让外部客户端使用 Eotion 的已有 application/domain 能力，保持 Local-first、Document-first 与同一业务权限入口。本阶段只做 MCP。

| 阶段 | 范围 | 状态 |
| --- | --- | --- |
| P6.1 MCP Foundation + Auth | `/mcp` transport、独立 Token、`eotion_list_workspaces` | PASS |
| P6.2 Read Tools | 有界页面列表、标题搜索、正文读取 | PASS |
| P6.3 Write Tools | 显式写入、权限与重试语义（待定义） | not started |
| P6.4 MCP Acceptance | 最终跨客户端验收（待定义） | not started |

P6.1 不实现 Resources、Prompts、页面读写/删除、Agent/Chat UI、automation 或 Token Settings UI。

## P6.1 接入契约

- API 配置 `MONGODB_URI` 时挂载同进程 `/mcp`；无 Mongo 时保留已有 health-only 模式。
- 官方 `@modelcontextprotocol/server@2.3.1` + `@modelcontextprotocol/node@2.1.1`，`createMcpHandler` / `toNodeHandler`，无状态 Streamable HTTP，兼容 SDK 的旧协议客户端路径。现代协议返回 JSON，SDK 旧协议路径使用标准 SSE，客户端解析后的工具结果相同。Fastify 解析后的 body 传给 SDK；Nest 负责 shutdown。所有协议响应统一 `Cache-Control: no-store, no-transform`。
- Web Cookie Session 与 MCP Token 独立。Token 是 32 字节安全随机 base64url 值，加 `eotion_mcp_` 前缀。Mongo `mcp_credentials` 只保存 `id/userId/name/tokenHash/createdAt/lastUsedAt/revokedAt`，SHA-256 hash 唯一索引且默认不选择。
- 每次请求重新验证 Bearer / 未撤销 / 用户仍存在，更新 last used。撤销是按当前用户和凭证 ID 限定的 application service，不提供本轮范围之外的管理接口；rotation 可通过创建新凭证、撤销旧凭证组合。
- P6.1 工具 `eotion_list_workspaces` 输入严格 `{}`，从可信 `{ userId }` 调用 `WorkspaceService.listByOwner`。`structuredContent` 与文本 JSON 同为 `{ "workspaces": [{ "id": "...", "name": "..." }] }`，无用户/认证资料。
- 所有认证失败统一 HTTP 401 + Bearer challenge。基础服务内部故障 HTTP 500；工具业务失败标准 MCP `isError: true`，只给通用消息。SDK 处理协议和输入错误。

默认仅允许本地 Host / Origin。部署到其他主机时设置 `MCP_ALLOWED_HOSTS`（逗号分隔的 hostname，无 scheme/port）；需要浏览器客户端时可设置 `MCP_ALLOWED_ORIGINS`（同样是 hostname，SDK 按 hostname 校验、忽略端口）。已有 `WEB_ORIGIN` / `API_ORIGIN` 的 hostname 也允许作为 Origin。无 Origin 的原生 MCP Client 仍需通过 Host 和 Bearer 验证。反向代理须保留 `/mcp` 路径和 Authorization header。

P6.1 沿用当前完整 Workspace 列表契约，尚未引入 MCP 专用限流/分页；有界读工具与部署入口的速率策略在后续阶段确定。账号当前没有独立 disabled 状态，认证按现有用户存在性判断；以后新增账号状态应复用其统一可用性规则。

## 本地开发与 Codex

先按 [Testing Runbook](runbooks/testing.md) 准备 Mongo，设置 `MONGODB_URI` 并运行 `pnpm dev:api`。默认 MCP URL 为 `http://127.0.0.1:7137/mcp`。

使用现有 Eotion 账号登录后创建 Token（PowerShell 7）：

```powershell
$api = 'http://127.0.0.1:7137'
# 不在脚本或 shell history 写入密码明文
$login = Get-Credential -Message 'Eotion email / password'
$body = @{ email = $login.UserName; password = $login.GetNetworkCredential().Password } | ConvertTo-Json
Invoke-RestMethod "$api/api/auth/login" -Method Post -ContentType 'application/json' -Body $body -SessionVariable session | Out-Null
$credential = Invoke-RestMethod "$api/api/mcp/tokens" -Method Post -WebSession $session -ContentType 'application/json' -Body '{"name":"Codex local"}'
$env:EOTION_MCP_TOKEN = $credential.token
Remove-Variable credential, body, login
```

创建端点只接受 `name`（trim 后 1–64 字符），不接受 `userId`；仅首次响应给明文 Token，响应禁用缓存。请安全保管；丢失时重新创建。

在 `~/.codex/config.toml` 添加以下配置，Token 留在进程环境中，不写入仓库：

```toml
[mcp_servers.eotion]
url = "http://127.0.0.1:7137/mcp"
bearer_token_env_var = "EOTION_MCP_TOKEN"
enabled_tools = ["eotion_list_workspaces", "eotion_list_pages", "eotion_search_pages", "eotion_get_page"]
startup_timeout_sec = 20
```

从设置该环境变量的 PowerShell 启动 `codex`。`codex mcp list` 检查配置，TUI `/mcp` 检查连接与四个只读工具，然后请求“找到包含 P6.2 MCP Acceptance 的页面，读取它，并告诉我正文内容”。列表只包含当前 Token 用户的工作区。桌面 Codex 同样必须继承 Token 环境；更改环境后重新启动客户端。这里使用预置 Bearer Token，不走 OAuth login。

配置格式依据 [官方 Codex MCP 文档](https://learn.chatgpt.com/docs/extend/mcp?surface=cli)。Transport 依据 [官方 SDK HTTP](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/serving/http.md) 和 [Fastify 集成](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/serving/fastify.md)，核实于 2026-10-06。

## 验证

```powershell
pnpm --filter @eotion/api typecheck
pnpm --filter @eotion/api test:domain
pnpm --filter @eotion/api test:http
pnpm --filter @eotion/api test:mcp
pnpm build:api
```

测试使用真实 Mongo 随机隔离数据库、Nest/Fastify TCP HTTP 与官方 SDK Client，不使用生产数据。`P4_TEST_MONGODB_URI` 可覆盖测试地址；HTTP sync 回归需要 replica set。仓库未配置 lint 命令，不能报告 lint PASS。

2026-10-06 验收：P6.1 **PASS**。全仓 `pnpm typecheck`、API `typecheck` / `build:api` 通过；MCP integration 1/1、domain 2/2、HTTP/Sync/File 26/26 通过。独立 review 及旧协议缓存边界定向复核均无 blocker；`git diff --check` 通过。lint N/A（无命令）。本机原 Mongo/Docker 不可用，本次使用临时隔离 MongoDB 8.0.12 replica set，所有测试数据库均清理，没有修改仓库 Mongo 依赖或生产数据。

实际启动 `apps/api/dist/main.js`（独立测试库与端口 7149），使用 Codex CLI 0.156.1 的 Streamable HTTP/Bearer 配置完成连接、工具发现和 `eotion_list_workspaces {}` 调用。工具返回 `p61-codex-workspace / P6.1 Codex acceptance`，CLI 退出码 0；明文 Token 只传给子进程环境，未写入仓库或 Codex 配置，验收账号/Token/数据库随后删除。此结果仅证明 P6.1 唯一工具连通，不代表 P6.4 完成。

## P6.2 Read Tools

只新增以下三个只读工具，保留 `eotion_list_workspaces`；无写工具、Resources 或 Prompts。

| 工具 | 输入 | 结果与范围 |
| --- | --- | --- |
| `eotion_list_pages` | `workspaceId`，可选 `cursor`、`limit` | `{ items: McpPageSummary[], nextCursor }`；默认 50、最大 100 |
| `eotion_search_pages` | `workspaceId`、`query`，可选 `cursor`、`limit` | 同列表结果；默认 20、最大 100；标题的大小写不敏感 literal 子串搜索 |
| `eotion_get_page` | `pageId` | `McpPageSummary` 的字段加 `blocks: McpBlock[]`，无游标 |

参数为严格 schema；ID/cursor trim 后 1–128 字符，query trim 后 1–200 字符，limit 必须为 1–100 整数，超限拒绝。list/search 使用按 page ID 升序的 keyset cursor（末项 ID），repository 最多读取 limit + 1 条；没有更多结果时 nextCursor 为 null。遍历期间新增/删除页面不构成快照。搜索转义正则特殊字符，只搜索标题，不做正文索引或语义搜索；大工作区的标题检索仍需扫描候选记录，未引入新搜索设施。

### 稳定读取契约与权限

MCP adapter 只调用 `PageService` / `BlockService`；服务内部继续复用 `WorkspacePermissionService.assertCanRead`（当前 owner-only），仓库层负责有界查询。get 在 application 层从 pageId 定位所属 workspace 后检查权限；不存在与无权限均返回 `Unable to get page.`，不暴露页面存在性、用户身份或底层错误。

Page summary 明确包含 `id/workspaceId/title/parentPageId/updatedAt`，不透传 Mongo document。Block 包含稳定 `id/type/text`，顺序复用服务端 `orderKey/id` 排序，DTO 不暴露 orderKey。当前类型为 paragraph、heading、bulleted-list、numbered-list、todo、quote、code、divider、image、file。heading 保留 level，todo 保留 checked，code 可保留 language，numbered-list 可保留 start；图片/文件保留 fileId/name/mimeType/size，不返回临时 URL 或二进制内容。列表项与嵌套列表转换为带分界、缩进和编号的文本；quote 与 hardBreak 保留可读结构。行内格式不返回 editor AST。

只支持当前 P5 可编辑的顶层 Block 及其正文结构。未知/畸形节点、业务嵌套 parentBlockId 等不支持内容安全失败，不透传 `props/node/attrs/marks`，不返回 sync/oplog、持久化字段或认证资料。

### 大小边界

get 最多读取 1000 个 Block（仓库最多取 1001 个用于探测超限），单 Block 文本最多 100000 字符、节点深度最多 32、单页最多 10000 个正文节点。list/search/get 的结果 DTO 序列化为 UTF-8 JSON 后最多 1 MiB；MCP 为兼容客户端同时返回 structuredContent 和文本 JSON，因此协议响应含两份 DTO，另有转义与协议封装开销，1 MiB 不是完整 HTTP body 上限。超限通用失败，不截断正文，不改变已有 HTTP/P5 读取行为，也不引入分块协议。

### P6.2 验收

2026-10-06：P6.2 **PASS**。全仓 `pnpm typecheck`、API typecheck/build 通过；`test:mcp` 6/6（真实 Mongo + Nest/Fastify `/mcp` integration 1/1、Block contract 5/5），domain 2/2、HTTP/Sync/File 26/26 通过。transport 测试覆盖两用户/多个 Workspace、分页不重漏、标题 literal 搜索、非法参数、页面稳定 ID/顺序、私密字段隔离、缺失/越权同错误与底层服务故障。独立 review 未发现代码 blocker；修正其指出的过期阶段说明后，`git diff --check` 通过。lint N/A（无命令）。

真实启动构建后的 API（端口 7149、随机隔离数据库），通过现有 HTTP API 创建临时用户、`p62-codex-workspace` 和 `P6.2 MCP Acceptance` 页面。Codex CLI 0.156.1 使用独立 Bearer 环境变量，实际依次调用 `eotion_list_workspaces` → `eotion_list_pages` → `eotion_search_pages` → `eotion_get_page`，读出 `p62-block-one` / `p62-block-two` 及正文 `Eotion MCP read tools are working.` / `Second block for stable block verification.`。四次工具调用成功，CLI exit 0；未通过 shell/file 读取验收正文。Token 未写入仓库或 Codex 配置。临时用户、Workspace、Page/Block、Token 随隔离数据库删除；清理检查剩余 Eotion 测试数据库为 0，临时 API 与 MongoDB 8.0.12 replica set 已停止。

当前约束：标题搜索仍扫描候选记录，分页不是快照；超大页面与非 P5 支持的 Block 安全拒绝；行内富文本格式不保留。P6.3 Write Tools 与 P6.4 MCP Acceptance 均 **not started**。
