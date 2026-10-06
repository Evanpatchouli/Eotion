# P7 Advanced Blocks

P7 在 P5 编辑器与 P6 MCP 之上补齐 Advanced Blocks 基础。P7.1 与 P7.2 已 PASS；P7.3 在既有 nested model 与 local-first/sync 链路上增加可操作的嵌套 UX。本页记录实现、验收结果与已知限制。

| 阶段 | 范围 | 状态 |
| --- | --- | --- |
| P7.1 Block Model Foundation | block registry、block tree invariant、move/reparent、snapshot 校验、Toggle 验证 | PASS |
| P7.2 Rich Blocks | Callout 与现有 Rich Block 保真收敛 | PASS |
| P7.3 Nested Blocks UX | 拖拽嵌套、Tab/Shift+Tab 缩进、移动端操作与上下文筛选 | PASS |
| P7.4 Table | Table 区块 | not started |
| P7.5 Advanced Blocks Acceptance | 最终验收 | not started |

## P7.1 Block model 收敛

`packages/domain/src/block-types.ts` 现在是 Block 类型与能力的唯一来源，包含：

- `BLOCK_TYPES`：paragraph、heading、bulleted-list、numbered-list、todo、quote、code、image、file、divider、toggle、callout。
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

已知编辑体验事实：

- 把已有段落转成 Toggle 会走一次 block 重建：旧段落 block 被删除、新的 toggle block 被创建。
- wrapIn 与 Quote 一样会留下一个尾部空段落区块。
- 附件上传目标与文件生命周期仍只遍历顶层节点；P7.3 保留顶层插入限制，并在 slash、picker、paste/drop 与移动操作入口阻止嵌套附件创建。

## MCP 兼容

- 没有新增 MCP tool。
- `mcp-read.contract.ts` 不再因 `parentBlockId` 抛错；读取结果按深度优先排序，并为每个 block 增加可选字段 `parentBlockId` 与 `depth`（加性扩展，旧消费者不受影响）；toggle 的 text 取其 summary 段落。
- MCP write 契约不含 toggle（`BLOCK_CAPABILITIES.toggle.mcp.writable === false`）；document mutation 遇到嵌套页面仍显式拒绝替换，P6 行为不变。

## P7.2 Rich Blocks

- Callout（`eotionCallout`）是单块 inline rich-text 正文，attrs 为 `icon` 与 `tone`（neutral / info / warning）；默认 💡 / neutral。它不拥有 child blocks，可作为 Toggle 的 child，关系仍由 `parentBlockId` 表达。
- Slash「提示块」创建；正文保留现有 marks/link/hardBreak，icon/tone 使用紧凑控件编辑。视觉复用 Quiet Studio；非空块 Enter 保留前段 Callout 并进入普通段落，空块 Enter 转段落；Shift+Enter 换行，块首 Backspace 转为普通段落。
- 五张 registry 表统一注册，类型 enum 自动进入 contracts/server；白名单与值校验共用 domain validator。LocalStore / server 改型拒绝不兼容的已有 children，snapshot / MCP 同样拒绝 leaf parent。Block ID、sibling orderKey 与 parentBlockId 沿用既有 codec/persistence，复用 create/update/move，无新 sync operation。
- MCP 现有 read/write 工具兼容 Callout，DTO 仅暴露 text/icon/tone，不暴露 Tiptap AST；显式正文重写沿用 P6 纯文本语义，未提供 blocks 的标题更新保留富文本；nested document replacement 仍保持 P6 限制。缺失 parent 的 MCP read conversion / get_page fail-closed，不将 child 提升为 root。
- 本轮不新增第二类型：details 与 Toggle 重复；bookmark 的 URL/标题/元数据需要独立需求定义。补现有 code language 属性保真回归，不为数量新增区块。
- 限制：Callout 不含子块或附件，不提供复杂主题、URL 预览、语法高亮；P7.4–P7.5 未开始。共享 Web renderer 覆盖 Desktop 与 Mobile layout，真实设备输入法/原生宿主验收不由本轮浏览器回归替代。

