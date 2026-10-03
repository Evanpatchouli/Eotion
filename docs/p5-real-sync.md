# P5.4 Real Sync / 正式 Local-first 产品链路

## 当前状态

P5.4 的正式产品链路已把 Page、Block mutation 接入 `LocalStore` 和产品 Sync Coordinator。Web 与 Electron 自动验收已通过；Mobile WebView 以默认 LAN HTTP 地址运行时的真机离线重启尚未验证，因此 Roadmap 暂不标记完整 PASS。

## 数据与保存语义

正式客户端内容以 `LocalStore` 作为 durable source of truth；Mongo 中的 Page / Block 是客户端同步后的共享状态。Page Tree 写入和 `PagePersistence` 的 Block 写入先提交到本地 adapter，mutation 与一条 pending oplog 在同一事务中落盘。编辑器“已保存”表示本地保存成功，顶部同步状态单独显示“正在同步”“已同步”“待同步”“离线”或“同步失败”。内存 `pendingPageDraft` 仍作为短暂编辑边界的兜底，不承担 reload / 离线 / 重启后的持久化职责。

`ProductSyncCoordinator` 位于 `apps/web/src/stores/productSync.ts`。它合并短时间内的同步请求并串行执行；先从服务端刷新当前用户可访问的 workspace 列表，再按这些 workspace ID 过滤 oplog。旧账号或无权 workspace 的本地 operation 留在队列中，不随新账号请求发送，也不阻塞合法 workspace 的队列。

同步顺序固定为：

```text
LocalStore pending / failed operations
  → 按 sequence push（稳定 operation ID）
  → 全部成功后读取 Server snapshot
  → replace 指定 workspace 的本地 snapshot
```

任一 push 失败即停止本轮 pull，错误状态保留本地内容。`replaceWorkspaceSnapshot` 还会拒绝仍有 pending / failed operation 的 workspace；pull 前先尝试 flush 当前编辑器，避免正在编辑或输入法组合中的内容被替换。替换完成后页面树可从本地 store 刷新；不因 snapshot 到达而对活跃 Tiptap 文档无条件调用 `setContent()`。

## Snapshot API 与 hydrate

`GET /api/sync/workspaces/:workspaceId/snapshot` 是只读、类型化的完整 workspace snapshot 接口，返回现有 `PageResponse[]` 与 `BlockResponse[]`。它使用 Cookie Session 和现有 workspace 权限；无权或不存在沿用隐藏语义，不创建 operation receipt，也不修改数据。SDK 通过 `api.sync.snapshot(workspaceId)` 调用。此阶段不增加 revision 或增量 cursor，也不通过逐页读取 blocks 构造 N+1 请求。

`LocalStore` 的 `hasWorkspaceSnapshot` 可识别本地是否已有该 workspace 的已准备副本。`replaceWorkspaceSnapshot` 验证 workspace 归属及 Page / Block 引用树后，在一个 adapter 事务内只替换目标 workspace：远端已删除的记录会清除，其他 workspace 不变。hydrate 不写 oplog、不消耗 sequence、不改变 `clientId`；存在本地未同步操作时拒绝替换。空 snapshot 也持久化 marker，因此“服务器确认的空 workspace”不会被误认为“本机从未有过副本”。

首次进入已有本地 snapshot 的 workspace 时，先立即展示本地 Page Tree / Page，再后台同步。没有本地 snapshot 且在线时先执行同步并 hydrate；没有本地 snapshot 且离线时显示“此工作区尚未保存到本机，当前离线无法打开。”，不伪造空工作区。

## Page Move 与同步收敛

Page Tree 的移动通过 `LocalStore.movePage()` 原子更新 Page 并记录单条 canonical `page.move` operation，payload 包含 `id`、`parentPageId`、`orderKey`。服务端复用 Page service 的树约束；无效的自身、后代或跨 workspace parent 会被拒绝。重复投递沿用 operation ID 并由 P4 receipt 幂等处理。

当前只承诺单用户多设备顺序使用：设备先 push 本地队列，之后 pull 服务端最终 snapshot。不同 operation 修改同一 Block 时，最后成功到达服务端的 mutation 生效。没有 CRDT、revision merge、字段级冲突解决或多人同时编辑保证；并发写入可能发生 LWW 覆盖。

## 离线身份与 Workspace 缓存

