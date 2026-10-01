# P5.7.5.1 Quiet Studio UI Foundation 实现记录

## 用途与入口

开发服务器中通过 `/#/__dev/ui-foundation` 查看 Web UI Foundation 展示页。该路由独立挂载，不经过 `WorkspaceLayout`，页面集中展示现有 UI 基础组件及 Light / Dark 语义 token。

展示页覆盖按钮、图标按钮、输入框、开关、Surface、Divider、Popover，以及有限的 typography 和 surface hierarchy。页面仅用于核对基础组件和主题 token，不代表任何正式产品页面已经迁移。

## Token 使用

- `design-system-v1.md` 是 Quiet Studio 语义 token 的唯一来源。
- 本轮已明确授权实现 Desktop Light / Dark 冻结基线和基础组件演示；这不代表整个 P5.7 Design System 或所有页面已通过验收。
- 新展示页样式只引用 `--e-*` tokens，不在组件展示页复刻色值或旧变量。
- token 定义集中在 `apps/web/src/styles/tokens.css` 并由 `apps/web/src/main.ts` 引入。颜色、排版、spacing、radius、border、shadow、motion 与 focus token 的值都以 `design-system-v1.md` 为准；页面只引用语义名称，不重复维护一份数值表。
- 当前 CSS 中的历史变量（例如 `--surface`、`--text-primary`、`--border`）继续服务现有页面；本阶段不重映射、不批量迁移，也不宣称它们与 Quiet Studio token 等价。
- 新的基础组件实现可在确认迁移范围后逐页采用语义 token。正式页面的尺寸和视觉行为须由相应页面验收，不由此演示页改变。

## 页面接入示例

基础组件通过 `apps/web/src/components/ui/index.ts` 统一导出：

```ts
import { EotionButton, EotionInput, EotionSurface } from '../components/ui'
```

组件优先直接使用；页面自有 CSS 可引用同一套语义 token：

```css
.page-example {
  background: var(--e-color-canvas);
  color: var(--e-color-text-primary);
  font: var(--e-type-body-weight) var(--e-type-body-size) / var(--e-type-body-line) var(--e-type-family);
  gap: var(--e-space-4);
  border-radius: var(--e-radius-control);
}
```

颜色用 `--e-color-*`，字体族和字号/行高/字重/字距用 `--e-type-*`，间距用 `--e-space-*`，圆角用 `--e-radius-*`；border、shadow、motion 和 focus 也集中定义于 `tokens.css`。页面不要新建平行色表，也不要把旧变量名称映射成新 token。

Popover 的 trigger 应是可访问的原生按钮，将 slot 提供的 props 绑定到按钮；菜单项使用原生 button 和 `role="menuitem"`，关闭时调用 slot 的 `close()`：

```vue
<EotionPopover label="页面操作">
  <template #trigger="{ triggerProps }">
    <button v-bind="triggerProps" type="button" aria-label="打开页面操作">打开</button>
  </template>
  <template #default="{ close }">
    <button role="menuitem" type="button" @click="close()">重命名</button>
    <button role="menuitem" type="button" data-danger="true" @click="close()">删除</button>
  </template>
</EotionPopover>
```

Popover 本身提供有标签的 `role="menu"`、方向键/Home/End 导航、ESC/outside 关闭和触发器焦点返回。危险项通过 `data-danger="true"` 标记；它不应抢占打开菜单后的初始焦点。

Danger 文本使用冻结的 `danger` 色值与 `surface-subtle` 背景搭配（包括 hover），以维持 Dark 小字号文本的 AA 对比度；不要将它直接置于更亮的 `surface` / `hover` 上。Hover 可通过下划线反馈，keyboard focus 仍使用 focus ring。

## 主题与范围

Light、Dark、System 选择调用现有 `useTheme()` / `setThemePreference`。这复用既有的设备级主题偏好和系统主题解析；本工作不改认证、同步、存储协议或主题持久化行为。

`html[data-theme]` 只覆盖主题语义颜色；排版、间距和几何 token 共用同一套名称与数值。既有 HTML head 主题脚本仍先于 Vue 执行，生产测试通过阻断入口 JavaScript 检查新 token 在启动前可用。

这项工作仅建立 Web 主 UI 的基础组件与开发展示页。它不改变 Desktop / Mobile 壳边界，不将展示页接入正式产品导航，也不迁移生产页面。

## 本地查看与验证

在仓库根目录启动 `pnpm dev:web`，然后访问 `http://localhost:7173/#/__dev/ui-foundation`。相关验证位于 `apps/web/tests/ui-foundation.spec.ts`；Web 类型检查使用 `pnpm --filter @eotion/web typecheck`。

可选地设置 `EOTION_VISUAL_QA_DIR` 为仓库外目录后运行 UI Foundation Playwright 测试，输出 `desktop-light.png` 和 `desktop-dark.png`。

截图分支使用 reduced motion，并等待控件实际计算颜色与状态收敛，避免把主题切换的过渡帧作为视觉基线。普通交互测试保持默认 motion。
