# P7 Advanced Blocks

P7 在 P5 编辑器与 P6 MCP 之上补齐 Advanced Blocks 基础。P7.1–P7.5 已 PASS，P7 Advanced Blocks 已 COMPLETE：block registry 单一来源、嵌套区块模型与 UX、Callout、普通文档表格（非 Database），以及混合文档端到端验收。本页记录实现、验收结果与已知限制。

| 阶段 | 范围 | 状态 |
| --- | --- | --- |
| P7.1 Block Model Foundation | block registry、block tree invariant、move/reparent、snapshot 校验、Toggle 验证 | PASS |
| P7.2 Rich Blocks | Callout 与现有 Rich Block 保真收敛 | PASS |
| P7.3 Nested Blocks UX | 拖拽嵌套、Tab/Shift+Tab 缩进、移动端操作与上下文筛选 | PASS |
| P7.4 Table | Table 区块 | PASS |
| P7.5 Advanced Blocks Acceptance | 最终验收 | PASS |

## P7.1 Block model 收敛

`packages/domain/src/block-types.ts` 现在是 Block 类型与能力的唯一来源，包含：

- `BLOCK_TYPES`：paragraph、heading、bulleted-list、numbered-list、todo、quote、code、image、file、divider、toggle、callout、table。
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
- 真实设备输入法/原生宿主验收不由浏览器回归替代。

root codeBlock 的 slash context 缺口已在 P7.4 关闭，见下文「P7.4 Table」的代码块上下文一节。

## P7.4 Table

P7.4 实现「普通文档表格」，明确不是 Database。没有 property / filter / sort / view / relation / rollup / formula / database row / database schema / database query / column type 语义，也没有新增 MCP tool。

### Table 数据模型

- 一个 Table 就是一个 Block。`BLOCK_TYPES` 追加 `table`，`BLOCK_NODE_TYPES.table = 'table'`，`BLOCK_CAPABILITIES.table` 为 `internalContent: true`、`mcp.readable: true`、`mcp.writable: false`，不拥有子区块。
- 整张表格（行、单元格及其文本）都存放在该 block 的 `props.node` 内。行与单元格属于 **editor internal node**，不是 Eotion Block：
  - `EDITOR_NODE_NAMES` 去掉 `BLOCK_NODE_NAMES` 后剩下的 `tableRow` / `tableCell` / `tableHeader`（以及既有的 `listItem`、`text`、`hardBreak`）都是 editor node，不是 Eotion Block。
  - 它们没有 `blockId`，不进入 `parentBlockId` block tree，不参与 `block.move`、嵌套拖拽或 Tab 缩进。
  - 页面树形态固定为 `page block tree → table block → editor-internal rows/cells`。
- `EDITOR_NODE_RULES` 新增 `table` / `tableRow` / `tableCell` / `tableHeader`：`table → tableRow+`、`tableRow → tableCell | tableHeader`、单元格 `→ paragraph+`。
- 粘贴 HTML 表格是超大 grid 唯一可达的入口：编辑器用 `createTablePasteGuard` 在粘贴/拖放时按 `TABLE_LIMITS` 拒绝超限表格并给出 `role="alert"` 提示，避免一次粘贴把整页变成无法保存；正常尺寸的 HTML 表格仍可粘贴。
- 单元格只允许 `paragraph`（可含 plain text、bold / italic / strike / inline code / link 与 hardBreak）。Toggle、Callout、Table、attachment 及任何 block-level 节点都无法进入单元格：限制落在 ProseMirror schema（`content: 'paragraph+'`），而不是事后校验，因此编辑器不可能产出 codec 拒绝的单元格。
- 单元格 span 属性（`colspan` / `rowspan` / `colwidth`）由 `validateTableCellAttrs` 单点校验，domain props 校验、web codec 与 MCP read 共用。ProseMirror table 插件依赖这些属性，因此保留但不提供合并 UI。
- `validateTableBlockProps` 与 callout 校验并列，挂在 `validateBlockProps` 上，因此 contracts / LocalStore / snapshot / server 写入同一套 grid 约束：至少一行、每行至少一个单元格、单元格只能是段落、拒绝未知属性与嵌套 blockId。规模预算由 domain 的 `TABLE_LIMITS` 单点定义（1000 行 / 每行 200 格 / 每格 100 段），web codec、domain 校验、编辑器粘贴守卫与 MCP read schema 共用同一组数字，任何一层都不会接受另一层拒绝的 grid。
- Table 与 P7.1/P7.3 nested blocks 的关系：Table 本身是普通 page block，可同级排序、拖拽、按 registry 白名单嵌套进 Toggle；单元格不参与这些操作。`nestedBlockInteractions` 通过 `blockHasInternalContent` 识别「光标位于某区块的 editor-internal 结构内」，此时 Tab/Shift+Tab 交给 table 插件在单元格间移动，而不是缩进整个 Table block。

