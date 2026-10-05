# P5.7.6 Visual Acceptance & Regression

## 状态与证据边界

**P5.7 PASS（2026-10-06）。** 自动视觉比图、Web/Storage/Offline 功能回归及独立工程 review 已完成；Quiet Studio 正式产品画面经过迭代实现、用户截图 review 与部分真机交互 review，并于 2026-10-06 获得用户最终视觉签字。本页继续作为 P5 closeout 的 canonical visual baseline。原计划中的预实施 Gate A 没有按完整顺序发生，不倒填为历史 PASS。

## Canonical Design Version

- Direction：[Quiet Studio](design-direction.md)，2026-10-01 FROZEN。
- P5 已存在能力：[Design System v1](design-system-v1.md)，2026-10-03 FROZEN；未来 UI 不预先冻结。
- 六个 Required Screen 与 Gate A reconciliation：[Core Screen Spec](core-screen-spec.md)。
- 实现起点：`4678286`，包含 P5.8.7 Inline Link、Mobile Settings 30px gutter 与单一 Topbar Back。本页视觉基线对应本次 closeout 提交，截图存于仓库内。

## Visual Baseline Matrix

| Snapshot | Viewport / Theme | 覆盖的视觉合同 |
| --- | --- | --- |
| `page-desktop-light.png` | 1440×900 / Light | ProductShell、Sidebar、Page Tree、Topbar、Open Canvas、Editor、同步状态 |
| `page-desktop-dark.png` | 1440×900 / Dark | 与 Light 相同 geometry 的主题表达 |
| `page-tablet-light.png` | 1024×900 / Light | 中等宽度 Shell 与阅读列 |
| `page-mobile-light.png` | 390×844 / Light、真实 Chromium touch/coarse context | mobile shell、标题/正文、Touch Toolbar、无横向溢出 |
| `settings-desktop-light.png` | 1440×900 / Light | Settings list-detail 与表单 |
| `settings-profile-mobile-light.png` | 390×844 / Light | Profile Detail、单一 Topbar、无 compact back、30px gutter |
| `connectivity-backend-unavailable-desktop.png` | 1440×900 / Light | 无可信身份且 `/auth/me` 返回 503 时的连接恢复状态 |

Closeout B 仅更新四张 Page 基线：Desktop Light/Dark、Tablet Light、Mobile Light。首次正常阈值比图只检出 Mobile 差异；临时以零像素差异核对后，Desktop Light/Dark 与 Tablet 也确有标题旁文案变化，因此一并重建。Settings 两张及 Connectivity 像素未变，未更新；配置阈值保持 `0.001`。更新后的正式 visual regression 为 **7/7 PASS**，最终用户视觉签字已于 2026-10-06 完成。

Snapshot 不覆盖所有交互状态。Drawer、Slash、Bubble、附件、Settings 其它 Detail、Mobile Dark、Tablet Dark、原生系统 Selection Menu 与真实键盘行为由既有功能/响应式测试和人工验收覆盖；不能把未建 snapshot 的组合称为自动视觉比图 PASS。

## Screenshot Regression Policy

- Tool：Playwright 官方 `expect(page).toHaveScreenshot()`，Chromium / Chrome channel，device scale 1；不自建 pixel diff。
- Suite：`apps/web/tests/visual-regression.spec.ts`；独立配置：`apps/web/playwright.visual.config.ts`；基线目录：`apps/web/tests/visual-regression.spec.ts-snapshots/`。
- 固定 mock API、用户/Workspace/Page/Block、时间戳、viewport、语言/时区、主题与 reduced motion；截图关闭动画与 caret，等待可观察的页面内容和稳定同步状态。浏览器、操作系统与字体渲染差异可能影响像素；当前基线在 Windows 本地 Chrome 生成。跨操作系统 CI 启用前须固定镜像/字体并在相同环境重建已审阅的基线。
- 本地比较：`pnpm --filter @eotion/web test:visual`。
- 有意更新：`pnpm --filter @eotion/web test:visual:update`，随后重新运行比较并人工逐张审阅 diff。只在获批准的 UI 变化或确定性渲染环境更新时提交新图；测试失败不能直接无脑更新。
- 允许差异：`maxDiffPixelRatio: 0.001`，用于极小的渲染噪声；布局、文本、色彩变化仍需人工审阅。失败时先排查 fixture、字体、浏览器版本、动画和真实 UI 变更。
- CI：仓库当前没有既有 CI 配置；本轮提供稳定本地入口，**CI visual comparison 尚未启用**。不为本轮新增大型 CI 管道。

## Design Fidelity Review

| 项目 | 当前证据与结论 |
| --- | --- |
| Typography | `tokens.css` 中 Page Title 36/45/600、Body 15/26/400；Page Light/Dark/Mobile 基线可见层级。中文/Latin 的跨平台字体形态已纳入 2026-10-06 用户最终视觉签字。 |
| Spacing / rhythm | 720–740px 阅读列、44px Topbar、32px Sidebar row 和 Settings Desktop list-detail 已有实现与响应式测试；截图锁定整体节奏。 |
| Surface hierarchy | Open Canvas 无外层 Editor Card；Sidebar 与浮层使用有限层级。附件的具体状态由 `product-attachments.spec.ts` 验证，未纳入本次 7 张基线。 |
| Responsive | 1440/1024/390 截图；Mobile Page 与 Settings 测试检查无横向溢出，Settings Detail 检查 30px gutter。真实宿主安全区/键盘仍需设备检查。 |
| Light / Dark parity | Desktop Page Light/Dark 两张基线及现有 theme/product-editor 测试；未建立全部 Dark viewport 的自动截图。 |
| Interaction feedback | Sidebar/Popover/Settings、Slash/Bubble/Touch 行为由既有产品测试保护；静态截图不能证明 hover、focus、系统 Selection Menu 或 IME。 |
| Editor chrome | 默认 Open Canvas、Desktop fixed toolbar 默认关闭、Mobile/coarse Touch Toolbar；`product-editor.spec.ts` 覆盖选区模式与工具栏几何。 |

