# 当前任务：Database Settings UI 微调（PASS）

master；基线 0bfca481151f27911238672f55faa7166d59a913。仅属性、筛选、排序与 Opening 顶部展示；不进入 Final Acceptance / P9。

| Work Unit | 难度 / 模式 / 角色 | 状态 |
| --- | --- | --- |
| 定位并确定最小展示方案 | S2 decide / 主 Agent | 完成：共享 Opening Collapse，局部 Select 复用现有 Popover |
| Opening Collapse 与文档 | S1 execute / 主 Agent | 完成：默认当前设备一行、展开三行 |
| Select、行对齐与 eye 控制 | S1 execute / fast_worker | 完成：禁用条件与保存逻辑保持原样 |
| 定向浏览器回归 | S1 execute / fast_worker | PASS：Database 11 条；三设备双 target、light/dark、320px 右侧抽屉、几何对齐、可见状态与保存 |
| Web typecheck / diff check | S0 verify / 主 Agent | PASS；Overlay / Settings 9 条定向回归 PASS |
| 独立最终复核 | Review / reviewer | 完成：窄容器问题已修，无剩余 blocker |

保留 Opening preference 数据结构与持久化、Filter / Sort / Property 规则、domain、Sync、Drawer Motion。仅窄属性容器将操作换行。

Browser plugin not available（browser runtime skill 未列出），使用项目 Playwright。桌面/手机 light/dark 与 320px 右侧抽屉截图已视检，截图保存在仓库外 visualizations/database-settings。

验证：
- pnpm --filter @eotion/web exec playwright test tests/product-database.spec.ts --grep "opening settings show|filter and sort setting menus|database UX controls|property settings remain usable|linked views keep independent|phone filter and sort panels" --workers=1
- pnpm --filter @eotion/web exec playwright test tests/product-database.spec.ts --grep "database settings exposes five entries|opening choices persist independently|third-row opening popover|property schema mutations" --workers=2
- pnpm --filter @eotion/web exec playwright test tests/product-overlay.spec.ts tests/product-settings.spec.ts --grep "opening model|desktop modal|phone drawer size|Popover|popover|Settings uses a selected|390px Settings index navigates|theme and toolbar controls" --workers=2
- pnpm --filter @eotion/web typecheck
- git diff --check

仅定向验证，未跑完整 product matrix。一个聚焦 commit，workspace clean 后停止。

Remaining issues：Database UX Final Acceptance。
