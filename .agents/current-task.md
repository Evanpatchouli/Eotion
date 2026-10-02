# Current Task — P5.8.7 Inline Link Foundation & Desktop Link UX

## Scope

在正式 EotionEditor 增加安全、可保存的 Link mark，并在 mouse/fine-pointer 的选区 Bubble Menu 中创建、修改、移除。共享 DocumentEditor、Touch Toolbar、Block 类型与同步架构保持既有边界。

## Work Units

- S0 investigate：观察当前 Tiptap 3 Link 的 JSON attrs、命令与默认 URL 行为；核对现有菜单及 codec 边界。
- S2 decide：确定最小持久化 attrs、URL scheme、Bubble Menu 的选区与焦点处理。
- S1 execute：实现 product Link extension、严格 codec、局部菜单交互、图标及克制样式。
- S1 execute：补充创建、修改、移除、组合 Mark、安全、save/reload、Touch 与视觉回归；更新现有架构文档。
- S0 verify / Review：运行相关 Playwright、typecheck、build、生产隔离；复核 diff、截图与提交。

## Boundaries

- persisted Link 只保存经过验证的语义 attrs；其他 Mark 的 attrs 仍严格禁止。
- 不引入新的 Block、Editor adapter、全局弹窗、定位系统或 Mobile Link 入口。
- 不改 PagePersistence、LocalStore、Sync、API、附件、Slash、inputMode 与七项 Touch Toolbar。

## Baseline

- master `2af6ef6`，开始时工作树干净。

## Result / Verification

- 已观察 Tiptap 3.31.3 默认 Link JSON 带 `href/target/rel/class/title`；产品扩展收窄到仅 `href`。安全 HTML 链接携带 `title/target` 的粘贴回归曾复现保存失败，修复后通过。
- `blockCodec` 读写仅接受安全的 `{ href }` Link attrs，`http://` 与 `https://` 之外 scheme 拒绝；其他 Mark 不接受 attrs。
- Editor / Attachment / Sync / Shared editor 回归 102 passed；收窄 schema 后 Link/菜单/Touch 定向 5 passed；生产隔离 1 passed；web typecheck 与 build 通过。
- Desktop Light / Dark 截图输出到本任务 visualizations 目录；独立 reviewer 未发现可证实 blocker；`git diff --check` 通过。