成功的 `/auth/me` / 登录结果会缓存最近成功认证的用户；Workspace metadata 按 `userId` 分开缓存。`/auth/me` 明确返回 401 时清除 cached identity、workspace state 并要求重新登录，不允许离线缓存绕过失效 Session。SDK 以实际 HTTP 状态裁定 ApiError，不允许响应体的 500 覆盖 HTTP 401/403。共享的 `isTransientServiceUnavailable` 将 fetch/network `TypeError` 与 HTTP 500/502/503/504 视为暂时不可用，认证恢复、Workspace 列表缓存及 Sync 使用同一判断。只有本机曾成功认证的用户可进入 offline product mode；从未成功登录的用户不能凭空进入产品。HTTP 500 表示服务端暂时无法完成请求，允许已有可信身份使用本地缓存；403、其他 4xx 以及未列出的 5xx（如 501/505）不触发缓存降级。离线时只显示该用户缓存过的 Workspace 元数据和对应本地 Page / Block。

有可用 cached identity 时，恢复进入 ready/offline 且不设置 restoreError，正式 RouterView 保持渲染。已有用户的 session 重试也不卸载编辑器。没有身份而无法验证 Session 时，全局显示 Eotion 连接状态与重试按钮，原始诊断仅在原生 `<details>/<summary>` 展开详情中显示；隐藏浏览器 marker，现有 EotionIcon 使用 lucide ChevronRight/ChevronDown 数据与 morphicons/vue 动态 morph，遵循用户 reduced-motion 偏好。没有 Workspace cache 或 snapshot 时明确提示“此工作区尚未保存到本机，当前离线无法打开。”，不伪造空 Workspace。

当前 workspace 缓存仅用于离线展示与路由选择。恢复在线后，发送任何 oplog 前都重新读取服务端 workspace 权限列表；缓存本身不授予同步权限。用户成功退出会清除 cached identity。

## Adapter 与触发时机

平台选择仍只由 `apps/web/src/storage/createLocalStore.ts` 的 `createLocalStore()` 完成：Web 和 Mobile WebView 使用 IndexedDB；Electron renderer 经 typed preload IPC 调用主进程 SQLite。snapshot marker、事务替换和拒绝 pending replace 由两个 adapter 实现，不由业务层区分平台。

生产 Web 构建会生成版本化 Service Worker 并缓存应用外壳与静态资源，完全断网时仍可 reload / 重启浏览器；`/api` 请求不进入该缓存。仅安全 HTTP(S) origin 注册 Service Worker，Electron production 在配置的 HTTPS API origin 下经 protocol handler 直接读取本地打包资源，不注册 Service Worker；配置与验收见 [Desktop production](runbooks/desktop-production.md)。Mobile WebView 默认开发地址是 LAN HTTP，真机上通常不具备 Service Worker 所需安全上下文；正式离线重启验收须使用稳定 HTTPS origin 或另行设计打包资源方案，并验证 origin / storage partition 持续一致。

Sync Coordinator 在 session 配置、workspace prepare、本地 mutation、`online`、页面重新可见 / 获得关注时请求同步，并提供手动重试入口。短 debounce 合并重复请求，不使用高频 polling。`navigator.onLine=true` 不代表 API 可达：列表、Push、snapshot 的暂时不可用均显示“离线 · 本地已保存”，不替换正文，未确认的 oplog 保持可重试。服务恢复后先刷新权限、Push 再 Pull，成功时清除 offline identity 并回到“已同步”；初次缺失 snapshot 的页面树也会在 hydrate 后自动加载。全局顶部状态与编辑器本地保存状态分开。

## P5.3 → P5.4

P5.3 的编辑器将 Page 内容通过 SDK Block HTTP CRUD 保存到 Server；P5.4 将 `PagePersistence` 的本地持久化边界接到 `LocalStore`，Page Tree 变更也先写本地并生成 oplog，再由统一 Sync Coordinator 走 P4 operation transport。Server CRUD 不再是正式 Page / Block 的主要保存路径；Snapshot 只在 push 成功后用于共享状态收敛与初次 hydrate。

## 验证状态

Backend Unavailable 修复验收（2026-10-01）：Web typecheck/build、Desktop typecheck/build、产品测试 91/91、存储与 Electron 产品测试 10/10、storage 单测 6/6、Desktop SQLite 单测 8/8、offline-shell 1/1、真实 Mongo/API/生产 Web 双客户端 1/1 通过，`git diff --check` 通过。真实同步使用临时无持久卷 `mongo:8` 单节点 replica set、127.0.0.1:27018 及 `directConnection=true`，结束后已移除临时容器，未修改既有 Mongo。新增测试覆盖身份/Workspace 的瞬态降级与 4xx/500 拒绝、401 清身份、无缓存/无 snapshot、已有 editor 的 Session 重试不卸载、HTTP 502 下 SQLite 重启、Push-before-Pull 和错误页重试恢复。

Visual QA 使用 Playwright（Browser plugin not available），在 `http://localhost:7173` 实际 API 不可用且 proxy 返回 502 时复核 `/#/app`、已有快照的 Page Editor、无身份连接状态；1366×900 与 390×844 无横向溢出、Vite overlay 或页面运行时异常。截图保存在仓库外。独立 review 发现并修复“离线身份无 Workspace metadata 时主重试按钮不请求服务”的缺口，复核后无剩余 blocker。Mobile WebView 仍复用 Web/IndexedDB，原生宿主真机边界继续保留如下限制。

