# P7 Advanced Blocks

P7 在 P5 编辑器与 P6 MCP 之上补齐 Advanced Blocks 基础。本轮只落在 P7.1 Block Model Foundation：把 Block 类型/能力与嵌套树不变量收敛到 domain 的单一来源，并把它接入已有的 sync、local-first、编辑器与 MCP 链路。本页记录已完成的实现与验证命令，最终验收由主 Agent 判定。

| 阶段 | 范围 | 状态 |
| --- | --- | --- |
| P7.1 Block Model Foundation | block registry、block tree invariant、move/reparent、snapshot 校验、Toggle 验证 | 本阶段完成 |
| P7.2 Rich Blocks | Callout 等更丰富区块 | 待开始 |
| P7.3 Nested Blocks UX | 拖拽嵌套、Tab/Shift+Tab 缩进、更完整键盘语义 | 待开始 |
| P7.4 Table | Table 区块 | 待开始 |
| P7.5 Advanced Blocks Acceptance | 最终验收 | 待开始 |

## P7.1 Block model 收敛

`packages/domain/src/block-types.ts` 现在是 Block 类型与能力的唯一来源，包含：

- `BLOCK_TYPES`：paragraph、heading、bulleted-list、numbered-list、todo、quote、code、image、file、divider、toggle。
- `BLOCK_NODE_TYPES`：block type 与 editor node 名称的映射，例如 toggle ↔ `eotionToggle`。
- `BLOCK_CAPABILITIES`：`hasText`、`allowsChildren`、`allowedChildTypes`、`slash`、`mcp.readable`、`mcp.writable`、`attachment`。
- `EDITOR_NODE_RULES`：节点级 attrs 与 allowed children，含 text、hardBreak、listItem。
- `BLOCK_COMMANDS`：slash 菜单条目。

以下位置共用同一张表，不再各自维护 nodeType / attrs / children 副本：

- `apps/web/src/editor/blockCodec.ts`：可编辑性校验。
- `apps/api/src/modules/mcp/mcp-read.contract.ts`：MCP 读取校验。
- `apps/web/src/editor/slashCommand.ts`：slash 菜单由 `BLOCK_COMMANDS` 派生。

`BLOCK_TYPES` 追加 toggle 属于向后兼容的加性扩展：Mongo schema enum 与 contracts 的 `BlockTypeSchema` 自动放宽，旧数据仍然合法。

## Nested block 基础模型

嵌套复用既有 `parentBlockId` 字段，没有引入新模型；页面树与区块树同构。

新增 `packages/domain/src/block-tree.ts`，纯函数、零运行时依赖：

- `parentOf` / `parentRejection` / `parentRejectionMessage`
- `validateBlockTree`
- `descendantIds` / `buildBlockTree` / `flattenBlockTree`
- `blockDepthMap` / `orderForDeletion`

不变量：

- 禁止 self-parent。
- parent 必须同 page、同 workspace。
- 禁止 cycle。
- 顺序仍由 `orderKey` 表达，且每个 sibling 组独立分配；`packages/domain/src/order.ts` 新增 `assignBlockTreeOrder`，它按 `parentBlockId` 分组，组内沿用原 `assignBlockOrder` 的稳定 key 策略。

不变量落在 domain/service 层，不在 UI：

- `LocalStore` / `SqliteLocalStore` 的 `upsertBlock` 中 parent 不可变，reparent 只能通过新的 `moveBlock`。
- `BlockService.create` / `move` 与两个本地 store 的 `upsertBlock` / `moveBlock` 统一用 `isAllowedChildBlockType(parentType, childType)` 校验；不允许 children 的父类型在本地就会被拒绝，不必等到同步到服务端。
- `SyncService` 新增 `block.move` 操作。
- 读取路径 fail-closed：`blocksToDocument` 对重复 id 或无法从根到达的环（unreachable cycle）直接拒绝加载，而不是把它当成空页；`toMcpBlocks` 对同样情况抛错，不会返回不完整的结果。

## Sync / local-first

