# Current Task — P5.8.6.1 触摸输入环境的选区菜单边界

## Scope

在正式 EotionEditor 中，按现有 `touchToolbar` 条件控制 `EotionBubbleMenu` 是否启用。Desktop / Tablet mouse 的非空文本选区显示浮动菜单；Tablet coarse/hybrid 与 Mobile coarse/touch 不显示菜单，并保留七项 Touch Toolbar。

## Work Units

- S0 investigate：核对 PageView 的 runtime 规则、BubbleMenu 生命周期、测试和文档入口。
- S1 execute：EotionEditor 传入启用状态；BubbleMenu 禁用时拒绝显示并立即隐藏；更新 Playwright 与跨端交互文档。
- S0 verify / Review：编辑器、附件、同步和共享编辑器回归，typecheck、build、diff 与独立复核。

## Boundaries

- 仅修改 `EotionEditor.vue`、`EotionBubbleMenu.vue`、`product-editor.spec.ts`、本任务记录和对应设计文档。Tiptap BubbleMenu 会移动自身 DOM；运行时不能通过 `v-if` 卸载它，因此组件常驻，禁用时不呈现菜单。
- PageView 已按 `layoutMode === 'mobile' || inputMode !== 'mouse'` 传入 `touchToolbar`；不改 PageView、runtime 或设备识别逻辑。
- 不改 Touch Toolbar 七项、Desktop Fixed Toolbar、Bubble Menu 四项/尺寸/定位或其他模块。
- 保持各文件现有 UTF-8 无 BOM 与换行风格。

## Validation

- 首轮大回归发现响应式 `v-if` 卸载导致 Vue 插入点异常；常驻 + enabled 修复后，针对失败用例及 Bubble Menu 定向用例通过。
- 编辑器、附件、同步和共享编辑器 Playwright：100 passed、1 skipped（生产构建用例按独立配置运行，1 passed）。
- web typecheck、build 通过；独立 reviewer 未发现运行时 blocker。
- 最终 diff 未见无关改动，`git diff --check` 与 UTF-8 无 BOM / CRLF 检查通过。

## Baseline

- 用户提供的 `dc2031d` 当前本地无法解析；本轮从干净的 `baa9cbd` 开始。
