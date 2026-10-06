# 当前任务：P7.1 Advanced Blocks Foundation

状态：实现 + 独立 review 完成，review 的 Major 项已修复，等待最终提交（本轮到此为止，不开始 P7.2）。
范围：Block schema 收敛、nested block 基础模型（parentBlockId 树）、block capability registry、Toggle 验证。
禁止：Database / Relation / Rollup / View / Formula / Notion Import / Agent UI / Automation / 新 MCP Tools / 完整 block plugin framework / 大规模 editor 重构。

## 已实现

- packages/domain/src/block-types.ts：BLOCK_TYPES（新增 toggle）+ BLOCK_NODE_TYPES + BLOCK_CAPABILITIES + EDITOR_NODE_RULES + BLOCK_COMMANDS，成为 editor/codec/server/MCP/slash 的单一来源。
- packages/domain/src/block-tree.ts：parentOf / parentRejection / validateBlockTree / descendantIds / buildBlockTree / flattenBlockTree / blockDepthMap / orderForDeletion（纯函数，零运行时依赖）。
- packages/domain/src/order.ts：assignBlockTreeOrder（按 parent 分组分配 orderKey）。
- packages/contracts：sync kind 'block.move'（payload id/pageId/parentBlockId/orderKey）。
- packages/storage：LocalStore.moveBlock；validateWorkspaceSnapshot 复用 validateBlockTree。
- apps/api：BlockService.create/move 用 isAllowedChildBlockType 校验父类型并拒绝 self/cross-page/cycle；SyncService block.move；mcp-read 兼容 nested（parentBlockId/depth + 深度优先，toggle 只读）并对不可达环 fail-closed。
- apps/web：blockCodec 递归 round-trip + leaf 不注入 content + 不可达环拒绝加载 + summary 归一化；BlockIdentity 覆盖 toggle 子区块且身份继承优先同类型范围；PagePersistence tree order + block.move + 子先于父删除；EotionToggle + ToggleNodeView（折叠为 localStorage 偏好）；slash 由注册表派生。
- apps/desktop：SqliteLocalStore.moveBlock（含父类型校验）+ preload/main bridge。
- docs：docs/p7-advanced-blocks.md、docs/README.md、docs/roadmap.md、.agents/handoff.md。

## 验证证据（修复后重跑）

- pnpm --filter @eotion/domain test：10/10 通过。
- pnpm --filter @eotion/storage test：6/6 通过。
- pnpm typecheck（web/desktop/api）：通过。
- pnpm --filter @eotion/api build / typecheck：通过；test:domain 2/2；test:mcp 16/16。
- pnpm build:web / build:api：通过。
- pnpm --filter @eotion/web run test:storage：11/11 通过（本沙箱默认 ELECTRON_RUN_AS_NODE=1，必须先清除该变量，否则 3 个 Electron 用例报 Process failed to launch）。
- pnpm --filter @eotion/web run test:product：`--workers=1` 下 167/167 通过（新增 product-blocks 已接入脚本）。默认多 worker 运行时偶发 1 个与本次改动无关的 UI 超时（三次分别为 IME draft、product-sync HTTP 500、product-pages 移动端弹窗，逐个单独运行均通过）。
- test:visual：6/7，Connectivity backend unavailable desktop 在干净基线同样失败（既有环境基线差异）。
- git diff --check：通过。

## 独立 review

reviewer（只读）结论：无 blocker；报告 M1（新测试未接入脚本）、M4（BlockIdentity 身份继承）、M2（环/损坏树未 fail-closed）、M3（allowedChildTypes 未落地、本地 create 不校验父类型）、M5（summary 假设）等 Major，均已在提交前修复，并补了对应回归测试。

## 已知限制

- 已有段落转 Toggle 会产生一次 block 重建（旧段落 block 删除 + 新 toggle block 创建）。
- wrapIn（与 Quote 相同）会留下尾部空段落区块。
- 只有顶层支持附件插入；toggle 子区块附件与拖拽嵌套 / Tab 缩进属于 P7.3。
- MCP read 对「parent 缺失」的子块仍按 root 读出（不做报错），仅对无根环 fail-closed。