## P7.2 Final Acceptance

P7.2 于 2026-10-07 完成验收并 PASS（实现提交 `139a6ff`）。本轮只做验收收尾，不新增功能。

- 完整 product：`test:product` 共执行 3 次（默认多 worker 1 次、`--workers=1` 2 次），每次 173/175。失败项每次不同，且都落在与 Callout 无关的既有 UI 用例（toggle 清空、页面重命名、图片附件 reload、IME 草稿）；逐个单独复现全部通过。`product-attachments.spec.ts:147` 在干净基线 `c687f1d` 上同样失败（`https://objects.example.test/...` 未被 mock，图片 fallback 与 `<img>` 断言存在竞态），确认为既有环境 flaky，不是 P7.2 回归。
- P7.2 主文件 `tests/product-blocks.spec.ts` 加压 `--repeat-each=2`：24/24；`tests/product-attachments.spec.ts` 单独运行 23/23。
- visual：`test:visual` 为 6/7。唯一失败 `Connectivity backend unavailable desktop` 与干净基线 `c687f1d` 的像素差完全一致（21748 px，ratio 0.02）；该页面不含 Callout，属既有基线差异，不阻塞 P7.2。
- Callout 四组合渲染核查（临时只读脚本，用后删除）：1440×900 与 390×844 × Light/Dark 均正常，无横向溢出；neutral / info / warning 三种 tone、icon、粗体与链接、硬换行、Toggle 内嵌 Callout 均正确。
- 回归：domain 11/11、contracts 6/6、storage 7/7、API domain 2/2、HTTP 26/26、MCP 21/21、Electron storage 11/11、`pnpm typecheck`、`build:web`、`build:api`、`git diff --check` 全部通过。仓库无 lint 脚本，N/A。
- 独立只读 review：无 blocker。记录两个 minor，均为既有同类问题且非本轮引入：blockquote 内可经 slash 创建 Callout 等 block 级块，但 `EDITOR_NODE_RULES.blockquote.children` 与 codec schema 不接受保存（静态审查发现，未在浏览器复现）；`hardBreak` 携带 marks 时 blockCodec 与 domain 校验不对称（可达性未证明）。

## P7.3 Nested Blocks UX

- `nestedBlockInteractions.ts` 通过单个 ProseMirror transaction 移动完整区块与子树，保留 blockId、正文、选区与 undo/redo；由既有 `PagePersistence → LocalStore.moveBlock → block.move → sync` 保存。同级 orderKey 变化也走 move，而非 upsert。order allocator 保留旧 key 的最长递增链，在有 gap 时仅为移动块分配 key；1000 块末块移到页首回归仅变更一个 key，避免级联产生大量 move。
- 块首折叠光标或区块 NodeSelection 使用 Tab 缩进到前一个允许 children 的 sibling，Shift+Tab 外移到 parent 后。Toggle summary 块首操作移动整个 Toggle 子树。文本中段、代码和列表内部不拦截 Tab。拖动把手支持目标前/后重排与 Toggle 内嵌；拒绝 self/descendant、跨编辑器、leaf parent 与超过 8 的嵌套深度（root 为 0，包含被移动子树深度）。
- 移动端 Touch Toolbar 增加缩进/取消缩进操作，复用同一移动语义，无触屏拖拽依赖。
- 拖拽高亮由插件 meta 与 `Decoration.node` 管理，不手工改写 ProseMirror 正文 DOM，避免 DOMObserver 重绘正在拖动的源把手。把手装饰不参与正文布局或文本，移动端隐藏把手并使用 Touch Toolbar。
- `blockCommandContext.ts` 以 registry 的 command type、`allowedChildTypes` 与 `EDITOR_NODE_RULES` 筛选 slash，并在执行时重新检查。quote/list 内部只能创建 codec 接受的节点；Toggle summary 不创建 child-owning 节点。禁止会跨结构或吞掉已有子树的变换。
- Child attachment 边界：模型/schema/snapshot/MCP 能读取嵌套附件，但上传目标、撤销释放与 cleanup 尚未递归化，因此本轮保持 UI 创建限制。nested slash 不显示图片/文件，picker/paste/drop 与附件移动入口拒绝嵌套；不修改 registry 的既有读取能力，不新增 MCP tool。MCP nested document replacement 仍显式拒绝。附件不参与块级拖拽（顶层附件也不会被本轮的块拖拽接管），保持既有顶层生命周期语义。
- `hardBreak + marks` 真实可达：在 Callout 内 Shift+Enter 换行后，选中跨换行的正文并加粗，Tiptap 会给 hardBreak 加 bold mark。domain Callout validator 现接受与 inline text 相同的合法 marks、拒绝未知 mark/不安全链接/额外字段，与 codec/MCP 保持一致；产品测试验证保存和 reload。
- 上下文收口：移动端 Touch Toolbar 的文本/标题/列表按钮改走与桌面工具栏、slash 相同的 `runBlockCommand`；`runBlockCommand` 对工具栏当前选区也执行 range safety。此前触屏在列表项内点「标题」会生成 codec 拒绝的 `ul > li > h2` 导致整页无法保存，本轮关闭该入口。

