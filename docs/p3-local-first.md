# P3 本地优先基础

## Storage contract

`packages/storage` 导出 runtime/framework-neutral 的 `LocalStore`。领域输入直接使用 `PageSummary` 和 `BlockRecord`，提供 Page CRUD、Block CRUD/按 Page 查询，以及 pending/failed operation 查询和状态更新。`deletePage` 在一个本地事务中级联删除区块，记录一条 `page.delete` operation。这里没有通用 KV 接口，也没有复制未来 MongoDB 的集合结构。

业务层只依赖 `LocalStore`；`apps/web/src/storage/createLocalStore.ts` 是唯一平台选择点。Web 使用 IndexedDB；Electron renderer 通过 typed preload IPC 调用 main process 内的 SQLite；Mobile WebView 通过 typed 消息协议访问 Lynx 壳。Lynx 壳在 WebView URL 的 hash 前写入 `eotionRuntime=mobile-webview`，Web factory 和 runtime context 根据同一标记选择平台。P3 开发验证页位于 `/#/__dev/storage-p3`，生产构建不注册路由。

## Adapter 边界与状态

| 运行时 | 当前实现 | 状态 |
| --- | --- | --- |
| Web | IndexedDB `pages`、`blocks`、`operations`、`meta`；Page 和 Block 是本地领域记录 | 已实现并在 Chrome 真实运行 |
| Electron | main process `node:sqlite`，userData 下 `eotion-local.sqlite`；preload 仅暴露固定 `LocalStore` 方法，IPC 拒绝非主 frame | 已实现并在 Electron 窗口真实运行；`contextIsolation: true`、`nodeIntegration: false`、`sandbox: true` |
| Mobile WebView | `packages/storage` 定义基于 `LocalStore` 的强类型 request/response 和运行时请求校验；Web 侧 `MobileBridgeLocalStore` 发送消息；Lynx 壳当前明确返回 `unavailable` | typed bridge 边界已实现；原生持久化尚不可用，**manual verification required** |

当前仓库没有 HarmonyOS 原生宿主工程、已注册的 storage Native Module 或平台数据库适配器。Lynx 官方文档支持 [HarmonyOS Native Module](https://lynxjs.org/next/guide/use-native-modules.html?platform=harmony) 路径，但注册、WebView 消息转发和进程重启后的持久化必须在真实宿主上实现并验证。当前 Mobile bridge 不把 IndexedDB 冒充平台存储。

## Oplog 与恢复 invariant

每条成功的本地内容 mutation 同事务写入一条 `pending` operation。operation 包含稳定的 `id`、持久 `clientId`、单调 `sequence`、`kind`、`target`、`payload`、`createdAt` 和 `status`。IndexedDB 以同一 readwrite transaction 提交内容、元数据与 oplog；SQLite 使用单一 `BEGIN IMMEDIATE`/`COMMIT`。失败的内容写入回滚，不能留下序号跳跃或孤立 oplog。应用重启后，`pending` 和 `failed` operation 仍按 sequence 可查询。

`reconnectPending` 只读取现有队列，按 sequence 发送；成功标记 `synced`，第一条发送失败标记 `failed` 并停止后续发送。重试不创建新 operation，沿用持久记录的 operation id。同一 JS realm 中同一 `LocalStore` 对象的并发调用共用一次执行；不同 store 对象即使指向同一数据库，也可能同时发送同一 operation。不同浏览器 tab、Electron renderer 或重载后的 JS realm 也不共享 `WeakMap`。Mobile 当前无原生存储，尚不能验证宿主侧的跨实例协调。

P3 的语义是 **durable local oplog + at-least-once delivery + stable operation id**，不承诺客户端 exactly-once 或跨实例全局互斥。发送已被远端接收、但本地 `synced` 状态尚未提交时，后续 reconnect 会用同一 id 重试。P4 sync transport 和 server 必须按 operation id 幂等处理重复投递；这是未来服务端契约的必要条件。P3 只用 fake transport 验证本地语义，不连接服务器。

## 验证

```bash
pnpm --filter @eotion/contracts typecheck
pnpm --filter @eotion/storage test
pnpm --filter @eotion/storage typecheck
pnpm --filter @eotion/desktop test
pnpm --filter @eotion/desktop typecheck
pnpm --filter @eotion/web typecheck
pnpm --filter @eotion/web test:storage
pnpm --filter @eotion/web build
pnpm --filter @eotion/mobile build
```

Playwright 测试真实 Chrome 中的 IndexedDB CRUD、重开持久化、oplog 顺序、失败事务、offline/reconnect/retry、重复并发 reconnect、跨实例状态更新与 UTF-8 BINARY 排序；并启动真实 Electron 窗口，经 typed IPC 写入 SQLite，检查 reload 和应用重启后的内容及 pending 队列。开发页可手工操作写入、读取、删除、reload、离线/重连与 adapter 标识。

HarmonyOS 待人工验证：Native Module 注册与持久化实现、WebView request/response 实际送达、应用进程重启后的 Page/Block/oplog 恢复、断线和重复重连。当前不声明这些项目通过。
