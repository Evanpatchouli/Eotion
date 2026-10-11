# 当前任务：Drawer Motion Final Re-acceptance（PASS）

master；基线 65e7b5ea7736bc0f46999fe82d84e12e362e20b8。仅复验 a37aba8 Drawer Motion 与 65e7b5e snapshot 修复，未修改产品实现。

| Work Unit | 难度 / 模式 / 角色 | 状态 |
| --- | --- | --- |
| 验收行为与现有证据覆盖审读 | S0 investigate / 主 Agent | 完成：Right / Bottom / Desktop、关闭入口、backdrop、退出生命周期与 reduced-motion |
| Overlay、Database、snapshot 回归与 Web typecheck | S0 verify / scout | 完成：Overlay 35/35、Database 59/60；typecheck、diff check 通过 |
| 同次 Phone snapshot convergence → 保存 → leave 探针 | S0 verify / 主 Agent | PASS 2/2：身份与 draft 保留，保存正确，leave 前后资源清理正常；临时文件已删除 |
| 验收结论、任务与 handoff 记录 | S1 execute / 主 Agent | 完成：Drawer Motion PASS，完整 Database 非全绿 |
| 最终聚焦验收复核 | Review / reviewer | 完成：无 Drawer Motion blocker，无关失败归属复核完成 |

完整命令：pnpm --filter @eotion/web exec playwright test tests/product-overlay.spec.ts tests/product-database.spec.ts --workers=1 --retries=0；共 94/95（2.4 分钟）。Phone Filter/Sort 原 blocker 消失；实际 snapshot hydrate、PageView 比较、DOM / Vue identity 与无瞬时卸载均通过。opening / record / 相关 Database overlay 通过。

唯一失败：edits versioned cells and manages property options without losing stable IDs，product-database.spec.ts:2118。属性 Drawer 已 open，测试点击被其 property-row 覆盖的背景 Table 文本按钮；一次隔离复现仍失败，证据不指向 Motion 或 snapshot。按范围停止诊断，未修复、不认定为历史既有失败。未跑整个 product matrix。

正式结果见 docs/p8-database.md 与 .agents/handoff.md。仅验收记录提交，不修改 Motion。Remaining issues：Universal Block +、Database UX Final Acceptance；完成 acceptance commit 后停止，不开始 Universal Block +、Database UX Final Acceptance 或 P9。