## P7.3 Final Acceptance

P7.3 于 2026-10-07 完成验收并 PASS。

- Tab / Shift+Tab：块首折叠光标与区块 NodeSelection 可缩进/反缩进，移动整棵子树并保留 blockId；文本中段、代码块与列表内部不拦截。覆盖缩进、反缩进、mid-block Tab 不变、Toggle summary 连带子树移动、undo/redo 与 reload。
- 拖拽：把手支持同级 before/after 重排、拖入允许 children 的 block、子块拖回上一级；拒绝 self、descendant、跨编辑器、leaf parent 与超过 8 层的嵌套（root 为 0，包含被移动子树深度）。拖拽高亮用 `Decoration.node` 与插件 meta，不改写 ProseMirror 正文 DOM，drop 时源把手仍 connected。
- Slash context：以 registry command type、`allowedChildTypes` 与 `EDITOR_NODE_RULES` 过滤；root / quote / listItem / Toggle summary / Toggle child 五种上下文回归通过，修复 P7.2 的 blockquote 内可创建不可保存 block 的 minor。
- 移动端：390px Touch Toolbar 增加缩进/取消缩进（44px 按钮），可从中段缩进/反缩进，无横向溢出；coarse pointer 下隐藏把手。
- sync/local-first：所有嵌套移动走 `moveBlock → block.move → LocalStore → sync`，同级 orderKey 变化也走 move。offline 移动经 reload、Chromium 进程重启后仍保持，恢复联网后先 push 再 pull snapshot；order allocator 保留旧 key 最长递增链。
- 性能：拖拽把手原为每块一个 `requestAnimationFrame` 定位，在 5000 块文档上退化为 O(n²)（`readyMs` 38.5s）。改为每帧一次批量定位（先读后写 + `nextElementSibling`）后，5000 块 `readyMs` 约 4.5s，与无把手基线一致。

验证（2026-10-07）：

