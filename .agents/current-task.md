# Current Task — P6.1 MCP Foundation + Auth

2026-10-06；严格只实施 P6.1。

## Work Units
1. S0 investigate / scout：现有 API、auth、workspace 权限、persistence、tests Evidence Pack。
2. S2 decide / 主 Agent：SDK 当前推荐 transport、最小 provisioning 与 auth context Implementation Brief。
3. S1 execute / fast_worker：token domain/persistence/application 与 provisioning。
4. S1 execute / fast_worker：MCP adapter 与真实 transport integration tests。
5. S0 verify / scout：相关测试、typecheck/build/lint 能力核验与 API 启动。
6. Review / reviewer：最终一次独立 blocker review；主 Agent 整合、提交。

## Invariants
只提供 eotion_list_workspaces；不做 P6.2、Resources、Prompts、UI、automation。
Web Cookie Session；MCP 独立随机 token，只存 hash。身份来自 Bearer 验证；复用 WorkspaceService 权限。
MCP 挂载同一 NestJS/Fastify /mcp，生命周期由 Nest 管理。

## Status
P6.1 completed / PASS。只提供 eotion_list_workspaces，P6.2～P6.4 not started。
root pnpm typecheck、API typecheck/build 通过；MCP 1/1、domain 2/2、HTTP/Sync/File 26/26 通过；Codex CLI 0.156.1 实际连接并调用成功，隔离账号/Token/database 已清理。
独立 review 与 SSE 缓存边界定向复核无 blocker；lint N/A（仓库无命令）。正式计划、开发配置与证据在 docs/p6-mcp.md。
