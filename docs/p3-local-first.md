# P3 本地优先基础

## Storage contract

`packages/storage` 导出 runtime/framework-neutral 的 `LocalStore`。P4.4 起本地输入使用带明确 `workspaceId` 的 `LocalPageRecord`、`LocalBlockRecord`；Page 含 `parentPageId`、`orderKey`，以便原子写入可重放的 canonical operation。提供 Page CRUD、Block CRUD/按 Page 查询，以及 pending/failed operation 查询和状态更新。`deletePage` 在一个本地事务中级联删除该页区块，记录一条 `page.delete` operation；有子页面时拒绝删除。这里没有通用 KV 接口，也没有复制未来 MongoDB 的集合结构。

业务层只依赖 `LocalStore`；`apps/web/src/storage/createLocalStore.ts` 是唯一平台选择点。普通 Web 和 Mobile WebView 共用同一个 IndexedDB adapter；Electron renderer 通过 typed preload IPC 调用 main process 内的 SQLite。Lynx 壳在 WebView URL 的 hash 前写入 `eotionRuntime=mobile-webview`，该标记只用于 runtime/UI 识别，不选择或改变存储 adapter。P3 开发验证页位于 `/#/__dev/storage-p3`，生产构建不注册路由。

开发验证页的“清除数据”会重置当前 P3 LocalStore 的页面、区块、全部 oplog 及 client metadata，并清空本页 fake transport 发送记录；重置本身不生成 operation。此操作清除当前存储适配器中的全部 P3 数据，不影响其他站点数据。

## Adapter 边界与状态

| 运行时 | 当前实现 | 状态 |
| --- | --- | --- |
| Web | IndexedDB `pages`、`blocks`、`operations`、`meta`；Page 和 Block 是本地领域记录 | 已实现并在 Chrome 真实运行 |
| Electron | main process `node:sqlite`，userData 下 `eotion-local.sqlite`；preload 仅暴露固定 `LocalStore` 方法，IPC 拒绝非主 frame | 已实现并在 Electron 窗口真实运行；`contextIsolation: true`、`nodeIntegration: false`、`sandbox: true` |
| Mobile WebView | 与普通 Web 共用 IndexedDB adapter；`eotionRuntime=mobile-webview` 只标记运行时/UI，不影响存储选择 | 已实现；2026-09-27 在 Huawei nova 14 / Android Lynx Explorer via 卓易通完成 15/15 项真机验收 |

IndexedDB 依赖 WebView 使用稳定的 origin 和 storage partition。query/hash 变化不应形成新的存储分区；reload、应用升级及应用/宿主重启不得主动清除站点数据。若部署从远程 Web origin 改为 bundled/local origin，或 origin / storage partition 发生变化，必须重新评估数据迁移和持久性，不可假设原数据自动可见。

旧的 WebView↔Lynx typed bridge 是历史 PoC，不代表当前 P3 的 storage adapter，也不作为 IndexedDB 真机验收。当前 P3 Mobile 真机验收见 [P3 真机测试清单](verification/device/p3-local-first.md)。

## Oplog 与恢复 invariant

每条成功的本地内容 mutation 同事务写入一条 `pending` operation。operation 包含稳定的 `id`、持久 `clientId`、单调 `sequence`、明确的 `workspaceId`、`kind`、可重放的 `payload`、`createdAt` 和本地 `status`。IndexedDB 以同一 readwrite transaction 提交内容、元数据与 oplog；SQLite 使用单一 `BEGIN IMMEDIATE`/`COMMIT`。失败的内容写入回滚，不能留下序号跳跃或孤立 oplog。应用重启后，`pending` 和 `failed` operation 仍按 sequence 可查询。Mobile WebView 使用同一 IndexedDB transaction 语义。

