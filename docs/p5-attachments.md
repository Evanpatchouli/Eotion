# P5.5 Attachments

P5.5 Attachments：✅ PASS（2026-09-30）。正式 Page Editor 支持图片与普通文件。Web 是唯一主 UI；Electron 复用 renderer，Mobile 复用 WebView。产品版本保持 `0.0.1 / build 1`。本阶段不声明 P5 Final Acceptance。

## 数据与编辑器契约

一个附件对应一个顶层 Block 和独立的 File。`image` → `eotionImage`，`file` → `eotionFile`；`props` 保持 `{ node: { type, attrs } }`。附件 attrs 严格限定为 `fileId`、`name`、`mimeType`、`size`、`url`，正文不保存 Blob、Base64、object URL、上传状态、OSS objectKey 或凭据。URL 仅允许无用户名/密码的 HTTP(S)，size 为非负安全整数。未知 attrs、附件子节点/marks、重复 fileId 拒绝进入编辑态或保存，避免覆盖数据。

BlockIdentity 延续稳定 blockId，持久化时移除该身份属性。附件不从 HTML 剪贴板解析，不能通过复制/粘贴生成共用 File 引用。删除附件是永久释放文件的操作：编辑器历史不会恢复已释放的 fileId，普通正文 undo/redo 继续可用。顶层 todo 沿用领域类型，由 `eotionTodo` 映射 checked 与 inline 正文。

## 上传与 UX

工具栏、Slash 的 Image/File、纯文件 drop 和纯图片 paste 共用一个上传入口；混合正文/HTML paste 沿用文本编辑流程。临时占位在正文之外显示文件名、可用的本地图片预览、上传中、保存中、失败、取消与重试状态。对象 URL 在取消、成功或卸载时释放。图片支持 PNG/JPEG/WebP/GIF/AVIF；服务端认定的其它格式显示文件卡片。

流程为 `File → Eotion SDK raw upload → authenticated API → ali-oss-server SDK → object storage → Mongo File metadata → Tiptap node → LocalStore Block/oplog → P5.4 sync`。服务端成功后等待中文组合输入结束，再插入节点；确认附件 Block 已本地持久化后才显示成功。上传成功但本地保存失败时移除该节点并记录补偿。重试沿用 UI 占位，但使用新 fileId，避免旧补偿 DELETE 删除新附件。进入本地保存阶段后不再显示取消按钮；组件卸载仍以 epoch/AbortSignal 隔离旧异步结果。

图片提供 inline 预览、加载状态、错误 fallback、文件名 alt/caption 和新窗口打开。文件卡片显示文件名、类型标签、大小和安全新窗口链接；长名省略，菜单提供产品内删除确认。菜单不依赖 hover，内部图标点击不会落入 ProseMirror 节点选择逻辑。

## Local-first 与清理

正文继续使用 P5.4 LocalStore/oplog，二进制只在线上传；离线不产生虚假成功或 Blob 同步。IndexedDB 升级至 v2，保留既有内容/oplog 并增加 cleanup store；Electron SQLite 增加 cleanup table，经类型化 preload/IPC 使用同一 LocalStore 契约。

删除 image/file Block、替换附件引用或删除 leaf Page 时，在内容/oplog 同一事务中收集旧 fileId，并写入 `{workspaceId,fileId,createdAt,sourceOperationId,lastError?}` 清理任务。Page 删除在级联前枚举全部附件。补偿上传任务无需 sourceOperationId。任务按 workspace/file 去重；snapshot replace 保留队列，clearAll 同时清除队列。

清理须满足 source operation 已 synced、当前 workspace 无 Block 引用该 fileId、当前账号经最新服务端列表授权。执行 DELETE 前再次 flush 活跃编辑器并检查 pending operations/引用；不会先删远端对象再等待正文删除同步。成功或 404 完成任务；其它失败持久保留并提示，自动重试至少间隔 30 秒，用户可手动重试。401 结束会话，不使用旧账号授权发送队列。

补偿意图若暂时无法落盘，保存在跨组件内存队列，页面/常驻 Shell 提供重试记录入口，导航和 beforeunload 防止静默丢失。浏览器强制终止且 adapter 始终无法写入时，内存意图不能保证恢复。

## MIME、安全与服务端 lifecycle