### Editor / UX

- 表格用 Tiptap 官方 `@tiptap/extension-table`（Table / TableRow / TableHeader / TableCell），不自建表格编辑器。`EotionTable` 配置 `cellMinWidth: 100`、关闭 resizable；cell/header 以 `content: 'paragraph+'` 收窄内容模型并去掉未使用的 `align` 属性。
- Slash 菜单新增「表格」，默认创建 3×3 且带表头行（自然最小尺寸），光标落在第一个单元格。总表宽小于阅读列时铺满，超出时在表格容器内横向滚动。
- 行/列操作走选区旁的轻量上下文菜单（`TableMenu.vue`）：上方/下方插入行、删除行、左侧/右侧插入列、删除列、删除表格。保持 Quiet Studio，没有做 spreadsheet 式重操作 UI（无行号列、无拖拽调宽、无合并）。
- 单元格内正常输入；Enter 只会在单元格内新增段落，不会创建 page-level block；删除空表格会把 Table block 作为一个整体删除；当表格是页面唯一 block 时，删除会原地替换为段落，避免产生非法空文档。

### Keyboard 与 copy/paste

- Tab 前往下一个单元格，Shift+Tab 返回上一个；最后一个单元格 Tab 追加一行（Tiptap 表格插件默认行为）。单元格内 Tab 不再触发区块缩进逻辑。
- 单格复制粘贴、跨多格复制的文本提取、以及从 tab/newline 文本粘贴都已验证：粘贴只会产生合法 inline 文本，不会伪造 block 节点，表格结构保持不变。TSV/Excel 文本按普通文本插入，不隐式建表；不做 Excel 完整兼容。

### Mobile

- 390px 下 `.tableWrapper` 横向滚动，页面本身不产生横向溢出；列宽保持 `cellMinWidth`（100px）可读，不压缩到不可读。
- 单元格仍可选择与编辑，Touch Toolbar 不受影响；行列管理不要求在移动端完成（上下文菜单在触屏同样可用，但不是必须路径）。

### Sync / local-first

- Table 复用既有 create/update/move 与 `block.upsert` / `block.move` / `block.delete`，没有新增 sync operation。
- 已验证：创建表格、编辑多个单元格、增删行列、offline 修改、reload、Chromium 进程重启、reconnect 后先 push 再 pull snapshot。单元格内容不丢、行列顺序不漂移、table block ID 稳定，不产生 orphan 或 malformed document。

### MCP

- 不新增 MCP tool。Table 通过既有 `get_page` 只读暴露，DTO 只增加稳定字段 `rows: string[][]`（每个单元格一个字符串，单元格内多段落以换行连接），`text` 为同一 grid 的 tab 分隔渲染；不暴露 TipTap AST / `props` / `node` / cell attrs。
- 读取校验与 web codec 同源：拒绝单元格内非段落节点、空行、退化 grid、非法 span 属性与嵌套 blockId；表格可以出现在 Toggle 之下，`parentBlockId` / `depth` 照常输出。
- MCP write 暂不支持 Table（`mcp.writable: false`）。`rows` 无法表达 marks、多段落与 merged cell，写入会是静默有损转换；因此先 read-only 并显式记录。`eotion_update_page` 的 blocks 全量替换语义与 image/file 一致，会删除未包含的 Table block。

