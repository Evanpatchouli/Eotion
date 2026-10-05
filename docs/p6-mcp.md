# P6 MCP

P6 通过 MCP 让外部客户端使用 Eotion 的已有 application/domain 能力，保持 Local-first、Document-first 与同一业务权限入口。本阶段只做 MCP。

| 阶段 | 范围 | 状态 |
| --- | --- | --- |
| P6.1 MCP Foundation + Auth | `/mcp` transport、独立 Token、`eotion_list_workspaces` | completed |
| P6.2 Read Tools | 有界页面列表、搜索、读取（待定义） | not started |
| P6.3 Write Tools | 显式写入、权限与重试语义（待定义） | not started |
| P6.4 MCP Acceptance | 最终跨客户端验收（待定义） | not started |

P6.1 不实现 Resources、Prompts、页面读写/删除、Agent/Chat UI、automation 或 Token Settings UI。

## P6.1 接入契约

- API 配置 `MONGODB_URI` 时挂载同进程 `/mcp`；无 Mongo 时保留已有 health-only 模式。
- 官方 `@modelcontextprotocol/server@2.3.1` + `@modelcontextprotocol/node@2.1.1`，`createMcpHandler` / `toNodeHandler`，无状态 Streamable HTTP，兼容 SDK 的旧协议客户端路径。现代协议返回 JSON，SDK 旧协议路径使用标准 SSE，客户端解析后的工具结果相同。Fastify 解析后的 body 传给 SDK；Nest 负责 shutdown。所有协议响应统一 `Cache-Control: no-store, no-transform`。
- Web Cookie Session 与 MCP Token 独立。Token 是 32 字节安全随机 base64url 值，加 `eotion_mcp_` 前缀。Mongo `mcp_credentials` 只保存 `id/userId/name/tokenHash/createdAt/lastUsedAt/revokedAt`，SHA-256 hash 唯一索引且默认不选择。
- 每次请求重新验证 Bearer / 未撤销 / 用户仍存在，更新 last used。撤销是按当前用户和凭证 ID 限定的 application service，不提供本轮范围之外的管理接口；rotation 可通过创建新凭证、撤销旧凭证组合。
- 唯一工具 `eotion_list_workspaces` 输入严格 `{}`，从可信 `{ userId }` 调用 `WorkspaceService.listByOwner`。`structuredContent` 与文本 JSON 同为 `{ "workspaces": [{ "id": "...", "name": "..." }] }`，无用户/认证资料。
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
enabled_tools = ["eotion_list_workspaces"]
startup_timeout_sec = 20
```

从设置该环境变量的 PowerShell 启动 `codex`。`codex mcp list` 检查配置，TUI `/mcp` 检查连接和唯一工具，然后请求“调用 Eotion 的 eotion_list_workspaces，列出我的工作区”。列表只包含当前 Token 用户的工作区。桌面 Codex 同样必须继承 Token 环境；更改环境后重新启动客户端。这里使用预置 Bearer Token，不走 OAuth login。

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