- contracts 新增 sync operation kind `block.move`，payload 为 `{ id, pageId, parentBlockId, orderKey }`。
- `LocalStore` 新增 `moveBlock(workspaceId, id, parentBlockId, orderKey)`；它与内容改动在同一事务内写入恰好一条 `block.move`。IndexedDB（`apps/web/src/storage/indexedDbStore.ts`）、SQLite（`apps/desktop/src/main/sqlite-store.ts`）与 Electron preload/main bridge 均已实现。
- `validateWorkspaceSnapshot` 现在复用 domain 的 `validateBlockTree`，snapshot 落盘前拒绝 self-parent / 缺失 parent / 跨 page parent / cycle。
- `PagePersistence`：按 sibling 组分配 orderKey；parent 变化生成 `block.move`；删除按「子先于父」排序（`orderForDeletion`），避免父删除先于子删除导致失败或产生 orphan。
- 编辑器与存储之间不会出现：parent 丢失、child 变 root、顺序漂移、cycle、跨 page orphan。
- `packages/domain` 的 `./block-tree` 子路径导出带 `node` 条件指向 `dist`：Node（storage 测试）解析编译产物，而 Vite/electron-vite 通过 `import` 条件直接读取源码，因此 `pnpm dev:web` 不需要先构建 domain。

## Editor

- 新增 EotionToggle 节点（`apps/web/src/editor/toggleNodes.ts`，content 为注册表区块集合的 `(a | b | ...)+`）与 `ToggleNodeView.vue`：chevron 展开/折叠、summary 即自身文本、child 为独立区块并缩进显示。
- 折叠状态是本地 UI 偏好（`apps/web/src/editor/togglePreference.ts`，localStorage key `eotion:collapsed-toggles`），不进入 props，也不是核心正文数据。
- `BlockIdentity` 为根区块与 toggle 子区块分配稳定 `blockId`；身份继承在重叠范围中优先选择与旧节点同类型的范围，避免 child-owning 父块把 id 让给第一个子节点。其余嵌套内容（quote/list 内部）仍属于父区块内容，不单独成为区块。
- toggle 的 summary 必须是「不拥有子区块」的节点；若编辑器把 child-owning 节点放在 summary 位置，codec 会补一个空 summary 段落，并把该节点提升为真实子区块，保证其子内容留在 block 树里。
- Slash 菜单由注册表派生，新增「折叠列表」条目。保持 Quiet Studio 与 740px 阅读列，没有重做编辑器 UI；桌面与移动端都可折叠。

已知编辑体验事实（记录为已知限制，未在本轮修复）：

- 把已有段落转成 Toggle 会走一次 block 重建：旧段落 block 被删除、新的 toggle block 被创建。
- wrapIn 与 Quote 一样会留下一个尾部空段落区块。
- 只有顶层才支持附件插入：`attachmentNodes` / `uploadPlaceholders` / 编辑器事件仍只遍历顶层节点，toggle 子区块中的附件在 P7.3 前不会出现。

## MCP 兼容

- 没有新增 MCP tool。
- `mcp-read.contract.ts` 不再因 `parentBlockId` 抛错；读取结果按深度优先排序，并为每个 block 增加可选字段 `parentBlockId` 与 `depth`（加性扩展，旧消费者不受影响）；toggle 的 text 取其 summary 段落。
- MCP write 契约不含 toggle（`BLOCK_CAPABILITIES.toggle.mcp.writable === false`）；document mutation 遇到嵌套页面仍显式拒绝替换，P6 行为不变。

## 测试与验证

- packages/domain：新增 `test/block-model.test.cjs`，覆盖注册表一致性、树重建顺序、self / missing / cross-page / cycle / 重复 id 拒绝、删除顺序、按组分配 orderKey、child 类型白名单。
- apps/web：新增 `tests/product-blocks.spec.ts`（已加入 `test:product`），覆盖 toggle 创建 / 嵌套 / reload / 折叠 / 清理流程、嵌套编辑后的 block 身份稳定、IndexedDB `moveBlock` 与父类型 invariant、blockCodec 嵌套 round-trip、leaf 节点不被注入 content、不可达环拒绝加载、summary 归一化。
- apps/api：`server-domain.test.ts` 增加 move 与 parent 类型 invariant；`mcp-read.contract.test.ts` 增加 nested 深度优先读取与不可达环 fail-closed。

验证命令：

```bash
pnpm --filter @eotion/domain test
pnpm --filter @eotion/storage test
pnpm typecheck
pnpm build:web
pnpm build:api
pnpm --filter @eotion/api test:domain
pnpm --filter @eotion/api test:mcp
pnpm --filter @eotion/web run test:product
pnpm --filter @eotion/web run test:storage
```

本环境默认多 worker 运行 `test:product` 时偶发与改动无关的 UI 超时；需要确定性结果时改用 `--workers=1`。运行 `test:storage` 前需清除本沙箱默认设置的 `ELECTRON_RUN_AS_NODE`，否则 Electron 用例会报 `Process failed to launch`。

## 明确不在 P7.x 范围

Database / Database View / Relation / Rollup / Formula / Notion Import / Agent UI / Automation / 新 MCP Tools / 完整 block plugin framework / 大规模 editor 重构。
