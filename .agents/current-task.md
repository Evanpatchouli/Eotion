# Current Task — P5.8.5 Block & Formatting Capability Completion

## Scope

将已有 schema / blockCodec 能力开放到正式 Slash 菜单与紧凑 Desktop fixed toolbar；Touch Toolbar 保持 P5.8.4 布局。保留现有附件流程和持久化语义。

## Work Units

- S0 investigate：核对 Slash、Toolbar、Tiptap 扩展、图标、blockCodec 与现有回归。
- S2 decide：共用一组块命令；Slash 分组、中文、键盘与 IME 语义；低频 mark 先使用 Tiptap 快捷键，留待 Bubble Menu。
- S1 execute：局部修改 Slash、图标、Desktop fixed toolbar；补行为与保存重载回归；更新编辑器文档。
- S0 verify / Review：typecheck、build、相关 Playwright、Light / Dark / Mobile 截图、diff 和编码检查；独立复核后提交。

## Invariants

- 不改 EditorDocument、useDocumentEditor、blockCodec 映射、LocalStore / Sync / API、附件生命周期、页面树或 Sidebar。
- Touch Toolbar 七项及顺序不变。

## Validation

- Web typecheck 与 build 通过；Editor、Attachment、Sync、Settings Playwright 101/101 通过，最后新增的 Mobile 主题截图与编号列表默认属性断言 2/2 通过。
- Desktop Light / Dark、Mobile Light / Dark Slash 截图已人工查看；390px 页面无横向溢出。
- 独立 reviewer 未发现阻断问题；提交前检查最终 diff、UTF-8 无 BOM 与 `git diff --check`。
