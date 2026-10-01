# Current Task — P5.7.5.1 Quiet Studio Token Foundation

状态：完成（2026-10-02）。本轮用户已明确授权 Design Freeze 后基础设施实现；不代表整个 P5.7 页面迁移或 Visual Acceptance 已完成。

## Work Units

- S0 investigate：scout 定位 theme/bootstrap、图标体系与现有验证入口，完成。
- S2 decide：主 Agent 确定新 --e-* token 与旧页面变量并存、复用设备主题，不迁移业务页面，完成。
- S1 execute：fast_worker 落地 token、七类 primitive、DEV 展示页、交互测试与使用文档，完成。
- S0 verify：scout 执行工程与浏览器验证；主 Agent 复核实际截图、编码与 diff，完成。
- Review：独立 reviewer 复核最终实现、缓存测试前置条件及 danger 对比度，无 blocker。

## Implementation boundaries

- 颜色值来自 docs/design/design-system-v1.md；Light/Dark 共用语义名称及几何 token。
- 保留现有 Settings 的 Light/Dark/System、localStorage key、启动前主题脚本和业务页面旧变量。
- 未修改 auth/sync/storage/API 或 ProductShell、Sidebar、Editor、Settings、Page Tree、附件业务 UI。
- 基础组件统一使用 EotionIcon/Morphicons；/__dev/ui-foundation 不进入生产路由或产品导航。
- Danger 文本配 surface-subtle，避免在更亮 Dark surface/hover 上不足 AA。
- 缓存恢复测试先等待首次已同步，再注入 /me 失败和 reload；原有恢复断言全部保留。

## Verification

- pnpm typecheck：通过（Web/Desktop/API）。
- pnpm build:web：通过（最终版本，含 vue-tsc、Vite、SW）。
- 11 个相关 Playwright spec、workers=2：128/128 通过，无跳过/重试。
- playwright.theme-production.config.ts：2/2 通过，入口 JS 被阻断时新主题 token 仍可用。
- Light/Dark 1440×900 桌面截图复核：颜色生效、几何相同，无 overlay/console error；Popover 开合无布局位移。
- UTF-8 无 BOM、git diff --check、最终范围复核：通过。
- 独立 HEAD 基线用于定位缓存测试时序；临时 worktree 已归档清理。

## Handoff

基础设施入口及 token 使用见 docs/design/implementation-notes.md。后续页面迁移按独立任务逐页进行，不能以本阶段完成为由扩大范围。
