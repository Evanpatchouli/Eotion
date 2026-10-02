# Current Task — Mobile Settings Single Back Navigation

## Baseline / Scope

- `bc5c432`；只修复 compact Settings Detail 的双返回入口。
- 宽屏 list-detail、顶部返回工作区、Settings 内容与 30px 正文 gutter 保持既有行为。

## Work Units

- S0 investigate：核对 Settings 路由、断点、原有导航和测试。
- S1 execute：复用 layout mode 动态选择顶部返回目标及标签，删除 compact back DOM/CSS，更新行为文档。
- S1 execute：补 Mobile Index/Detail、三条 Detail route、Desktop/Tablet 和几何回归。
- S0 verify / Review：运行 Playwright、typecheck、build，采集 390×844 Profile Light 截图，复核 diff 并提交。

## Result / Verification

- 顶部返回依据现有 `useRuntimeContext` 的 `<768px` mobile 断点及 Index/Detail route 动态切换；Detail → Index 保留 `returnTo`、`workspaceId`。
- compact back DOM/CSS 已删除；Profile Light/Dark 截图检查顶部单栏、30px gutter 和无横向溢出。
- `product-settings.spec.ts` 15/15，web typecheck、build 通过；独立 reviewer 未发现可证实 blocker。
