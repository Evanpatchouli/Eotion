# Current Task — P5.8.3 Real Document Canvas Visual Convergence

## Scope

仅收敛正式 Page Editor 的 Quiet Studio 视觉：去掉历史 Editor Card，统一 `DocumentEditor` 正文排版，使 Page 标题、保存状态与正文共用阅读列，并压低固定工具栏视觉层级。保留编辑器、附件及持久化业务行为。

## Work Units

- S0 investigate：核对 `EotionEditor`、`DocumentEditor`、`PageView`、样式层级、设计约束与回归入口。
- S2 decide：阅读宽度由正式 Page 容器负责；共享正文 CSS 仅承载两个编辑器相同的排版规则；上传状态与工具栏仅做外观调整。
- S1 execute：局部修改组件和样式、补充视觉契约回归、同步编辑器设计文档。
- S0 verify / Review：运行直接相关测试与构建，核对 Desktop Light / Dark 与 390px Mobile 截图，复核 diff 并提交。

## Invariants

- 不修改 `useDocumentEditor`、schema、Block/附件/持久化/同步/API 或 Slash 业务。
- 保留 `fixedToolbar`、`touchToolbar` 与用户偏好语义。
- 无常态 editor 外框、圆角、背景、阴影或正文独立 padding；页面宽度由同一阅读列控制。

## Validation

- Web typecheck 与 build 通过；正式编辑器、DocumentEditor、附件、同步/持久化、设置相关 Playwright 回归 91/91 通过。
- 生产构建中的开发编辑器路由隔离回归 1/1 通过。
- 视觉契约测试覆盖 Desktop Light、Desktop Dark 固定工具栏、1024px Tablet 展开/收栏、390px Mobile 触摸工具栏与无横向溢出；修正平板旧 `.document` 宽度规则的级联优先级后复测通过。
- 截图输出到工作区外的 Codex visualizations 目录，已人工查看；最终 `git diff --check` 与 UTF-8 无 BOM 检查通过。

## Limits

- 浏览器视口代替 Electron 原生窗口和移动真机；本轮未测试真机输入法。
