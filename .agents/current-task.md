# 当前任务：Database View Selector UX 收尾（PASS）

master；基线 589f0af6dc1e6723040b75426221bf67e65d8bed。仅浮层，不进入 Final Acceptance / P9，不改 domain / Sync / Drawer / Opening preference。

| Work Unit | 难度 / 模式 / 角色 | 状态 |
| --- | --- | --- |
| 定位并确定实现边界 | S0 investigate / 主 Agent | 完成：复用 renameView / deleteView / viewBusy / viewError |
| 浮层局部实现 | S1 execute / 主 Agent | 完成：删除底部管理区与当前文案，行内 contenteditable 与 icon actions |
| 定向测试调整 | S1 execute / fast_worker | 完成：Popover / View CRUD 与编辑、触控、失败重试契约 |
| 已知验证 | S0 verify / fast_worker + 主 Agent | PASS：6/6 定向 Playwright（14.8s）、Web typecheck、git diff --check |
| 独立复核 | Review / reviewer | 完成：超长名称静默回滚问题已补明确错误提示，复核无剩余 blocker |

验证命令：pnpm --filter @eotion/web exec playwright test tests/product-database.spec.ts tests/ui-foundation.spec.ts --grep "database view popover|database views create|database view selector|Popover supports" --workers=2。

测试确认同一 span 原位置编辑、行高保持、caret 末尾、blur / Enter 保存、Escape / 空名称恢复、IME Enter 不提交、非当前重命名和删除不切换、最后一个 View 禁删、hover / focus-within 与 touch coarse actions、muted 新建、外部点击关闭。保存失败仍通过既有 viewError 报告并可重试。正式 UI 契约已写回 docs/p8-database.md。

Browser plugin not available（session 未列出 browser runtime skill），按 frontend-testing-debugging 使用项目 Playwright Chrome。Desktop / Phone light / dark 截图已查看；截图保存在仓库外会话 visualizations/view-selector。首轮失败为测试 locator、颜色格式及未先 hover，修正后定向检查全部通过。未跑完整 Database suite。

一个聚焦 commit；workspace clean 后停止。Remaining issues：Database UX Final Acceptance。