已通过 contracts typecheck、storage test/typecheck、SDK test/build、API domain/HTTP 集成与 build、Desktop test/build，以及 Web build。`pnpm --filter @eotion/web test:product` 55/55，`test:storage` 9/9。其中真实 Electron 窗口经 SQLite preload 完成离线编辑、建页、关闭/重启和重连 Push→Pull；该 Electron 测试使用可控 API 响应。独立 review 发现并修复了活跃编辑器回拉、离线应用外壳、清空已有页面的空段落保存及同步刷新引起的 Tiptap 重建。

`pnpm --filter @eotion/web test:real-sync` 使用本机 Mongo replica set、Nest API 和生产 Web 构建，以两个独立 Chrome context 验证注册登录、Page/Block 创建与同步、第二客户端读取、完全断网 reload 后继续编辑、重连、同页正文回拉、远端 Page 删除收敛，以及 390×844 无横向溢出，1/1 通过。`pnpm --filter @eotion/web test:offline-shell` 以独立持久浏览器 profile 验证完全断网 reload 和浏览器进程重启后从 Service Worker 加载应用，1/1 通过。模拟的 `product-sync.spec.ts` 另覆盖 401、503、跨账号队列与失败 Push 停止 Pull。

**未完成的真实环境验收：** 默认 LAN HTTP 的 Mobile WebView 真机完全断网重启。浏览器中 `eotionRuntime=mobile-webview` 的正式产品 IndexedDB 路径已有自动测试，但不替代目标 Lynx 宿主真机结果。在上述真机边界确认前不声明完整 P5.4 PASS。

### Final Mobile Device Checklist — MANUAL CHECK REQUIRED

必须在正式 Mobile WebView/Lynx 宿主及持久稳定的 origin/storage partition 上执行，记录设备、宿主版本、origin、时间、Page ID 和最终结果。默认 LAN HTTP 若在完全断网重启时无法加载应用壳，这属于当前部署边界，不能据浏览器离线测试判为通过；本轮不调整 mobile packaging。

1. 在正式 Mobile WebView 打开已有 Page，确认本地 snapshot 已存在。
2. 完全断网，关闭或 kill Mobile host，再重启宿主。
3. 保持断网，打开原 Page，确认原内容仍存在。
4. 离线修改正文，再次 kill / restart，确认修改仍存在。
5. 恢复网络，确认 pending operation 成功 push，状态转为“已同步”。
6. 在第二客户端读取并确认最终内容。

只有上述链路的真机证据完成后，才能将 P5.4 Mobile WebView real offline restart 标为 PASS。

## Production Electron closeout C — 2026-10-03

真实 `electron-vite build` 后直接启动 `out/main/index.js`，无 `ELECTRON_RENDERER_URL`；隔离 Mongo replica set + `NODE_ENV=production` Nest API + HTTPS 测试入口，生产验收 1/1 通过。UI/静态资源全部来自 bundled renderer，网络 renderer asset 请求数为 0。登录与 `/auth/me`、Workspace/Page、正文 SQLite 写入和同步、正常关闭/重启后的 Session 与正文恢复通过。

关闭 HTTPS listener 产生明确 `ECONNREFUSED`，离线编辑写入 SQLite/oplog 后 kill；API 保持不可达重新启动，正文恢复且继续离线编辑通过。恢复 listener 后 pending Push→Pull、队列清零、“已同步”及第二个独立 Electron profile 登录读取最终正文通过。最终运行观测到 6 次 sync Push、7 次 snapshot Pull；所有 sync 写请求的 Origin 为配置的 API origin。真实 opaque-origin 子窗口的 logout 请求被主进程拒绝，未到达 API。协议/SQLite 单测 16/16、Desktop typecheck/build、既有 Desktop storage/product-sync 3/3、Web typecheck/build、Web offline-shell 1/1 均通过；独立 review 无剩余 P1/P2。

对照的 built `file://` UI 绝对 HTTPS 登录返回 201，但后续 credentialed `/auth/me` 返回 401，不能只靠绝对 `VITE_API_BASE_URL` 建立可靠 Session。生产采用同源 HTTPS protocol，配置与安全模型见 [Desktop production](runbooks/desktop-production.md)。本轮关闭 Production Electron connectivity blocker；API unavailable 测试不替代人工断开全部网络接口。HTTPS 使用三天有效 localhost fixture，仅测试 Electron 对该证书的精确 SPKI 例外，未更改生产 TLS 校验或系统 trust store。部署需提供正常受信任的 HTTPS API 和明确 origin。Mobile 真机边界不在本轮范围。
