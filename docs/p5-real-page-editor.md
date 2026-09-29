# P5.3 Real Page Editor

正式 `PageView` 使用与 P2 Demo 相同的 `EotionEditor`（Tiptap 3、StarterKit、Slash 与触摸工具栏）。P2 的输入、选区、长按、可视视口和 5,000 块观测仍在开发页；正式页面只显示标题、保存状态和正文。

## Editor ↔ Block

一个 Tiptap 顶层节点对应一个 Eotion Block。当前映射：`paragraph`、`heading`、`bulletList`、`orderedList`、`blockquote`、`codeBlock`、`horizontalRule` 分别对应 `paragraph`、`heading`、`bulleted-list`、`numbered-list`、`quote`、`code`、`divider`。`image` 与 `todo` 留待后续阶段。服务端 Block 的 `props` 格式为 `{ "node": <Tiptap JSONContent> }`，保存节点结构和 marks，不保存 selection、UI 或诊断状态。遇到不支持的 Block 类型、子 Block、未知节点或 props 时，页面停止进入编辑态并显示错误，避免覆盖原数据。

顶层节点通过 `BlockIdentity` Tiptap 扩展持有 `blockId`。初次创建、分割或粘贴产生缺失/重复 ID 时用 `createLocalId()` 补齐。ID 不渲染到 HTML/剪贴板，跨页面粘贴会获得新 ID。扩展只在缺失/重复时追加一次 ProseMirror transaction；顶层 Block ID 不按数组位置推导，保存 props 时移除身份属性。该 transaction 不直接调用 HTTP，持久化层只对语义快照做 diff。

Block 顺序沿用服务端 `orderKey`。现有顺序不变时保留原 key，包括旧合法 key。新块优先在前后固定宽度十进制 BigInt key 之间分配；无间隙或旧 key 与新格式混排时按当前顶层顺序重新分配。普通文本输入不会重排全页。

## 保存与错误

`PagePersistence` 是编辑器与 `@eotion/sdk` 之间的 server-backed 边界：加载 Block 列表形成服务端基线；编辑后的顶层节点与基线按稳定 ID 比较，依次执行必要的 create、update、delete。500 ms debounce；一次只运行一个保存循环，保存中再次编辑会在前一次完成后继续处理最新快照。每个成功请求后更新基线；若写入响应丢失，重试前按 Block ID 读取服务端状态并校准基线，不覆盖当前编辑内容。初次加载、空页面的空 paragraph 均不写服务器；已有 Block 清空后保留为合法空 paragraph。

中文组合输入期间暂停 debounce/flush，`compositionend` 后按普通流程保存。切换路由前 flush；保存失败阻止离开并保留当前编辑内容，页面显示错误与重试入口。Page load 使用 workspace/page 身份、epoch 和 AbortController，晚到的旧响应无法覆盖新页面。浏览器 reload/关闭时若仍有未保存内容或在途保存，触发浏览器原生离开确认。Page 删除及退出登录前也先 flush 当前正文。

Block 列表加载失败会显示错误和重试，不展示可编辑的空页。任一产品 API 请求遇到 401 时，当前未保存正文在浏览器内存暂存，Session 失效流程引导用户重新登录；同一账号返回原页面后继续保存。内存暂存期间刷新/关闭浏览器会提示用户，浏览器进程关闭后不保证恢复。产品当前没有离线持久化保证。

## HTTP 与阶段边界

P5.3 增加 `DELETE /api/workspaces/:workspaceId/pages/:pageId/blocks/:blockId`，执行 Session、owner、workspace/page scope 检查；缺失 Block 为 404，有子 Block 拒绝删除。Sync 的 `block.delete` 缺失目标仍为幂等成功。SDK 增加 `blocks.delete`。

P5.3 仍以 Server 为正文来源。没有把 P3 LocalStore mutation/oplog、`reconnectPending` 或本地 snapshot hydration 接入产品；正式本地优先与多设备收敛属于 P5.4。

## 验证

本次通过：Web `test:product` 44/44（包含正式编辑器、P2 5,000 块/Slash/撤销回归）、`test:storage` 7/7、safe-area 2/2、Web 与 Desktop build；API `test:domain` 2/2、`test:http` 的 HTTP 1/1 + Sync 1/1 + File 22/22、API build；SDK test 10/10 与 build；`git diff --check`。

真实链路使用本机 Mongo replica set、Nest API 与 Vite Web（独立测试数据库及端口），在 Chromium 浏览器中完成注册登录、建 Workspace/Page、正文保存与 reload、新增及删除 Block、A/B 页面隔离和 390×844 横向溢出检查，均通过。该浏览器验收没有替代 Electron 原生窗口或移动真机验收。P2 真机结论仍以 [P2 编辑器演示](p2-editor-demo.md)中既有记录为准，本阶段的浏览器组合事件测试不等同于真实中文输入法验证。