本地新 ID 统一通过 `@eotion/storage` 的 `createLocalId()` 生成（基于 nanoid）；Page / Block 的 ID 由调用方在创建时赋予，更新时沿用原 ID。adapter 只在首次建立 client identity 和写入新 operation 时生成 ID；重试读取已有 operation，不生成新 ID。历史 Mobile bridge PoC 请求也曾使用该 helper。

`reconnectPending` 只读取现有队列，按 sequence 发送；成功标记 `synced`，第一条发送失败标记 `failed` 并停止后续发送。重试不创建新 operation，沿用持久记录的 operation id。同一 JS realm 中同一 `LocalStore` 对象的并发调用共用一次执行；不同 store 对象即使指向同一数据库，也可能同时发送同一 operation。不同浏览器 tab、Electron renderer 或重载后的 JS realm 也不共享 `WeakMap`。Mobile WebView 的跨实例协调不在当前 P3 guarantee 内。

P3 的语义是 **durable local oplog + at-least-once delivery + stable operation id**，不承诺客户端 exactly-once 或跨实例全局互斥。发送已被远端接收、但本地 `synced` 状态尚未提交时，后续 reconnect 会用同一 id 重试。P3 原始验收只使用 fake transport；P4.4 加入真实 HTTP transport 与服务端 operation ID 幂等。

P4.4 已在 [真实同步契约](p4-sync.md) 补齐 P3→P4 的网络 operation、HTTP transport 与服务端 receipt。旧 P3 页面和 oplog 没有足够的工作区、父页面和排序信息，不能自动升级为可同步记录；新 mutation 必须显式给出这些值。

## 验证

真机人工验收进度见 [P3 真机测试清单](verification/device/p3-local-first.md)。


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

Playwright 测试真实 Chrome 中的 IndexedDB CRUD、重开持久化、oplog 顺序、失败事务、offline/reconnect/retry、重复并发 reconnect、跨实例状态更新与 UTF-8 BINARY 排序；并启动真实 Electron 窗口，经 typed IPC 写入 SQLite，检查 reload 和应用重启后的内容及 pending 队列。开发页可手工操作写入、读取、删除、reload、离线/重连与 adapter 标识。2026-09-27，Mobile WebView 的 P3 IndexedDB 真机清单已在 Huawei nova 14 / Android Lynx Explorer via 卓易通完成 15/15 项并全部通过，包括 origin/storage partition 稳定性、reload/进程重启持久性、oplog/reconnect 等项目；该结果只覆盖该宿主/设备，不自动代表原生 iOS 或原生 HarmonyOS Lynx 宿主。历史 typed bridge PoC 的 diagnostics 仅记录 bridge 请求响应，不属于 `LocalStore` 或 RPC contract，也不是当前 P3 IndexedDB 验收依据；生产构建不展示调试页。

### Safe Area 真机验证

- **iPhone XS Max / iOS WebView：✅ 通过**
  - 系统状态栏与 Eotion 顶栏不重叠。
  - safe area 正常消费。
- **Huawei nova 14 / HarmonyOS Browser：✅ Web 布局通过**
  - 系统栏和浏览器 UI 正常划分 viewport。
  - `safe inset = 0` 为正常结果。
  - Eotion 内容无系统区域侵入。
- **Huawei nova 14 / Android Lynx Explorer via 卓易通：⚠️ 不作为原生 HarmonyOS Safe Area 验收环境**
  - Explorer 以 fullscreen / immersive 方式运行。
  - WebView 延伸至物理屏顶部。
  - `safe-area-inset-top = 0`。
  - 系统状态栏下拉后覆盖 WebView。
  - 该现象归于当前宿主未暴露/消费系统 inset，不据此判定 Eotion Web Safe Area 或原生 HarmonyOS 适配失败。

Safe Area / 系统栏行为仍需在目标原生 Lynx/HarmonyOS 宿主人工验证。P3 IndexedDB 真机验收已在 Huawei nova 14 / Android Lynx Explorer via 卓易通完成 15/15 并通过；该结果与 Safe Area / 系统栏验收相互独立。