请求仍是原始 `application/octet-stream`；SDK 增加编码后的 `X-Eotion-File-Mime-Type` 提示，服务端不据此信任内容。服务端读取最多 512 字节前缀识别 PNG/JPEG/WebP/GIF/AVIF，并重放前缀继续流式传输。只有识别出的安全图片 MIME 持久化；SVG、HTML、伪图片和其它未知内容统一 `application/octet-stream`。size 由实际流计数，默认上限 20 MiB；不整文件缓存。abort/超限/上游失败销毁输入流。

同一 API 进程中的 DELETE 等待同 workspace/file 的在途上传完成，防止取消补偿先返回 404、上传随后创建 metadata。已确认 OSS key 的取消先确保 metadata 可定位，再按对象→metadata 顺序删除；对象删除失败保留 metadata 供队列重试。只有确认对象不存在时，等待后的无 metadata 才视为成功。Mongo 创建结果不明时回读确认，避免误删已经提交的对象。OSS/Mongo 仍无跨系统事务；上游响应丢失且 SDK 未返回 objectKey 时不能安全定位对象，需要运维清理。进程内等待不提供多 API 实例协调。

## 图标与响应式

`EotionIcon.vue` 封装 `morphicons/vue`，节点来自 `lucide` data package。统一 currentColor、stroke 1.75、16/18/20/24 尺寸、snappy 动效和 `reducedMotion="user"`。系统图标覆盖 Shell 导航、工作区、页面树操作、空态、Slash、上传、文件和菜单；用户配置的页面 icon 与品牌图保留。装饰图标隐藏于辅助技术，icon-only 按钮提供 aria-label；移动端附件操作目标至少 44px。

## 验收与边界

自动测试不依赖线上阿里云账户。真实集成使用隔离 Mongo replica set、Nest API、生产 Web、真实 ali-oss-server SDK 和受控 OSS HTTP server；两个浏览器上下文验证上传、刷新、跨客户端、正文离线恢复、删除失败重试与 Page 附件级联清理。Desktop 1440×900、Tablet 820×1180、Mobile 390×844 的正式路由截图保存于仓库外并人工检查。

自动验证结果（2026-09-30）：

| 命令 | 结果 |
| --- | --- |
| `pnpm version:check` | 8 packages 一致，0.0.1 / build 1 |
| domain/contracts/storage typecheck；SDK build | 通过 |
| storage test；SDK test | 6/6；14/14 |
| API typecheck/build；test:domain；test:http | 通过；2/2；24/24 |
| Web typecheck/build；test:product | 通过；72/72（附件 15 项） |
| Web test:storage | 10/10，含 IndexedDB 升级和真实 Electron SQLite/重启同步 |
| Web test:real-sync | 1/1，真实 Mongo/API/生产 Web/SDK，受控 OSS |
| Desktop typecheck/build；Mobile build | 通过 |
| `git diff --check` | 通过 |

独立 GPT-6.1 Sol review 的已确认 blocker 均已修复；复验正文 undo/redo、附件不恢复、选择事件无 pageerror、Mongo 写入期间取消及首次对象删除失败后的补偿，未发现剩余确定 P1/P2 blocker。

已部署 ali-oss-server / Aliyun OSS 的最小真实验收通过：生产 Web 的两个独立浏览器上下文上传 1200×720 PNG（6549 B）与普通文件（27 B），Mongo metadata 分别为 `image/png` 与 `application/octet-stream`；刷新与第二客户端均可读取附件，图片 naturalWidth 为 1200；两个 OSS URL 返回 200 且字节一致。正式 UI 删除后两个客户端无附件，metadata GET 为 404、文件列表为 0；另行读取两个已删除 OSS URL 均为 404。测试对象与隔离数据库已清理，没有修改生产 Mongo 或 OSS 配置。

Desktop / Tablet / Mobile 截图人工复核通过：图标尺寸与居中一致，中性色 hover，图片不失真，file card 与正文间距清楚，文件名截断，触摸操作至少 44px，390px 无页面横向溢出。截图不纳入 Git。自动 real-sync 的输出目录默认是系统临时目录 `eotion-p55-visual-qa`，可通过 `EOTION_VISUAL_QA_DIR` 指定仓库外路径。

已部署 OSS 的对象响应头可能使原图新窗口链接触发下载；inline 图片仍正常显示。URL 可访问性由 bucket 权限控制，不增加 signed URL。原生 HAP/APK/IPA、移动真机中文输入法与 WebView 宿主离线重启仍属于既有 P5.4 设备验收，不以浏览器测试替代。不实现离线二进制同步、共用 File、CRDT、图片处理服务或附件管理器。
