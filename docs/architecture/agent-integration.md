# MCP 集成基线

Eotion API 已实现 User / Cookie Session 认证，以及 Workspace、Page、Block 的 application/domain 与权限入口。MCP 是同一个 NestJS/Fastify API 中的新 interface adapter，复用这些能力，不另建业务服务或直接从 Tool 查询 MongoDB。

## 当前范围

P6 暂时只实施 MCP，主计划与验收见 [P6 MCP](../p6-mcp.md)。P6.1 提供 `eotion_list_workspaces`，P6.2 新增有界页面列表、标题搜索与正文读取；写入尚未开始。Resources、Prompts、Agent UI、Chat UI、automation 和完整 Token Settings UI 均不属于当前范围。

## 接入与身份

- Web 继续使用现有 Cookie Session。
- 外部 MCP Client 使用独立 Eotion MCP Access Token：`Authorization: Bearer <token>`，不接受浏览器 Cookie 作为 MCP 身份。
- `/mcp` 使用官方 MCP TypeScript SDK 的 Streamable HTTP，挂载在现有 Fastify 实例上，由 Nest module 生命周期管理。请求无状态，每次重新验证凭证，撤销后后续请求拒绝。
- 随机 Token 仅在创建响应中返回一次；Mongo 保存 SHA-256 hash、用户关联、名称、创建/最近使用/撤销时间。用户可以拥有多个独立凭证。
- 验证生成 `{ userId }`，Tool 从可信 context 获取身份，不接受客户端的 `userId`。当前工作区是 owner-only；列表调用 HTTP 同样使用的 `WorkspaceService.listByOwner`。
- Token provisioning 是受 Session 和现有 Origin guard 保护的 `POST /api/mcp/tokens`，只能为当前用户创建自己的凭证。撤销保留 application service 入口，本阶段无管理 UI。

## 边界与错误

保持 `MCP transport → adapter → application service → domain → persistence`。传输/schema 留在 `apps/api`；共享领域模型不依赖 Agent 提供商。

缺失/格式错误/无效/撤销/用户不存在的凭证统一返回 HTTP 401，不区分真实存在状态；内部故障只返回通用错误。已认证的工具业务故障用标准 MCP `isError` 表达，结果不含 stack、用户资料、session 或凭证。成功结果仅包含 Workspace 的 `id` 和 `name`。

Host / Origin 检查保护本地入口，凭证与工具结果禁用 HTTP 缓存。未来读写工具仍须调用相同 application 权限入口，内容视为不可信数据；分页、限量、写入幂等和审计在相应阶段确定，不能按已完成能力描述。