### 与未来 Database 的边界

- Table 只是文档内容块：没有 schema、没有列类型、没有查询/过滤/排序/视图，也没有「database row」概念。
- 未来 Database 必须是独立 domain（独立记录/属性/视图模型与独立同步语义），不复用 Table 的 `props.node` 或 MCP `rows` 契约。本轮没有为 Database 预留半成品抽象。

### 代码块 slash 上下文收口（P7.3 minor）

- 根级 codeBlock 内 `/` 曾可创建 Toggle / Callout / Table / 列表 / 引用，并产生「代码块被包成 Toggle summary」或「代码块被容器替换」等结构怪异但可保存的结果。
- 原因是 `isBlockCommandAllowed` 只检查当前选区的**外层容器**规则，而 codeBlock 是逐字文本容器，其内部位置不会命中任何容器规则。
- 最小修复：光标位于 codeBlock 内时只保留「转换为普通文本」的命令（文本 / 一级标题 / 二级标题），其余 block 级命令与附件命令一并过滤；不改动 registry 结构，不扩展到其他上下文。

## P7.4 Final Acceptance

P7.4 于 2026-10-09 完成验收并 PASS。

- Table 真正可编辑：slash 创建 3×3 带表头表格，单元格内正常输入，Enter 只在单元格内新增段落，空表格删除后页面仍合法。
- 行列操作稳定：上下文菜单增删行列，reload 后行列顺序与内容不漂移，table block ID 稳定。
- keyboard：Tab / Shift+Tab 单元格导航，最后一个单元格 Tab 追加行；单元格内 Tab 不再触发区块缩进。
- copy/paste：单格与跨格文本复制、粘贴到其他单元格、tab/newline 纯文本粘贴均不破坏结构，也不产生非法节点；不做 Excel 完整兼容。
- mobile：390px 下 `.tableWrapper` 横向滚动，页面无横向溢出，列宽 ≥ 100px 可读，单元格可编辑，Touch Toolbar 正常。
- local-first/sync：offline 编辑单元格与增删行后经 reload、Chromium 进程重启仍保持；恢复联网先 push 再 pull snapshot；SQLite（Electron）写入、reconnect snapshot 与重开后 grid 完整。
- 不污染 nested block model：单元格不进入 block tree（无 blockId、无 parentBlockId、无 block.move），Table 可同级拖拽重排、可嵌套进 Toggle。
- MCP contract 稳定：`get_page` 只读返回 `rows: string[][]` 与 tab 分隔 `text`，不新增 tool，不暴露 AST；Table 仍为 write read-only。
- 未引入 Database 语义。
- 独立 review：BLOCKER 0。

验证（2026-10-09）：

- domain 17/17、contracts 6/6、storage 7/7、API domain 2/2、API HTTP 24/24、MCP 24/24、test:storage（含 Electron SQLite）11/11。
- `pnpm typecheck`、`build:web`、`build:api`、`git diff --check` 通过。
- `test:product`：206/206（`--workers=1`；新增 `product-table.spec.ts` 14 项、table codec round-trip 与 codeBlock slash context 用例，其余为既有回归）。
- `test:visual`：6/7；唯一失败仍为既有 `Connectivity backend unavailable desktop` 基线差异（21748 px，ratio 0.02），与 P7.2/P7.3 记录一致，不更新基线。
- 环境：本沙箱默认设置 `ELECTRON_RUN_AS_NODE=1`，运行 Electron 用例前需清除；新增依赖后需重启 `pnpm dev`（Vite 依赖重新预构建期间动态 import 会瞬时失败），否则个别既有用例会假失败。
- 依赖：新增 `@tiptap/extension-table`（apps/web），lockfile 只记录 integrity，不绑定 registry。

