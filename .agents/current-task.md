# 当前任务：ProductPages snapshot revision 收敛竞态

分支：`master`，基线 `153797d`。仅修首次 load 期间 refresh 丢失；10k Audit 保持 **B — PASS WITH DEBT**，不做性能优化、不开始 P9，Database UX Final Acceptance 仍 HOLD。

| Work Unit | 难度 / 角色 | 状态 | 验收 |
| --- | --- | --- | --- |
| 调查与最小方案 | S2 / 主 Agent | 完成 | pending 合并；原 load promise 串行读取；提交检查 epoch / workspace |
| 实现与确定性回归 | S1 / fast_worker | 完成 | 10k roleless + 50 Pages 经 snapshot / revision 后 nav=50，items=10050；切换/reset/重复触发/正常 load |
| 定向验证 | S0 / 主 Agent | 完成 | 相关 product store 测试、Web typecheck、git diff --check |
| 独立复核与交付 | Review / reviewer + 主 Agent | 完成 | 一个聚焦 commit，workspace clean |

禁止项：不改 sync contract、LocalStore schema/index、PageTree、Database navigation，不优化 legacy `$lookup`。

Remaining issues：Mobile Database Header UX、Table Cell Inline Editing、Drawer Motion、Universal Block +、Database UX Final Acceptance。

验证：新增 IndexedDB 竞态回归 2/2、已有 product-pages/product-sync 定向回归 5/5、Web typecheck、git diff --check 通过。独立 reviewer 无 blocker；本轮 PASS。一个聚焦提交后停止，不开始下一项。
