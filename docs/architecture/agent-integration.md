# MCP 集成基线

Eotion API 已实现 User / Cookie Session 认证，以及 Workspace、Page、Block 的 application/domain 与权限入口。MCP 是同一个 NestJS/Fastify API 中的新 interface adapter，复用这些能力，不另建业务服务或直接从 Tool 查询 MongoDB。

## 已实现能力与阶段边界

P6 MCP Foundation / Auth、Page 读取与写入已完成，历史范围与验收见 [P6 MCP](../p6-mcp.md)。P6 的六个既有工具保持兼容。

P10.2 的五个 Database 读取工具及验证修复已由 `2aad764` 合入 master。P10.3 在此基础上新增 `eotion_create_record`、`eotion_update_record_cell`、`eotion_create_property`、`eotion_update_property`、`eotion_create_view`、`eotion_update_view`、`eotion_rename_database`；总共十八工具。完整 Schema、空值/CAS/幂等契约与独立验收结果见 [P10 Database MCP](../p10-database-mcp.md)。没有 Database 创建/删除、各实体删除、类型转换、批量 Cell 或 View context 调度工具；Resources、Prompts、Agent UI、Chat UI 与 automation 仍不在本阶段范围。P10.4 尚未启动，P11.6 保持 HOLD，版本仍为 0.0.1 / build 2。

## 接入与身份

- Web 继续使用现有 Cookie Session。
- 外部 MCP Client 使用独立 Eotion MCP Access Token：`Authorization: Bearer <token>`，不接受浏览器 Cookie 作为 MCP 身份。
- `/mcp` 使用官方 MCP TypeScript SDK 的 Streamable HTTP，挂载在现有 Fastify 实例上，由 Nest module 生命周期管理。请求无状态，每次重新验证凭证，撤销后后续请求拒绝。
- 随机 Token 仅在创建响应中返回一次；Mongo 保存 SHA-256 hash、用户关联、名称、创建/最近使用/撤销时间。用户可以拥有多个独立凭证。
- 验证生成 `{ userId }`，Tool 从可信 context 获取身份，不接受客户端的 `userId`。当前工作区是 owner-only；列表调用 HTTP 同样使用的 `WorkspaceService.listByOwner`。
- Token provisioning 是受 Session 和现有 Origin guard 保护的 `POST /api/mcp/tokens`，只能为当前用户创建自己的凭证。撤销保留 application service 入口，本阶段无管理 UI。

## 边界与错误

保持 `MCP transport → adapter → application service → domain → persistence`。传输/schema 留在 `apps/api`；共享领域模型不依赖 Agent 提供商。

缺失/格式错误/无效/撤销/用户不存在的凭证统一返回 HTTP 401，不区分真实存在状态；内部故障只返回通用错误。已认证的工具业务故障用标准 MCP `isError` 表达，结果不含 stack、用户资料、session 或凭证。成功结果只包含各工具声明的稳定业务 DTO。

Host / Origin 检查保护本地入口，凭证与工具结果禁用 HTTP 缓存。读写工具调用相同 application 权限入口，内容视为不可信数据。

P6.3 的 `DocumentMutationService` 组合 PageService/BlockService，在同一 Mongo transaction 内执行 Page CAS、正文 reconcile、结果大小验证和持久化成功 receipt。普通 HTTP/Sync 的 Page/Block mutation 同样推进严格单调的页面版本时间；排序算法在 framework-light domain 中共享。MCP 不建立第二套 oplog，也不改变 Sync operation 协议；既有 workspace snapshot 读取服务器最终状态。MCP compound write 要求 replica set 或 mongos，standalone 明确拒绝，不继承旧 CRUD 的非事务 fallback。

P10.3 把 P6 的 canonical hash、事务与成功回执编排提取到共用 `McpMutationService`，`DocumentMutationService` 保持原接口与成功 DTO。`DatabaseMcpMutationService` 只组合应用服务，DatabaseService 的内部 session-aware 通道复用同一个活动 snapshot transaction，不嵌套事务；既有 HTTP 调用仍自行开启原事务。Record/Page 原子创建，Page.title 是标题唯一来源；所有数据库写入显式校验 Database CAS，并按操作校验 Record/Property/View/Page 版本。数据库 rename 仅更新该数据库名称与版本。

写权限、Workspace/Database/目标实体真实归属检查在 replay 前进行；业务 CAS 在其后。领域写入、关联清理/引用 fence、版本推进、严格 DTO 投影与1 MiB UTF-8 JSON 检查、成功 receipt 同事务以 majority write concern 提交。复用原 `(userId,tool,idempotencyKey)` 唯一键及无 TTL 的 committed-only 回执，同 key 同 payload 返回首次 DTO，不同 payload 冲突。未知 commit 结果保持未确认并要求原 key/原 payload 重试，不记成回滚；与 P11 batch 的 pending/uncertain 回执保持独立。Database 继续 online read/write，不进入 LocalStore/oplog。
