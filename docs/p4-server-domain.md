# P4.1 Server Domain / MongoDB Foundation

本阶段只建立服务端持久化基础。认证、权限判定、HTTP CRUD、真实同步和文件上传属于后续 P4 Work Unit。

## 领域与集合

| 集合 | 领域记录 | 边界 |
| --- | --- | --- |
| `workspaces` | `WorkspaceRecord` | `id`、名称、`ownerId` 和时间；`ownerId` 暂为稳定字符串引用，用户/会话模型留待 P4.2。 |
| `pages` | `PageRecord` | 以 `workspaceId` 隔离，`parentPageId` 和 `orderKey` 支持页面树。 |
| `blocks` | `BlockRecord` 加服务端 `workspaceId` | 以 `pageId` 引用 Page，独立存储，不把 Block 数组嵌入 Page。 |
| `filemetadatas` | `FileMetadata` | 只保存名称、类型、大小、对象键等元数据，不存文件内容。 |

`Page.id` 与 `Block.id` 接受 P3 客户端生成的 ID，服务端不重新分配。所有对外资源 ID 均是稳定字符串；Mongo `_id` 仅为内部字段。每个集合的 `id` 有唯一索引。

Block 持久化 `workspaceId`，让按工作区读取、将来授权和同步写入都能在单次查询中限定范围。写入 Block 时必须通过 Page 确定其工作区，并验证父 Block 属于同一 Page；Page 的父 Page 也必须属于同一工作区。归属字段不能在更新时悄然变更。根 Page/Block 的父 ID 为 `null`。

本阶段只在创建时设置 Page/Block 的父节点；更新入口不支持重挂。页面或区块移动需要能处理并发的关系校验，留待实际实现移动功能时定义。

## 查询与索引

- Workspace：唯一 `id`；按 `ownerId` 查询索引。
- Page：唯一 `id`；`workspaceId, parentPageId, orderKey, id` 复合索引，覆盖工作区内页面树与稳定排序。
- Block：唯一 `id`；`workspaceId, pageId, parentBlockId, orderKey, id` 复合索引，覆盖某页区块查询与稳定排序。
- File metadata：唯一 `id`；`workspaceId` 索引。

Repository 提供显式的工作区范围查询，例如按 `workspaceId + id` 获取 Page、按工作区列出 Page 和按 `workspaceId + pageId` 列出 Block。薄 application service 负责归属校验；后续 HTTP API、sync 和 MCP 适配器应调用同一服务边界，不直接操作 Mongoose Model。本阶段没有通用 CRUD 基类。
更新入口只接受各记录明确允许的字段，拒绝 Mongo 更新操作符和未知字段；归属与父级不能通过更新载荷改写。

`MONGODB_URI` 为空时不注册 Mongo 与服务端领域模块，`/api/health` 仍可启动；此时没有可用的 Mongo repository，也不使用内存数据库替代。配置 URI 时才连接 MongoDB 并注册领域持久化。

## 与 P3 及文件服务的关系

P3 的 `PageSummary`、`BlockRecord` 和 `LocalStore` 契约保留；完整的 `PageRecord` 与 `FileMetadata` 是新增服务端领域类型。P3 oplog 的至少一次投递和稳定 operation ID 不在 P4.1 接入，幂等服务端处理留待 P4.4。

Eotion 只管理文件元数据。后续文件操作由 `apps/api` 使用 `ali-oss-server` SDK，通过独立服务访问 Aliyun OSS。`ALI_OSS_CLIENT_SECRET` 仅放服务端配置。`bucket` 和 `clientId` 属于服务配置，不重复存进每条元数据；临时签名 URL 不应持久化。