剩余已知限制（不阻塞 P7.4）：

- MCP write 不支持 Table：`rows` 无法表达 marks、多段落与 merged cell，写入会有损；`eotion_update_page` 的 blocks 全量替换会删除未包含的 Table block（与 image/file 一致）。
- 单元格不提供合并/拆分 UI；`colspan`/`rowspan` 只在 schema 与校验层保留，`rows` DTO 每个 cell 只出现一次。
- 无列宽拖拽、无对齐/颜色、无表头行切换 UI、无 spreadsheet 级大数据优化；验证规模为 20×10。
- 表格内粘贴 TSV 文本按普通文本插入，不会自动建表。
- 真实设备输入法/原生宿主验收仍不由浏览器回归替代。

## P7.5 Advanced Blocks Final Acceptance

P7.5 于 2026-10-11 完成验收并 PASS。本轮只做验收，不新增 Block，不开始 Database。

| 阶段 | 状态 |
| --- | --- |
| P7.1 Block Model Foundation | PASS |
| P7.2 Rich Blocks | PASS |
| P7.3 Nested Blocks UX | PASS |
| P7.4 Table | PASS |
| P7.5 Advanced Blocks Acceptance | PASS |

```text
P7 Advanced Blocks — COMPLETE
```

### 1. 混合文档端到端

新增 `apps/web/tests/product-p75-acceptance.spec.ts` 并纳入 `test:product`：

- `a mixed advanced-block page is created in the editor and survives reload, reorder, indent and browser restart`：在真实编辑器里用 slash 与输入创建 heading / paragraph / bulleted-list / numbered-list / todo / quote / code / callout / 嵌套 Toggle（toggle 内再建 toggle）/ 3×3 Table，然后编辑段落正文、编辑 Callout icon+tone、编辑 Table 单元格、用 Tab 把段落缩进进 Toggle 再 Shift+Tab 弹出、用 drag handle 把 Table 重排到 Callout 之前，最后 reload 并整进程重启（Chromium persistent profile）。
- `seeded mixed document keeps local-first identity, nesting, callout attrs and table grid across offline restart and reconnect`：种子文档包含 heading/paragraph/两种 list/todo/quote/code/callout、两层 Toggle（Toggle 内含嵌套 Table）、3×3 Table、divider、tail；offline 修改段落、追加 Toggle 子块、改 Callout tone、改 Table 单元格 → reload → 浏览器进程重启 → reconnect。
- `a legacy P5/P6 page still opens, edits, saves and syncs without a migration`：旧 P5/P6 页面（heading/paragraph/list/todo/quote/code/divider）直接打开、编辑、保存、同步；旧 block 的 id/type/props.type 不变，唯一新增是编辑器既有的 TrailingNode 空段落。

每轮都用测试内的 `structureProblems()` 单点检查页面块树：orphan / cross-page parent / cycle / duplicate id / 同一 sibling 组重复 orderKey / 无 root。

结论：

- Block ID 稳定：创建、编辑、缩进、重排、reload、进程重启、offline→reconnect 之后，所有 block 的 id 与 type 不变，只允许显式的 parent/order 变化。
- `parentBlockId` 正确：嵌套 Toggle 与 Toggle 内 Table 的父指向正确，嵌套段落缩进/反缩进后父指向正确。
- orderKey 稳定：同一 sibling 组内不重复；重排只改移动块的 key。
- Toggle child、Callout attrs（icon/tone）、Table grid（单元格文本）在 reload / 进程重启 / offline / reconnect 后完全一致。
- reconnect 先 push 再 pull snapshot；push 成功后本地内容与服务器内容用同一 `canonicalDocument()` 比较，完全相等。
- 无 orphan / cycle / malformed document。

### 2. 交互回归

