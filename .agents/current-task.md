# Current Task — P5.8.6 Selection / Bubble Formatting Menu

## Scope

为正式 EotionEditor 的非空文本选区提供 Bold、Italic、Strike、Inline Code 浮动格式入口；复用现有 Tiptap marks、Quiet Studio tokens 与持久化路径。

## Work Units

- S0 investigate：核对 Tiptap Vue BubbleMenu、编辑器焦点/选区/IME、Slash、Touch Toolbar、图标与现有回归。
- S2 decide：使用 Vue BubbleMenu 与 Floating UI 定位；仅文本选区且可格式化内容显示；composition / Slash / Escape 抑制；按钮保持焦点与选区。
- S1 execute：独立 Bubble Menu 组件、编辑器挂载、必要图标；补交互与保存重载测试、文档。
- S0 verify / Review：相关 Playwright、typecheck、build、Light / Dark / Mobile 截图、diff 与独立 review，最后提交。

## Invariants

- 不改 EditorDocument、blockCodec 业务语义、useDocumentEditor、BlockIdentity、PagePersistence、LocalStore / Sync / API、Slash Command 列表、Touch Toolbar 七项布局或 Desktop Fixed Toolbar。
- 不新增 Mark / Block 或 command registry；Bubble Menu 不参与正文布局。

## Validation

- `pnpm --filter @eotion/web typecheck` 和 `pnpm --filter @eotion/web build` 通过。
- Editor、Attachment、Sync、共享编辑器 Playwright 99/99 通过；包含四个新 Bubble Menu 用例。
- 已人工查看 Desktop Light / Dark、多 Mark active、390px Mobile 截图；浮动菜单无横向溢出，Touch Toolbar 七项仍在。
- 独立 reviewer 提出的 Escape 键盘焦点与编辑器卸载问题已修复并回归；`git diff --check` 和 UTF-8 无 BOM 检查通过。
- 浏览器自动化使用模拟 coarse pointer；系统文本选择手柄和真实软键盘仍需真机验收。
