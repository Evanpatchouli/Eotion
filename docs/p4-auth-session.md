# P4.2 Auth / Session / Workspace Permission Foundation

P4.2 为后续 HTTP、同步与 MCP 适配器建立同一套服务端身份和授权入口。本阶段没有认证 Controller、Cookie、Auth DTO 或 SDK API。

## User 与密码

- `users` 集合使用稳定字符串 `id`（创建时生成 UUID）、规范化的唯一 `email`、`passwordHash`、`createdAt` 和 `updatedAt`。email 在注册和认证时执行 `trim` 与小写转换。
- `UserRecord` 只包含 `id`、`email` 和时间字段；应用服务、返回值和普通异常不暴露 `passwordHash`。
- 密码使用 Node 内置异步 `crypto.scrypt`，随机盐与参数同摘要一起保存，并以 `timingSafeEqual` 验证。数据库不保存明文密码。
- 认证失败统一返回无效凭据，不区分用户不存在和密码错误。

## Session

- `AuthService.login` 验证密码后签发一次性返回的 32 字节随机 opaque token；不提供按任意 userId 签发会话的公共入口。`sessions` 集合只保存其 SHA-256 `tokenHash`，以及 `id`、`userId`、`expiresAt`、`revokedAt` 和时间字段。
- 创建时确定到期时间。解析时同时检查到期和撤销状态，注销将会话标记为 revoked；TTL 索引用于清理过期记录，实际有效性不依赖 Mongo 后台清理时间。
- `tokenHash` 唯一索引支持按 token 定位；`userId` 索引支持用户会话查询；`expiresAt` TTL 索引清理过期记录。raw token 不进入 Mongo、日志或异常。

## Workspace 权限

- 当前 MVP 只有 owner：`workspace.ownerId === authenticated userId` 时可读写，其余用户均不可访问。无成员、角色、邀请、共享链接或 ACL。
- Workspace 创建时，服务检查用户真实存在，并由该用户 ID 填入 `ownerId`，不接受调用方自报 owner。File 创建时也由当前用户填入 `ownerId`。
- Workspace、Page、Block、File 的应用服务入口接收**从有效 Session 解析出的 userId**，先经 `WorkspacePermissionService` 检查，再访问按 workspace 限定的 repository。只提供 workspaceId 无法调用这些入口完成资源操作。不存在或不属于用户的 workspace 对应用服务统一表现为不存在。
- 未来 HTTP、Sync 与 MCP 适配器必须从认证结果传入 userId，不能把客户端提交的 userId 当作认证身份；不能绕过应用服务直接调用 repository。

## 后续边界

P4.3 再定义 Cookie transport、HTTP Controller、contracts DTO 和 SDK。真实 oplog 同步与 operation 幂等性属于 P4.4；对象存储 SDK、MCP、协作及复杂权限均不在 P4.2。
