# P4.5 File metadata / object lifecycle

Eotion 通过 authenticated workspace HTTP API 管理文件元数据。二进制数据由 `apps/api` 经 `@ali-oss-server/sdk@1.1.0` 发送给独立的 ali-oss-server，再写入 OSS。MongoDB 的 `files` 集合只保存元数据，不保存文件内容。Web、Mobile WebView、Electron renderer 和 `@eotion/sdk` 不依赖 ali-oss-server SDK。

## HTTP 与 ownership

所有路由均位于 `/api/workspaces/:workspaceId/files`，需要有效的 Eotion Session，沿用 workspace owner-only 权限。跨用户访问继续返回 404。`POST /` 上传，`GET /` 列表，`GET /:fileId` 读取，`PATCH /:fileId` 仅重命名，`DELETE /:fileId` 删除对象和元数据。

上传请求体是原始 `application/octet-stream`；`X-Eotion-File-Id`、`X-Eotion-File-Name` 的值由 `encodeURIComponent` 编码。浏览器 SDK 的 `files.upload(workspaceId, fileId, file, signal?)` 直接将 `File` 作为请求体，服务端按收到的流计数和限制大小。文件 ID 和名称由客户端提供；`workspaceId` 来自路由，`ownerId` 来自 Session，`mimeType` 在本阶段由服务端固定为 `application/octet-stream`（不信任浏览器声明的类型），`size` 来自服务端实际读取字节数，`objectKey` 与 `url` 来自 ali-oss-server SDK 返回结果。客户端不能在 DTO 中指定归属、大小、对象键或 URL。PATCH 只接受 `name`。

`@eotion/sdk` 提供 `files.upload/list/get/update/delete`。沿用 `credentials: include`、`AbortSignal` 和 `ApiError`。API 将请求体提前中断或响应连接关闭转换为上传 `AbortSignal`，经 File service 和 object storage adapter 传给 ali-oss-server SDK；SDK 取消上游请求并销毁输入流。真实文件名也传给 SDK，由其处理 ASCII 或 Unicode 文件名请求头。SDK 内无 Node-only OSS 代码或 Eotion 之外的 token 管理。

## 对象键与失败边界

服务端请求的对象键使用 Eotion、workspace、file namespace，加每次上传独立 UUID。Workspace/File ID 在对象键中采用固定长度安全编码，避免 `/`、`.`、`..` 或过长 ID 破坏对象键。ali-oss-server 通常会在请求键前加其 `clientId` 目录；若请求键首段已等于 `clientId`，它不会重复添加。即使文件同名、重复 ID 或并发上传，实际对象键也不同。持久化键以 SDK 返回的 `objectKey` 为准。上传成功而 Mongo create 失败时，Eotion 只针对该次 SDK 返回的键做 best-effort 删除；清理失败会被报告，错误不会把 secret、Bearer token 或 SDK 原始响应传给客户端。

删除先调用 OSS，再按本次读取的 `objectKey` 条件删除 Mongo metadata，避免交错请求误删同 fileId 的新对象。OSS 删除失败时元数据保留。ali-oss-server 1.1.0 契约规定缺失对象的删除可安全重试，条件是期间没有重新上传同一对象键；版本化 bucket 还可能产生额外 delete marker。因此若 OSS 已删除但 Mongo 删除失败，后续可针对同一对象键重试。未知 OSS 错误不能直接当作已删除。OSS 与 Mongo 没有跨系统事务：上传成功后若 Mongo 创建抛错，服务端先回读确认是否已经持久化；能确认未写入时只清理本次对象，结果无法确认时保留对象并报告错误。网络失败时若上传实际成功但 SDK 未返回对象键，Eotion 无法安全定位对象进行补偿，这需要服务端对象清理运维手段。

ali-oss-server 1.1.0 契约规定返回的 `url` 是稳定对象地址，并非临时签名 URL；本阶段持久化 SDK 返回的 `url`。该地址的可访问性仍取决于 OSS bucket 权限。Eotion 不生成 signed URL。

## 配置与验证

只在 `apps/api` 配置 `ALI_OSS_SERVER_URL`、`ALI_OSS_CLIENT_ID`、`ALI_OSS_CLIENT_SECRET`。可选 `ALI_OSS_OBJECT_PREFIX` 和 `ALI_OSS_MAX_UPLOAD_BYTES` 控制 namespace 和上传上限。未配置 OSS 时 File 操作明确失败；health、Workspace/Page/Block 与 sync 继续启动和运行。标准集成测试使用 fake ali-oss-server HTTP server，但 Eotion 仍调用真实 `@ali-oss-server/sdk@1.1.0`；测试不需要真实 Aliyun OSS。

P5 附件 UI、Tiptap 扩展、离线二进制同步、file oplog、图片处理及 signed URL 系统不属于本阶段。
