# P5.2 Page Tree

P5.2 用真实页面树替换 P5.1 侧栏中的 Pages 占位提示，接通“创建 / 打开 / 重命名 / 移动 / 删除”页面生命周期。正文编辑器不在本阶段，P5.3 再接入 Tiptap 3。

## 路由

| 路径 | 行为 |
| --- | --- |
| `/#/app/:workspaceId` | Workspace Home。刷新保留当前工作区。 |
| `/#/app/:workspaceId/page/:pageId` | 打开该工作区中的一个页面。刷新后恢复工作区、页面树与选中页面。 |

页面不属于当前工作区、已被删除或被其他用户持有时，主区域显示“无法打开这个页面”与返回工作区的入口，不出现白屏。页面列表加载失败时时序为“暂时无法加载页面 → 重试”。

## 页面树

- 数据来源是当前工作区的 `GET /api/workspaces/:workspaceId/pages`；侧栏不额外请求页面。
- `parentPageId` 为 `null` 的是根页面；同一父级下按 `orderKey` 升序排列，`orderKey` 相同时按 `id` 兜底，保证顺序稳定。父级引用缺失或指向自身时该页面按根页面处理，不会从树上消失。
- 侧栏支持展开 / 折叠、当前页面高亮（`aria-current="page"`）、以及由页面菜单触发的“新建子页面 / 重命名 / 移动 / 删除”。打开页面会在移动端自动关闭侧栏抽屉。
- 选中页面时自动展开其祖先，因此从 URL 直接进入深层页面仍能定位到该页面。

### 创建

- 侧栏“页面区域 +”创建根页面，页面菜单的“新建子页面”创建子页面。
- 标题默认 `无标题`；`id` 由客户端用既有 `createLocalId()` 生成，服务端不重新分配。
- `orderKey` 由 `nextOrderKey(siblings)` 生成：取同级最大数值 `orderKey` 加一，再零填充到 16 位，使字典序与数值序一致。不引入 fractional indexing 依赖。
- 成功后新页面立即出现在树上并自动打开。

### 重命名

- 走既有 `PATCH /api/workspaces/:workspaceId/pages/:pageId`（仅 `title`）。
- 标题 trim 后不能为空，也不能与当前标题相同（提交按钮保持禁用）；提交中禁止重复提交，失败时在表单内显示可见错误并允许重试。
- 成功后侧栏标题、主区域标题和面包屑同时更新，刷新后仍然一致。

### 移动

- 移动使用独立入口 `PATCH /api/workspaces/:workspaceId/pages/:pageId/move`，请求体为 `{ parentPageId: string | null, orderKey: string }`。选择器提供“根级”和当前工作区内除自身及其后代以外的页面；移动后 `orderKey` 取目标同级列表末尾。
- 服务端是唯一权威校验：拒绝把页面移动到自己（`A page cannot be its own parent`）、移动到自己的后代（`A page cannot be moved under its own descendant`）、移动到其他工作区或不存在的父级。通用更新入口继续拒绝 `parentPageId`，不会绕过这些校验。
- 本阶段不实现拖拽排序，只提供菜单 + 选择器。

### 删除

- `DELETE /api/workspaces/:workspaceId/pages/:pageId` 只删除叶子页面：先删该页区块再删页面，返回 `{ deleted: true }`。
- 有子页面时返回 400 `Delete child pages first`；不级联删除，也不把子页面提升到父级。删除前需要在页面菜单里二次确认。
- 删除当前打开的页面后，路由回到其父页面；没有父页面时回到 Workspace Home。刷新同样不会停在已删除页面。

## 状态与组件

- `stores/productPages.ts`（Pinia setup store，`product-pages`）持有单个工作区的页面列表与 loading / error / empty 以及 create / rename / move / delete 的 pending 与 error。切换工作区立即清空旧列表，并用请求 epoch 丢弃过期响应；任何变更都先确认仍属于当前工作区，避免跨工作区串数据。
- `utils/pageTree.ts` 是不依赖 Vue 的纯函数：`buildPageTree`、`flattenPageTree`、`nextOrderKey`、`collectSubtreeIds`。树在渲染前被压平成带 `depth` 的行列表，展开 / 折叠只是过滤，不使用递归组件。
- `components/product/PageTree.vue` 是与 `ProductShell.vue`、`WorkspaceSwitcher` 平级的侧栏区块，`PageRenameForm.vue` 与 `PageMoveForm.vue` 负责内联表单；`views/PageView.vue` 只显示标题与页面元信息占位，正文区域留给 P5.3。
- 401 会统一触发会话失效处理，回到登录流程。

## 验证入口

- 浏览器产品行为（含页面树）：`pnpm --filter @eotion/web test:product`。
- 服务端 move / delete 语义：`pnpm --filter @eotion/api test:domain` 与 `pnpm --filter @eotion/api test:http`。
- SDK 路由与 schema：`pnpm --filter @eotion/sdk test`。

覆盖范围包括空树、创建根 / 子页面、层级与同级排序、展开折叠、打开页面、刷新恢复、重命名（trim / 空标题 / pending / 失败 / 刷新后一致）、移动与移回根级、选中器排除自身与后代、服务端拒绝移动、跨工作区隔离、删除叶子、有子页面时拒绝删除、删除当前页面后的路由恢复、移动端打开页面后侧栏关闭，以及 move / delete 的 service 与 HTTP 测试。

## 未包含

P5.3 正式编辑器、Block 产品 UI、LocalStore 接线与自动保存、P5.4 sync 产品流程、离线编辑、P5.5 附件、拖拽排序与动画、搜索、收藏和权限体系都不在本阶段。
