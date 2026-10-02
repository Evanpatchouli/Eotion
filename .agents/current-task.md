# Current Task — Mobile Page Action Dialogs

## Scope
移动布局（<768px）重命名和移动使用 Dialog；Desktop/Tablet 保持 Popover，Delete 与业务行为保留。

## Work Units
- S0 investigate / S2 decide（主 Agent）：复用 useRuntimeContext 和表单，打开时选择容器、跨断点保留草稿，完成。
- S1 execute（fast_worker）：PageTree modal、radio Tabstop、列表独立滚动与文档，完成并由主 Agent 复核。
- S2 diagnose（主 Agent）：disabled 导致焦点落在 body 时消费 modal Esc；修复无效嵌套 :has 与样式优先级导致短屏 footer 不可见，完成。
- S1 execute / S0 verify（主 Agent）：touch、短屏、跨断点和 pending 回归；47/47 通过，Web typecheck/build 通过。
- Review（reviewer）：移动 Dialog 独立复核无剩余 blocker，主 Agent 已复核。

## Validation
- PageTree / ProductShell / UiFoundation / InteractionFoundation：47/47，通过；Desktop Popover 和 Delete 回归保留。
- 390×844 hasTouch、390×380 短屏长列表、767→768 容器/草稿保留与 pending/error/focus/背景 Esc 覆盖。
- 移动端截图已人工核对：C:/Users/evanpatchouli/.codex/visualizations/2026/10/02/eotion-mobile-page-actions。
- 未运行真实移动 WebView 宿主或系统软键盘；以缩小 viewport 验证可用高度变化。

提交：fix(ui): use dialogs for mobile page actions
状态：移动 Dialog 已完成（2026-10-02）。

## 用户追加工作
共享 EotionButton 默认高度统一为 desktop 28px / touch 36px，移除页面操作区的高度覆盖；独立验证并提交。
