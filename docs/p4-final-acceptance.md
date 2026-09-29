# P4 Final Acceptance

- 验收日期：2026-09-30
- 基线：`7ee21d78b2c47218d98990883f5a5a1bcf4a006c`（同步后的 `origin/master`）
- 结论：**PASS**。P4 六条退出条件在当前定义范围内均有运行结果和代码/测试证据；P5 功能未纳入本次验收。

## 测试环境

使用临时 Docker `mongo:8` 单节点 replica set `eotionP4Final`，仅绑定 `127.0.0.1:27018`，无持久卷；设置 `P4_TEST_MONGODB_URI=mongodb://127.0.0.1:27018/?replicaSet=eotionP4Final&directConnection=true` 运行 API integration。另在 `127.0.0.1:27019` 启动无持久卷 standalone 实例做隔离冒烟：认证后提交 `page.upsert` 返回 503，Page 和 receipt 均为 0。两容器已删除；长期运行的 `local-mongodb` 容器及其数据未变更。文件集成测试使用 fake ali-oss-server HTTP 服务和真实 `@ali-oss-server/sdk@1.1.0`，未访问真实 OSS。

## 退出条件证据矩阵

| Roadmap P4 退出条件 | 代码与断言证据 | 结果 |
| --- | --- | --- |
| 1. 认证并建立有效会话 | `http-api.test.ts` 的完整 HTTP 流覆盖 register、login、opaque Cookie 的 `HttpOnly`/`SameSite=Lax`、生产 `Secure`、`/me` 恢复、logout/revoke、未认证 401，以及响应中无 raw token/passwordHash/tokenHash；`auth.service.ts`、`session.service.ts` 保存 hash 并检查撤销/过期。 | PASS |
| 2. Workspace / Page / Block 服务端模型、CRUD/查询、权限和类型化 API | `@eotion/domain`、`@eotion/contracts` 的严格 DTO/schema 和 `@eotion/sdk` 的类型化路由；`http-api.test.ts` 验证当前 P4.3 定义的 create/list/get/update、owner-only、跨用户 404、伪造 ownerId/userId/归属字段 400；`server-domain.test.ts` 验证工作区范围、父级归属、排序及索引。Page/Block 删除由 P4.4 sync operation 提供并有集成断言；P4.3 未定义独立 HTTP DELETE 路由。 | PASS |
| 3. pending/failed oplog 经真实 transport 投递且同 ID 不重复生效 | `storage/index.test.ts` 验证顺序、失败重试、稳定 ID、确认失败重发；`sdk/index.test.mjs` 验证 canonical payload 去除本地 status；`sync-http.test.mjs` 用 SQLite → `reconnectPending` → `EotionOperationTransport` → SDK → HTTP → `SyncService` → Mongo transaction/receipt，验证同 ID 同内容仅一份 receipt、不同内容/工作区 409、并发重复请求收敛。 | PASS |
| 4. 重新上线继续同步并读取服务端持久化结果 | `sync-http.test.mjs` 关闭并重开 SQLite 后发送 pending operation，失败后在该 store 上以原 ID 重试 failed，并查询 Mongo Page/Block 记录与 receipt；还覆盖本地 ack 失败后的重发、Page/Block 删除及 HTTP 创建与同步删除交错。`storage/index.test.ts` 和 Web Playwright 存储测试验证断线恢复；临时 standalone HTTP 冒烟证实事务不可用时返回 503 且不产生 Page/receipt。 | PASS |
| 5. 文件元数据及对象存储链路 | `file-http.test.mjs` 的 21 个子测试经真实 SDK 1.1.0 调用 fake ali-oss-server，覆盖认证与归属、metadata CRUD、CommonJS 直接加载、raw stream、ASCII/中文/emoji/`résumé #1.txt` 名称、取消/断开/大小上限、最终 objectKey、精确补偿与不确定结果保留、OSS→Mongo 删除顺序、stale/duplicate ID 并发保护及 secret 不外泄。`file-metadata.service.ts` 将 MIME 固定为 `application/octet-stream`。 | PASS |
| 6. contracts、SDK、integration test 和最小端到端验证 | 六包 typecheck、Storage/SDK/Desktop/API 测试、Web/Desktop/Mobile 构建均通过；API HTTP 集成测试实际启动 Nest/Fastify、通过 HTTP 和 Cookie 调用类型化 SDK，Sync 使用真实 SQLite 与 Mongo；Web Playwright 测试覆盖 IndexedDB、Electron SQLite，以及 Chromium 模拟 `mobile-webview` runtime 时复用 IndexedDB adapter。 | PASS |

## 实际运行结果

| 命令 | 结果 |
| --- | --- |
| `pnpm --filter @eotion/{domain,contracts,storage,sdk,api,desktop} typecheck`（分别执行） | 6/6 通过 |
| `pnpm --filter @eotion/storage test` | 5/5，通过；无 skipped |
| `pnpm --filter @eotion/sdk test` | 7/7，通过；无 skipped |
| `pnpm --filter @eotion/api test:domain` | 2/2，通过；无 skipped |
| `pnpm --filter @eotion/api test:http` | HTTP 1/1、Sync 1/1、File 22/22（含 21 个子测试），全部通过；无 skipped |
| `pnpm --filter @eotion/desktop test` | 4/4，通过；无 skipped |
| `pnpm --filter @eotion/web test:storage` | Playwright 7/7，通过 |
| `pnpm --filter @eotion/{web,desktop,mobile} build`（分别执行） | 3/3 通过；Web 包含 `vue-tsc --noEmit` |
| 临时 standalone Mongo HTTP 冒烟 | sync 503，Page=0，receipt=0；通过 |

`server-domain.test.ts` 已按测试 runbook 在读取环境变量前显式加载 `dotenv/config`；其余 API integration test 的首条 import 已符合该约定。

## 独立复核

独立 reviewer 逐条核查六条退出条件、测试断言、P4.1～P4.5 契约和 auth/sync/file 数据完整性，未发现阻止进入 P5 的 blocker。Reviewer 核实了 File 的 21 个子测试（Node 报告 22，包含父测试）、特殊文件名与 Page/Block 删除的类型化 sync 路径；两处文档精确性意见已修正。

## 已知非 blocker

- P4 的真实 sync transport 在 SDK 与端到端集成测试中贯通；正式 Web 产品流程尚未接线，属于 P5 Product MVP。P3 开发页仍使用演示 transport。
- 文件 MIME 固定 `application/octet-stream`；附件展示/渲染在 P5 再评估。
- 当前无 revision、CRDT、跨用户协作、正式 Workspace/Page UI；均属后续阶段。文件上传结果未知时仍可能留下需人工清理的远端对象，现有实现避免误删。
