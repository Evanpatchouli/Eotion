# 当前任务：Modal / Drawer Popover clipping 修复（PASS）

master；基线 790ce24。仅共享 Overlay layering，不进入 Final Acceptance / P9。

| Work Unit | 难度 / 模式 / 角色 | 状态 |
| --- | --- | --- |
| 定位并决定边界 | S2 decide / 主 Agent | 完成：root 保留 native dialog，visible overflow；shell 裁切内容 |
| 共享 Overlay 实现 | S1 execute / 主 Agent | 完成：所有容器共用 shell，Body 保持独立滚动 |
| 浏览器回归 | S1 execute / fast_worker | PASS：Opening root 越界 hit-test / Drawer Popover / light-dark |
| 已知验证 | S0 verify / 主 Agent + fast_worker | PASS：Overlay 36、Popover 1、既有 Opening 3、新增菜单交互 4；Web typecheck、git diff --check |
| 独立复核 | Review / reviewer | 完成：组件无 blocker；测试 fixture 绑定/teleport 问题已修，4 条新交互复跑 PASS |

根因：最近 Overlay root 的 overflow:hidden 裁切其直接 teleport 子节点。root 改 overflow:visible，内层 shell overflow:hidden / border-radius:inherit；不改 z-index、teleport destination、focus/close lifecycle。Bottom Drawer safe-area padding 移到 shell。

Record 第三行菜单实际越过 Modal 下边界，临时 hidden 负对照无法命中越界 option；移除临时样式后命中。Record/Property option click、Escape、outside click、focus 均通过。Right/Bottom Drawer 菜单通过；四种容器长 Body scroll 不移动 Header/Footer。light/dark 截图已视检。

验证：
- pnpm --filter @eotion/web exec playwright test tests/product-overlay.spec.ts --workers=2
- pnpm --filter @eotion/web exec playwright test tests/product-overlay.spec.ts tests/ui-foundation.spec.ts --grep "Popover|modal|body|drawer|footer|focus" --workers=2
- pnpm --filter @eotion/web exec playwright test tests/product-database.spec.ts --grep "database settings exposes five entries|record opening settings use|opening choices persist independently" --workers=2
- pnpm --filter @eotion/web exec playwright test tests/product-database.spec.ts tests/product-overlay.spec.ts --grep "third-row opening popover|keeps an in-overlay popover" --workers=2
- pnpm --filter @eotion/web typecheck
- git diff --check

Browser plugin not available（未提供 browser runtime skill），使用项目 Playwright Chrome。截图在仓库外会话 visualizations/overlay-clipping。未跑完整 Database suite。

一个聚焦 commit；workspace clean 后停止。Remaining issues：Database UX Final Acceptance。
