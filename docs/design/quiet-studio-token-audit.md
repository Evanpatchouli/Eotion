# P5.7.5.1.5 Quiet Studio Token Audit

日期：2026-10-02。范围：P5.7.5.1 的 tokens、基础组件、DEV 展示页，以及下一步 ProductShell 接入条件。

结论：Token Foundation 可保留；ProductShell 接入前有三项必要前置工作。此次只补充审计与使用边界，不改页面、布局、色板或组件 API。

## 审计结果

| 检查项 | 结论 | 证据与限制 |
| --- | --- | --- |
| Semantic token naming | 通过 | `styles/tokens.css` 使用 `--e-color-*`、`--e-type-*`、`--e-space-*`、`--e-radius-*` 等统一前缀。颜色按用途命名，无 light/dark 或具体色名进入调用方 API。`EotionSurface` 的 `subtle` variant 对应 `surface-subtle`，不是另一种材质。 |
| Light/Dark consistency | 通过 | 18 个颜色 token 在两主题中名称齐全、值与 `design-system-v1.md` 一致；几何、排版、motion 共用。popover shadow 共用规范批准的唯一档位，不自行增加 dark shadow。测试覆盖主题切换、geometry 不变、System live 更新、danger 默认/hover 对比度及生产启动前主题。 |
| Component API usability | 基础用法通过，Popover 有接入边界 | Button/IconButton 单根原生按钮可透传 `disabled`、`type`、ARIA、事件；Input 显式透传 attrs 并提供 string v-model；Switch 提供 boolean v-model、label、disabled；Surface 可指定元素和材质；Divider 是原生 hr。Popover trigger props 可绑定原生按钮或现有按钮组件，但不是任意内容浮层，详见下方必要项。 |
| ProductShell primitives | 接入契约需补齐 | 原生 button + menuitem 组合已可用，不要求新增组件；full-row 菜单样式、浮层面板样式接入、workspace 表单语义仍需补齐。不得直接复制展示页 CSS 或把现有工作区表单塞入 menu。 |
| Accidental hard-coded colors | 新基础设施未发现 | 对 `components/ui/*` 和 `UiFoundationDemoView.vue` 检索 hex/rgb/rgba/hsl，无 literal palette。`transparent` / `currentColor` 是合法语义值；tokens.css 中的色值和 shadow 是集中定义。旧 `base.css`、产品样式、`theme.ts` 和 HTML 启动脚本仍保留历史色表，属于既有迁移边界，不在本次批量替换。 |

## Required fixes only — ProductShell 接入前

### 1. 提取共享菜单行样式与交互契约

证据：`UiFoundationDemoView.vue:186–191` 中的 full-row、hover、focus-visible、danger 背景全部是展示页 scoped CSS。`EotionPopover.vue` 只处理浮层和焦点；`data-danger="true"` 只参与初始焦点排除，不自动产生危险项样式。

必要工作：在 ProductShell 菜单接入工作单元中提取可复用 Menu Item primitive 或共享样式，承载 icon、label、可选 shortcut、disabled、selected 和 destructive 状态。危险项继续采用既有 `danger` + `surface-subtle`，默认和 hover 都不得落到更亮的 Dark surface。沿用冻结 token，不新建色表。

验收：页面动作菜单和 workspace 行复用同一契约；整行可点击；可见 focus；禁用项不能触发；危险项不作为默认初始焦点；Light/Dark 默认与 hover 小字号 danger 文本对比度至少 4.5:1。

### 2. 明确 Teleport 面板样式入口

证据：`EotionPopover.vue:4–10` 仅声明 disabled/label；模板有 anchor 与 Teleport 两个根，未转发 `$attrs`；面板 baseline 为 `min-width: 160px`。规范已冻结 workspace switcher 约 240px。直接向组件传 `class`/`style` 不能可靠地作用于浮层，插槽内部样式也不等于面板样式入口。

必要工作：接入前确定面板样式的显式入口，以支持已批准的 workspace 宽度；保留 Page Action 的现有默认值。调用方不得依赖全局 `.eotion-popover-panel` 覆盖。此项涉及组件 API，应在 ProductShell 的接口决策中确定；本次不预先新增 props 或调整任何尺寸。

验收：两个浮层可各自表达批准宽度；滚动/resize 锚定、窄视口边界和开合无布局位移继续通过。

### 3. 区分动作菜单与包含表单的 workspace 浮层

证据：`EotionPopover.vue:56–57` 只导航 `role="menuitem"`，面板固定 `role="menu"`。`ProductShell.vue:220–221` 的现有 workspace switcher 还包含新建/重命名表单。普通输入框和表单不能仅通过加 menuitem role 获得正确菜单语义。

必要工作：ProductShell 接入时保留现有新建/重命名行为，并明确表单容器与菜单的语义边界。不能将含表单浮层直接套进当前菜单组件，也不能因组件限制删除现有行为。具体方案在接入阶段决定；不在本轮引入第二套浮层框架或改变业务流程。

验收：workspace 选择与新建/重命名均可由键盘完成；表单输入不被菜单方向键抢占；Tab/Shift+Tab、ESC、outside close、关闭后焦点行为在实际组合中验证。

## 验证与范围

- `pnpm exec playwright test tests/ui-foundation.spec.ts tests/theme.spec.ts --workers=2`：7/7 通过，无跳过。
- `pnpm exec playwright test --config playwright.theme-production.config.ts --workers=2`：2/2 通过，无跳过；该配置重新执行 Web build（含 vue-tsc、Vite、SW）。
- 新基础设施 literal color 检索：无匹配；人工逐项核对 18 个 Light/Dark 颜色与冻结规范。
- 现有测试未覆盖 workspace 240px 面板、混合表单浮层、menuitem selected/disabled、Tab/Shift+Tab 的实际 ProductShell 组合。通过 Foundation 测试不代表这些接入能力已完成。
- 本轮未做新的视觉验收、移动宿主验证或正式页面迁移。未新增缺乏当前需求的 Dialog、Tooltip、Badge、布局 primitive 或 token。
- 现有 ProductShell 的 desktop/tablet collapse/reopen、inline switcher 改 anchored popover 属于下一阶段页面实现；现有 IconButton 和 Popover 已提供基础能力，不据此增加布局 primitive 或在审计中改页面。

规范仍以 [Design System v1](design-system-v1.md) 为准；使用说明见 [Implementation Notes](implementation-notes.md)。
