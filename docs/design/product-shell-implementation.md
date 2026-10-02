# P5.7.5.2 Quiet Studio Product Shell + Sidebar

桌面壳层采用 Quiet Studio 的 canvas/sidebar 语义色、44px Topbar、侧栏右上/右下 16px 圆角与 32px 页面树／底部操作行。内容仍通过原有 RouterView 渲染，本阶段不迁移编辑器、页面正文、附件、Slash Menu 或 Settings。

## 布局与导航

- 沿用既有桌面 252px、平板 210px 侧栏与 runtime layout 断点，不视为新的设计冻结值。
- 页面树区域独立滚动，账号／工作区入口与底部设置、退出登录保持可访问。
- 桌面／平板可收起侧栏；侧栏退出布局并设为 inert，Topbar 的“展开侧边栏”恢复入口接收焦点。展开后焦点回到收起按钮。
- 折叠状态仅保留在当前壳层生命周期内，不新增设备偏好或存储行为。移动端保留既有抽屉交互。
- 动画使用 motion token，并尊重 reduced motion。
- Sidebar 的折叠／移动关闭、Workspace 箭头、页面新建与页面操作共用 trailing 宽度及行右侧 padding，以页面 `...` 中心为基准对齐。
- 页面树只保留一个 24px leading slot。有子页面时默认显示页面图标，行 hover 或键盘 focus-visible 时切换为对应展开状态的 chevron；鼠标移开恢复图标，展开状态保留。触摸／无 hover 环境常显 chevron。真实 disclosure button 提供 `aria-expanded`，只展开／收起；主导航按钮只打开页面，trailing `...` 只打开操作。无子页面时图标保持不变。

## 工作区浮层

工作区入口复用 EotionPopover；Teleport 到 body，以 absolute 坐标锚定触发器，宽度 240px、间距 6px，开合不推动页面树。窗口 resize、滚动与浮层尺寸变化会更新位置。

包含新建／重命名表单时使用非模态 dialog 语义，工作区选择与操作仍是原生按钮。方向键/Home/End 在列表按钮间导航；表单内方向键保持输入行为，Tab/Shift+Tab 可到达输入框和提交按钮。ESC、外部点击关闭浮层并返回触发器焦点。既有 workspace 创建、重命名、切换、认证及同步流程保持原有实现。

## 验证入口

在仓库根目录执行：

```powershell
pnpm --filter @eotion/web typecheck
pnpm --filter @eotion/web build
pnpm --filter @eotion/web exec playwright test tests/product-shell.spec.ts tests/product-flow.spec.ts tests/product-pages.spec.ts tests/ui-foundation.spec.ts
```

设置 `EOTION_VISUAL_QA_DIR` 为输出目录并运行 `product-shell.spec.ts`，生成正式产品路由的 1440×900 截图：`sidebar-expanded.png`、`sidebar-collapsed.png`、`workspace-popover.png`。截图使用固定 API fixture；编辑器的既有呈现尚未在此阶段迁移。

同一 suite 覆盖 Desktop / Tablet / Mobile 右侧图标中心误差 ≤1px、hover 标题位置不变、展开与导航点击隔离、无子项保持图标、键盘 Space/Enter 和触摸展开；额外截图为 `sidebar-disclosure-default.png`、`sidebar-disclosure-hover.png`。

页面动作浮层属于后续实施单元，本阶段只统一页面树行的壳层样式。

2026-10-02 验证：Web typecheck、生产 build 通过；上述四个 Playwright 文件初次集成验证共 34/34 通过。独立复核后补充加载中→有工作区／空列表的键盘回归：没有可用按钮时 dialog 面板接收焦点，加载完成后 Tab 可进入按钮。最终 build（包含 vue-tsc）与壳层／基础组件测试 9/9 通过，并重新生成三态截图。截图已核对 1440×900、侧栏几何与 Popover 开合；内容区保留既有编辑器与本地保存状态，本阶段不宣称完成整个 Page 的 Quiet Studio 迁移。