- domain 13/13、contracts 6/6、storage 7/7、API domain 2/2、API HTTP 24/24、MCP 22/22、Electron SQLite 17/17、`test:storage` 11/11。
- `pnpm typecheck`、`build:web`、`build:api`、`git diff --check` 通过。
- `test:product`：189/189（新增 `product-nested.spec.ts` 与 `product-slash-context.spec.ts`，其余为既有回归）。
- `test:visual`：6/7；唯一失败仍为既有 `Connectivity backend unavailable desktop` 基线差异（21748 px，ratio 0.02），与 P7.2 记录一致，不更新基线。
- 独立只读 review：BLOCKER 0。记录 8 个 minor；本轮关闭 minor 1（移动端工具栏绕过上下文过滤）、minor 2（桌面固定工具栏多块选区缺 range safety）并补回归测试，minor 5（浏览器 mock orderKey 改为 30 位以真正覆盖 gap 分配）已修。
- 环境：本沙箱默认设置 `ELECTRON_RUN_AS_NODE=1`，运行 Electron 用例前需清除，否则 electron 以纯 Node 启动并报 `Process failed to launch`。

剩余已知限制（不阻塞 P7.3）：

- 附件仍只支持顶层插入；嵌套附件只保证读取/快照可 round-trip，不支持 UI 创建或块级拖拽。
- MCP nested document replacement 仍显式拒绝；不新增 MCP tool。
- 大文档持续输入仍是 O(N)/docChanged（既有 BlockIdentity/AttachmentLifetime 同量级）；5000 块只验证了加载，未建立持续输入延迟基线。
- 被拒绝的 drop 为静默 no-op，无用户提示；拒绝类拖拽测试只断言结构未变。
- root codeBlock 内通过 slash 创建 Toggle/Callout 会产生可保存但结构怪异的结果。
- 真实设备输入法/原生宿主验收不由浏览器回归替代。

## 测试与验证

- packages/domain：新增 `test/block-model.test.cjs`，覆盖注册表一致性、树重建顺序、self / missing / cross-page / cycle / 重复 id 拒绝、删除顺序、按组分配 orderKey、child 类型白名单。
- apps/web：新增 `tests/product-blocks.spec.ts`（已加入 `test:product`），覆盖 toggle 创建 / 嵌套 / reload / 折叠 / 清理流程、嵌套编辑后的 block 身份稳定、IndexedDB `moveBlock` 与父类型 invariant、blockCodec 嵌套 round-trip、leaf 节点不被注入 content、不可达环拒绝加载、summary 归一化。
- apps/api：`server-domain.test.ts` 增加 move 与 parent 类型 invariant；`mcp-read.contract.test.ts` 增加 nested 深度优先读取与不可达环 fail-closed。

P7.2 补充回归：Callout codec/marks/attrs、IndexedDB 与真实 Electron SQLite snapshot/重启、真实 HTTP sync create/update/delete、MCP create/update/read、orphan / leaf parent 拒绝、slash、键盘 split/退出/清空、移动 Touch Toolbar、桌面 Bubble Menu，以及 code language 编辑/reload 保真。开发服务器测试只中断 API 以验证离线数据恢复；既有生产 offline shell 验收边界不变。
验证命令：

```bash
pnpm --filter @eotion/domain test
pnpm --filter @eotion/storage test
pnpm --filter @eotion/contracts test
pnpm typecheck
pnpm build:web
pnpm build:api
pnpm --filter @eotion/api test:domain
pnpm --filter @eotion/api test:http
pnpm --filter @eotion/api test:mcp
pnpm --filter @eotion/web run test:product
pnpm --filter @eotion/web run test:storage
```

本环境运行 `test:product` 时默认多 worker 偶发与改动无关的 UI 失败，每次失败项不同，单独复现均通过；P7.3 最终验收以 `--workers=1` 串行运行，189/189 通过。本轮同时把两处会采样中间态的断言改为等待收敛（`product-blocks.spec.ts` 清空文档后断言最终为单个 root block）。运行 `test:storage` 前需清除本沙箱默认设置的 `ELECTRON_RUN_AS_NODE`，否则 Electron 用例会报 `Process failed to launch`。

## 明确不在 P7.x 范围

Database / Database View / Relation / Rollup / Formula / Notion Import / Agent UI / Automation / 新 MCP Tools / 完整 block plugin framework / 大规模 editor 重构。