P7.3/P7.4 交互套件全部保留并通过：Tab/Shift+Tab 缩进与反缩进（含 Toggle summary 连带子树、undo/redo）、drag handle 同级重排与嵌套及 self/descendant/leaf/depth 拒绝、slash 上下文过滤（root / quote / listItem / codeBlock / Toggle summary / Toggle child / table cell）、390px 移动端 Touch Toolbar 缩进/反缩进且无横向溢出、Toggle 展开折叠（折叠是本地偏好，不进 props）、Callout icon/tone 与正文编辑、Table 单元格编辑与 Tab/Shift+Tab 导航、末格 Tab 追加行、增删行列、空表格替换、Bubble Menu。P7.5 只修复了下面「修复」一节记录的两处缺陷，没有为体验细节新增大功能。

### 3. Local-first / Sync

- IndexedDB（Web）与 Electron SQLite：`test:storage` 11/11，覆盖 IndexedDB move/hydrate/oplog 重开、桌面 SQLite 经 typed preload 的读写与 reload、Electron 离线编辑经 app 重启与 HTTP 500/502 后仍保留。
- snapshot 校验：`replaceWorkspaceSnapshot` 复用 domain `validateBlockTree`；P7.5 回归继续覆盖 self-parent / cycle / cross-page 拒绝。
- offline reload、浏览器进程重启、reconnect、push/pull 全部在 `product-p75-acceptance.spec.ts` 与既有 `product-table.spec.ts` / `product-nested.spec.ts` 中闭环；混合文档最终状态一致。

### 4. MCP 回归

不新增 Tool。`mcp-read.contract.test.ts` 新增混合页面读取用例：一次读入 heading/paragraph/两种 list/todo/quote/code/callout、两层 Toggle、Toggle 内 Table、顶层 Table、divider、tail（共 15 个 block），输入顺序故意打乱，断言输出按深度优先、`parentBlockId`/`depth` 正确、Callout icon/tone 与 Table `rows` 稳定，且 DTO 不泄漏 AST / props / orderKey / 内部 cell 结构。`mcp-write.contract.test.ts` 显式断言 Table 与 Toggle 在 create/update 两个 schema 下都被拒绝（read-only），保留既有 nested document replacement 拒绝与 malformed/orphan fail-closed 行为。

### 5. 兼容性

旧 P5/P6 页面（不含 Toggle/Callout/Table）可正常打开、编辑、保存、sync；MCP read 的既有「十种 block 类型」用例继续覆盖旧类型。没有新增迁移脚本——没有发现真实 blocker 需要迁移。

### 6. 性能烟测

- 5,000 块合成文档加载（`/__dev/editor-p2`）：`setContent` 约 0.7s，至下一次绘制机会约 2.9–3.7s。改动前基线与改动后一致（基线与本轮都约 3.1s / 2.9s），与无把手基线同量级。
- 20×10 Table 编辑与保存：由 `product-table.spec.ts` 覆盖，单 block、行列不漂移。
- 连续输入：小文档约 2.7 ms/字符；5,000 块文档约 112–119 ms/字符，改动前后一致（基线 112.5、本轮 118.6，属运行噪声）。这是 P7.3 已记录的既有 O(N)/docChanged 行为（BlockIdentity `appendTransaction` 全文档遍历），不是 P7.5 引入的退化，本轮不做性能重构。

### 7. 修复（本轮只修 blocker / 明确回归）

独立只读 review 共报 2 个 BLOCKER，均已修复并补回归：

1. 编辑器可产出 codec/domain 拒绝的结构，导致整页永久无法保存。
   - 现象：粘贴 `<ul><li><p>a</p><h2>b</h2></li></ul>`、`<blockquote><table>…`，或在 listItem 内用 input rule 生成 heading，会产出 `li > heading` / `blockquote > table`；codec 抛错后 `PagePersistence` 进入 error，后续输入也不再保存，直到用户 undo。
   - 修复：新增 `apps/web/src/editor/contentRules.ts`，用 domain `EDITOR_NODE_RULES` 派生 `listItem` 与 `blockquote` 的 ProseMirror content，替换 Tiptap 更宽的默认值（`paragraph block*` / `block+`）；`useDocumentEditor` 关闭 StarterKit 的 `listItem`/`blockquote` 并挂载 registry 版本。放不进容器的粘贴内容由 ProseMirror 提升到最近合法祖先，内容不丢。
