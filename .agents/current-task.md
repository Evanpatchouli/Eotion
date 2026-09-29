# Current Task — P5.2 Page Tree

## 范围

在 P5.1 产品 Shell 上把侧栏 Pages 占位替换为真实页面树，打通页面生命周期：创建根页面 / 子页面、打开页面、重命名、移动、删除、当前页面高亮、工作区隔离与 URL 刷新恢复。服务端补充独立的 move / delete 入口。

非目标：P5.3 正式编辑器（Tiptap 接入）、Block 产品 UI、LocalStore 接线与自动保存、P5.4 产品 Sync、离线编辑、P5.5 附件、拖拽排序与动画、CRDT、多人协作、搜索、收藏、权限体系。

## 结果

**P5.2 PASS / 可以进入 P5.3 Real Page Editor。**

- 路由：新增 `/#/app/:workspaceId/page/:pageId`，`/#/app/:workspaceId` 保持 Workspace Home。刷新可恢复工作区、页面树与选中页面；页面不存在或不属于当前工作区时显示“无法打开这个页面”及返回入口，不白屏。
- 页面树：由工作区页面列表构建，`parentPageId` 为 `null` 的是根页面，同级按 `orderKey`（相同则 `id`）稳定排序；父级引用缺失或自引用时按根页面处理。支持展开 / 折叠、当前页面高亮、页面菜单（新建子页面 / 重命名 / 移动 / 删除），选中时自动展开祖先。
- 创建：侧栏“＋”建根页面，页面菜单建子页面；标题默认 `无标题`，`id` 继续由客户端 `createLocalId()` 生成，`orderKey` 用固定 16 位零填充的“同级最大值 + 1”，未引入 fractional indexing 依赖。成功后立即入树并自动打开。
- 重命名：复用 `PATCH /pages/:pageId`，trim、空标题禁止、与当前标题相同禁止、pending 去重、失败可见错误与重试；成功后侧栏、主标题与面包屑同步，刷新后一致。
- 移动：新增 `PATCH /api/workspaces/:workspaceId/pages/:pageId/move`，体为 `{ parentPageId: string | null, orderKey: string }`。服务端强制“不能移动到自己 / 不能移动到后代 / 不能跨工作区 / 父级必须存在”；通用更新入口仍然拒绝 `parentPageId`。UI 提供菜单 + 选择器，不实现拖拽排序。
- 删除：新增 `DELETE /api/workspaces/:workspaceId/pages/:pageId`，只允许删除叶子页面（先删区块再删页面，返回 `{ deleted: true }`）；有子页面时 400 `Delete child pages first`，不级联、不提升子页面。删除当前页面后回到父页面，根页面则回到 Workspace Home。
- 内容区只显示页面标题与 ID / 父页面 / 排序键占位，正文与自动保存留给 P5.3；没有接入 Tiptap。
- 组件与状态：新增 `stores/productPages.ts`（按工作区隔离、epoch 丢弃过期响应）、`utils/pageTree.ts`（纯函数）、`components/product/PageTree.vue`、`PageRenameForm.vue`、`PageMoveForm.vue`、`views/PageView.vue`；`ProductShell.vue` 只负责挂载与导航收口。

## 验收与验证

本轮执行的验证（未重跑 P1～P4 历史回归）：

- `pnpm --filter @eotion/web test:product`：22/22 PASS（`tests/product-flow.spec.ts` 10 + 新增 `tests/product-pages.spec.ts` 12）。新用例覆盖空树、创建根 / 子页面、层级与同级排序、展开折叠、打开页面、刷新恢复、重命名（trim / 空标题 / 相同标题 / pending / 失败 / 刷新后一致）、移动与移回根级、选择器排除自身与后代、服务端拒绝移动的可见错误、跨工作区隔离、删除叶子、有子页面时拒绝删除、删除当前页面后的路由恢复、页面树加载失败与重试、移动端打开页面后侧栏关闭。
- `pnpm --filter @eotion/api test:domain`：2/2 PASS。
- `pnpm --filter @eotion/api test:http`：22/22 PASS，包含 move / delete 的 401、成功、自父级 400、移入后代 400、未知父级 400、strict body 400、404 与重复删除 404。
- `pnpm --filter @eotion/sdk test`：9/9 PASS，新增 move / delete 路由与 `PageMoveRequestSchema` 覆盖。
- `pnpm --filter @eotion/web build`（含 `vue-tsc --noEmit`）：PASS。
- `pnpm --filter @eotion/api build`：PASS。
- `pnpm --filter @eotion/desktop build`：PASS。
- `git diff --check`：PASS。
- 根及 Web package 未定义 lint script，本轮没有可运行的 lint 命令。

过程中修正的问题：

- 产品 Shell 现在总会请求当前工作区页面列表，`tests/product-flow.spec.ts` 的受控 API 需要相应返回空列表，否则旧用例会额外出现一个页面树错误提示。
- `PageRenameForm` 与既有 `WorkspaceRenameForm` 对齐：标题与当前值相同时禁用提交，避免无意义请求。
- 测试中 `page.goto` 只改 hash 不会重载文档，需要显式 `reload()` 才能验证“重新加载页面列表失败”的时序；这是测试写法问题，不是产品缺陷。

## 文档与收尾

- 新增 `docs/p5-page-tree.md`；更新 `docs/roadmap.md`（P5.2 ✅）、`docs/README.md`、`docs/p5-product-shell.md`（路由与侧栏说明）、`docs/p4-http-api.md`（P5.2 move / delete 入口）、`docs/p4-server-domain.md`（移动走独立入口、通用 update 仍拒绝重挂）。
- 未执行 push 以外的任何远端操作；本轮不做真实设备 / Electron 原生窗口验收，桌面部分只验证 renderer build。
- 未在真实 MongoDB + 浏览器链路做手工验收；服务端语义由 domain / HTTP 测试覆盖，浏览器侧由受控 HTTP 响应覆盖。

## Commit

聚焦提交：`feat(p5): implement page tree`。

## 后续

下一阶段为 P5.3 Real Page Editor：把正文区域接入 Tiptap 3，建立 Page / Block 的服务端读写与自动保存。