## Accessibility Closeout

| 路径 | 本轮可验证证据 | 状态 |
| --- | --- | --- |
| Keyboard focus-visible / menu | `product-settings.spec.ts` 的焦点、键盘控件；`product-editor.spec.ts` 的 Bubble/Escape；`product-sync.spec.ts` 的诊断 disclosure 键盘与 focus-visible | 自动回归验证；完整键盘遍历仍需人工检查 |
| Settings controls | Profile、Theme radio、switch、单一 Back 与 44px navigation target 的现有测试 | 自动回归验证 |
| Reduced motion | `tokens.css` 在 `prefers-reduced-motion: reduce` 下将 motion tokens 归零；Settings 与 connectivity 测试覆盖该媒体偏好 | 自动/静态验证 |
| No horizontal overflow | Mobile Page/Settings、connectivity 与编辑器触摸路径的现有断言；本次 Mobile snapshot 前额外断言 | 自动回归验证 |
| Touch targets | Touch Toolbar 44px、Settings Back/navigation 44px 有几何断言；`EotionButton` coarse 36px 是已批准例外；Desktop Bubble 32px 属 fine pointer | 已验证所列控件；全站逐点审计仍需人工检查 |
| Token contrast | 当前 token 静态计算：Light muted/sidebar 4.64:1、muted/canvas 4.85:1；Dark muted/subtle 4.84:1、danger/subtle 4.55:1 | 所列 token 配对 ≥4.5:1；完整 UI 状态组合 MANUAL CHECK REQUIRED |
| 200% zoom、真实设备安全区/IME、原生 Selection Menu、屏幕阅读器 | 本次没有新的真实设备或辅助技术证据 | **MANUAL CHECK REQUIRED** |

## Functional Regression Reference

Closeout B 验证：`test:product` **148/148 PASS**，`interaction-foundation.spec.ts` **7/7 PASS**，`test:storage` **11/11 PASS**，`test:real-sync` **1/1 PASS**，Web typecheck/build PASS；四张 Page 基线更新后 `test:visual` **7/7 PASS**。下列为 Closeout A 建立原始基线时的历史记录。

- Web：`pnpm --filter @eotion/web typecheck`、`pnpm --filter @eotion/web build` 均 PASS；`pnpm --filter @eotion/web test:product` **147/147 PASS**（Shell/Page/Editor/Sync/Attachments/Settings）。初次运行暴露测试夹具时序竞态，补稳定前置条件后完整复跑通过；未削弱产品断言。
- Visual：`pnpm --filter @eotion/web test:visual:update` 7/7 PASS，随后 `test:visual` 连续两次各 **7/7 PASS**。
- Desktop/storage：`pnpm --filter @eotion/web test:storage` **11/11 PASS**（含 Electron SQLite/product path）。
- Offline shell：`pnpm --filter @eotion/web test:offline-shell` **1/1 PASS**。
- 真实 Mongo/API 双客户端 `test:real-sync`：**NOT RUN in this visual closeout**；本轮未启动相应 Mongo replica set、API 和生产 Web 测试环境，既有历史结果仍按各自验收记录引用。P5.4 HarmonyOS 完全离线冷启动已在 Final Acceptance 中转为 Accepted Limitation，见 [`p5-real-sync.md`](../p5-real-sync.md)。

## Deviations / Final Review

| 与原设计目标的差异 | 当前事实与处理 | 状态 |
| --- | --- | --- |
| 稳定保存/同步状态只在顶部常驻 | ProductShell `SyncStatus` 是唯一常驻入口；Page 标题旁不再显示“已保存到本地”。离线仍显示“离线 · 本地已保存”，本地持久化失败仍在编辑器附近显示错误与重试。更新后的 Page 基线已获得用户最终视觉签字。 | PASS |
| 早期高保真 Gate A 顺序 | Quiet Studio 方向先冻结，具体交互和 Mobile 画面经生产实现、用户截图与设备 review 逐步冻结；本轮将结果正式写回设计文档。 | 已如实 reconciliation；不追认早期 PASS |
| Mobile WebView 真机完全离线重启 | HarmonyOS 杀 App 后完全离线冷启动存在已确认限制；浏览器/IndexedDB 自动测试不能替代宿主边界。 | Accepted Limitation，不阻塞 P5 |

- UI/UX final reviewer：**用户最终视觉签字 PASS（2026-10-06）**。
- Engineering review：本轮独立复核发现的 3 项文档/测试边界问题已修正；复核与验证结果见 `.agents/current-task.md`。
- P5.7 最终 PASS：**已声明（2026-10-06）**。
- P5 Final Acceptance：**PASS（2026-10-06）**，见 [P5 Final Acceptance](../p5-final-acceptance.md)。
