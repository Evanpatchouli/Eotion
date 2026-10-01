# Current Task — P5.7.5.2 Quiet Studio Product Shell + Sidebar

状态：完成（2026-10-02）；独立复核通过，无剩余阻塞项。

## Work Units

- S0 investigate：scout 定位壳层、Popover、现有测试与截图 fixture。
- S2 decide：主 Agent 确定保持现有 252px/响应式策略；统一 Popover 增加内部 dialog/宽度/open 接入，混合表单保留原生语义；折叠仅为 UI 状态。
- S1 execute：fast_worker 按 Brief 实现壳层、样式和 Popover；主 Agent 补充行为验证、截图与文档。
- S0 verify：执行 Web typecheck/build 与产品相关 Playwright，检查 1440×900 三态截图。
- Review：独立 reviewer 复核边界、可访问性、回归与最终 diff。

## Boundaries

仅 ProductShell / Sidebar / Topbar / workspace navigation 与必要共享 primitive；不修改 Editor、Page content、Attachment、Slash Menu、Settings 页面及业务逻辑。页面树仅应用壳层行样式，页面动作流程留给后续阶段。

## Done

桌面展开/动画折叠/Topbar reopen、右侧 16px 圆角、32px full-row hover/selected、底部全宽设置/退出、Popover ESC/outside/focus return/键盘可用；Web typecheck/build/tests；三态 1440×900 截图；提交 feat(ui): implement Quiet Studio product shell。

## Verification

- Web typecheck / production build（含 vue-tsc）通过。
- ProductShell / ProductFlow / PageTree / Foundation 集成 34/34 通过。
- 独立复核发现加载中浮层缺少可用按钮时焦点留在 trigger；已补 panel focus fallback 和 loading→loaded/empty 回归。
- 最终 ProductShell / Foundation 9/9 通过；最终 build 通过。
- 1440×900 expanded / collapsed / workspace popover 截图已生成并人工核对。
- 9 个修改文件 UTF-8 无 BOM；diff 检查通过。