2. 属性维度的同类漏洞：`<ol type="A">` 与 `<ol start="abc">` 由 Tiptap 默认 parseHTML 读进 schema，而 codec/MCP 只接受 `type: null` 与安全整数 `start`。
   - 修复：`EotionOrderedList` 把 `type` 固定为 null（不渲染），`start` 归一化为正安全整数；`tableNodes` 把 `colspan`/`rowspan` 归一化、`colwidth` 不再从 HTML 解析；`blockIdentity` 的全局 `blockId` 加 `parseHTML: () => null`，粘贴 HTML 不能注入服务器 block id。
   - 回归：`apps/web/tests/product-content-rules.spec.ts`（已纳入 `test:product`）覆盖 list/quote/table/identity 各类入口。
3. P7.3 回归：在 Toggle 子块内 slash「折叠列表」菜单可见但静默无效（`/` 留在正文），因为 `isBlockCommandRangeSafe` 的 `containsChildOwner` 把包住选区的父 Toggle 也当成被吞掉的子 owner。
   - 修复：只把完全落在变换区间内的 child owner 计为阻塞；Toggle summary 位置仍禁止创建 child-owning block。`product-slash-context.spec.ts` 增加「子块内 slash 折叠列表必须真正创建嵌套 toggle 并保存 parentBlockId」用例。
4. 测试环境稳定性：Playwright 变换临时目录会让 Vite watcher `EBUSY` 并杀死 `pnpm dev`，导致同一次 `test:product` 出现与被测行为无关的失败；`vite.config.ts` 增加 `server.watch.ignored`（`test-results` 与 `.*.tmpdir`），不改变产品行为。

### 8. 验证（2026-10-11）

- domain 17/17、contracts 6/6、storage 7/7、API domain 2/2、API HTTP 24/24、MCP 25/25、`test:storage`（含 Electron SQLite）11/11。
- `pnpm typecheck`、`build:web`、`build:api`、`git diff --check` 通过。仓库无 lint 脚本，N/A。
- `test:product`：211/211（`--workers=1`）。多 worker / 长串行运行下 `product-pages.spec.ts` 的移动端「move 对话框高度 ≤ 348」偶发失败，单项复现 25/25 通过，确认为本环境既有 flaky，与本轮改动无关。
- `test:visual`：6/7；唯一失败仍为既有 `Connectivity backend unavailable desktop` 基线差异（21748 px，ratio 0.02），与 P7.2/P7.3/P7.4 记录完全一致，不更新基线。
- 独立只读 review：BLOCKER 0（两轮修复后定向复核 BLOCKER 0）。

### 9. 本轮剩余已知限制（不阻塞 P7.5）

- Toggle summary 的 MCP 读取保真度已由 P7 封板后边界修复补齐：既有 `text` 保持兼容，结构化 `summary` 暴露业务内容 DTO（含嵌套 list/quote、Table `rows`、Callout `icon`/`tone`），不暴露 editor AST；child blocks 继续通过 `parentBlockId` / `depth` 表达。Toggle 与 Table 仍为 MCP read-only。
- 服务端写入校验已由 P7 封板后边界修复统一：domain `validateBlockProps` 从 registry 校验所有正式类型的 node/attrs/child/leaf/content，HTTP create/update、sync `block.upsert`（snapshot upsert）、MCP document mutation 均经 `BlockService` 校验后写入；没有新增写工具或 nested MCP write。
- Toggle summary 内的 Table 也复用 domain Table 校验与 `TABLE_LIMITS`，超限或非法结构在写入和 MCP read 时 fail-closed。
- Table cell 内的图片/文件上传入口未被 `isBlockCommandAllowed` 的附件分支排除，附件会落到表格之后的顶层位置（P7.3 的「嵌套附件只读」边界仍成立，附件不会被插进单元格）。
- 连续输入在 5,000 块文档上仍是 O(N)/docChanged（见性能烟测），本轮不做性能重构。
- 真实设备输入法/原生宿主验收仍不由浏览器回归替代。

