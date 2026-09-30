# P4.4 Real Sync Transport / Operation ID Idempotency

P4.4 将 P3 的持久 oplog 经 `@eotion/sdk` 的 `EotionOperationTransport` 发送到 `POST /api/sync/operations`。客户端继续按 `clientId` 内递增的 `sequence` 顺序发送；成功后才标记本地 `synced`，失败时标记 `failed` 并停止。重试使用原 `id`，不产生新 oplog。此路径是 **at-least-once delivery + server-side idempotent apply**，不承诺客户端 exactly-once。

## Canonical operation

`@eotion/contracts` 的 `SyncOperationSchema` 是网络契约单一事实源。公共字段为 `id`、`clientId`、`sequence`、`workspaceId`、`kind`、`createdAt`；`createdAt` 是客户端 mutation 时间，只用于记录与诊断。`status` 仅存在于本地 oplog，不发往服务器。四种 payload 为：

| kind | payload |
| --- | --- |
| `page.upsert` | `{ id, parentPageId, title, icon, orderKey }`，`icon: null` 表示无图标。 |
| `page.delete` | `{ id }` |
| `block.upsert` | `{ id, pageId, parentBlockId, type, orderKey, props }` |
| `block.delete` | `{ id }` |

`workspaceId` 必填，不能从当前 UI 工作区推断。Page/Block upsert 携带服务器重放所需完整字段；服务端 `createdAt`/`updatedAt` 仍由 Mongo 生成，不从 operation 时间复制。当前不同 operation 修改同一资源时，服务端按实际成功提交顺序应用，不使用客户端时间做 last-write-wins。父级和归属不可通过 upsert 移动；P5.4 为 Page 层级变化增加独立的 `page.move` operation，payload 为 `{ id, parentPageId, orderKey }`，服务端沿用 Page service 的树约束拒绝移动到自身、后代或 foreign parent。此操作同样以稳定 operation ID 幂等应用。

P3 旧 PageSummary/oplog 无法恢复 `workspaceId`、`parentPageId` 和 `orderKey`。本地旧记录保持原样，不凭空填值；发送前的严格 schema 会拒绝旧 operation 并留在 `failed`。旧 PoC 数据需要由用户明确提供目标工作区与完整树/排序信息后重新创建，或在开发验证页明确清空。不要将其静默迁移为可同步记录。

## Receipt 与授权

入口沿用 Cookie Session、Origin 检查和 Workspace owner-only 权限。授权成功后，以 authenticated `userId` 和 operation `id` 确定 receipt；receipt 另存 `workspaceId`，并记录包含它在内的 canonical 内容的稳定 SHA-256 fingerprint、`clientId`、`sequence`、`kind` 和应用时间。同 ID 同内容重发返回成功而不再次执行 mutation；同 ID 改换工作区或其他内容返回 409。不同用户或工作区不能通过 ID 复用绕过权限。

Receipt 与 Page/Block mutation 在同一 Mongo 事务提交。并发同 ID 请求由唯一索引和事务重试/冲突检查收敛为一次应用；服务器已经提交但客户端尚未完成本地 `markOperationSynced` 时，重试只读取 receipt。**部署 Mongo 必须支持多文档事务（replica set 或 sharded cluster）**。测试可用单节点 replica set；standalone Mongo 不满足本阶段同步写入要求。

`page.delete` 在同一事务中删除目标 Page 及该页 Blocks；有子 Page 时拒绝删除，避免留下孤儿 Page。`block.delete` 有子 Block 时拒绝删除。不存在的目标删除视为成功的空操作，但仍写 receipt，以便同 ID 重试稳定返回。所有 mutation 通过现有 Page/Block application service 和 workspace scope，HTTP controller 不直接写 Mongo。

支持事务的 Mongo 上，普通 HTTP 创建子 Page 或 Block 也在事务内写父资源的内部 `structureFence`，与同步删除父资源形成写冲突，避免创建和删除交错留下孤儿。该字段只用于数据完整性，不是客户端 revision 或冲突算法。standalone Mongo 保持 P4.3 的普通 HTTP 创建路径；由于它不支持事务，sync mutation 会返回 503。

本阶段只保证可靠投递和幂等应用；没有 revision、CRDT、冲突合并、多用户协作或全局客户端发送锁。

## P5.4 产品同步补充

P5.4 增加只读 `GET /api/sync/workspaces/:workspaceId/snapshot`，经 Cookie Session 和 workspace owner 权限返回正式 Page / Block DTO，不创建 receipt。SDK 入口为 `api.sync.snapshot(workspaceId)`。产品在 push 全部成功后才读取 snapshot；因此单用户多设备顺序使用可以通过最后一次成功同步后的服务端状态收敛。并发修改同一 Block 时，最后成功到达服务端的 mutation 生效；这不是并发合并保证。snapshot 与客户端接线及尚待完成的真实 E2E 见 [P5.4 Real Sync](p5-real-sync.md)。