## 测试与验证

- packages/domain：新增 `test/block-model.test.cjs`，覆盖注册表一致性、树重建顺序、self / missing / cross-page / cycle / 重复 id 拒绝、删除顺序、按组分配 orderKey、child 类型白名单。
- apps/web：新增 `tests/product-blocks.spec.ts`（已加入 `test:product`），覆盖 toggle 创建 / 嵌套 / reload / 折叠 / 清理流程、嵌套编辑后的 block 身份稳定、IndexedDB `moveBlock` 与父类型 invariant、blockCodec 嵌套 round-trip、leaf 节点不被注入 content、不可达环拒绝加载、summary 归一化。
- apps/api：`server-domain.test.ts` 增加 move 与 parent 类型 invariant；`mcp-read.contract.test.ts` 增加 nested 深度优先读取、不可达环 fail-closed，以及 P7.4 的 table `rows` DTO、嵌套读取与退化 grid 拒绝。
- packages/domain：`block-model.test.cjs` 增加 table 单 block / editor-internal rows 事实、`validateTableBlockProps`、共享 cell span 校验与 `TABLE_LIMITS` 边界（1000/200/100 接受，+1 拒绝）。
- apps/web：新增 `product-table.spec.ts`（已加入 `test:product`），并扩展 `product-blocks.spec.ts`（table codec round-trip）与 `product-slash-context.spec.ts`（codeBlock 上下文）。
- apps/web：新增 `product-content-rules.spec.ts` 与 `product-p75-acceptance.spec.ts`（均已加入 `test:product`），覆盖 registry 收窄后的 paste/input rule/属性归一化边界、混合文档端到端与旧页面兼容。
- apps/api：`mcp-read.contract.test.ts` 增加整页混合文档深度优先读取；`mcp-write.contract.test.ts` 显式断言 Table / Toggle 在 create 与 update schema 下均被拒绝（read-only）。

P7.4 补充回归：Table 的 slash 创建、单元格编辑、Tab/Shift+Tab、末行追加、增删行列、删除表格与唯一 block 替换、单格与跨格复制粘贴、TSV 纯文本粘贴、拖拽重排、Toggle 嵌套、quote/listItem/cell 上下文筛选、390px 横向滚动、20×10 编辑、offline→reload→进程重启→reconnect push/pull，以及 Table codec round-trip 与非法 grid 拒绝、domain props/schema 校验、MCP `rows` DTO 与嵌套读取、Electron SQLite grid round-trip；同时补 codeBlock slash context 回归。

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

本环境运行 `test:product` 时默认多 worker 偶发与改动无关的 UI 失败，每次失败项不同，单独复现均通过；P7.3 最终验收以 `--workers=1` 串行运行 189/189 通过；P7.4 以同一方式运行 206/206 通过；P7.5 以同一方式运行 211/211 通过（唯一一次长串行失败是 `product-pages.spec.ts` 的移动端 move 对话框高度断言，单项复现 25/25 通过，为本环境既有 flaky）。P7.5 另修复了会让 `pnpm dev` 在测试期间因 `EBUSY` 崩溃的 Vite watcher 问题（`vite.config.ts` 的 `server.watch.ignored`）。运行 `test:storage` 前需清除本沙箱默认设置的 `ELECTRON_RUN_AS_NODE`，否则 Electron 用例会报 `Process failed to launch`；新增依赖后需重启 `pnpm dev`。

## 明确不在 P7.x 范围

Database / Database View / Relation / Rollup / Formula / Notion Import / Agent UI / Automation / 新 MCP Tools / 完整 block plugin framework / 大规模 editor 重构。