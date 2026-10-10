# 当前任务：P8.5 Advanced Properties — PASS

基线：5179c584b335484268e9b9be995d529ef5b2f5d6。仅 P8.5，不开始 P8.6；一个聚焦 commit。

| Work Unit | 模式/评级 | 负责 | 验收 |
| --- | --- | --- | --- |
| API 事务、CAS、查询扩展点调查 | investigate/S0 | investigate_api | COMPLETE：Evidence Pack 交接 |
| 高级属性 contract、AST、图与类型边界 | decide/execute S2→S1 | domain_contract、主 Agent | COMPLETE：Domain30/Contracts15；严格 enum、cycle/depth/string guards |
| scope、引用 fence、删除清理与读取计算 | decide/execute S2→S1 | api_impl、api_acceptance_tests | COMPLETE：API domain9/HTTP27/MCP30；scope、生命周期、5001预算与竞争 |
| 现有 Inline Table 配置与 relation picker | decide/execute S2→S1 | ui_impl | COMPLETE：SDK21、Database32；跨库组合/刷新、390px/离线/重试 |
| 全范围回归、正式文档与聚焦提交 | execute/verify S1/S0 | 主 Agent、final_verify | COMPLETE：fresh product243、storage7+11、visual7、titlebar2；typecheck/build/diff |
| 最终独立 review | review | final_review | COMPLETE：最终0 merge blocker |

单向 multi Relation（Record ID[]<=50，重复拒绝，稳定顺序），self/纯 Relation 图环允许。Rollup 仅基础目标属性、读取计算；Formula 小型严格 AST、同库依赖图验证、允许 Rollup 输入；派生拒写/拒 Filter/Sort，不持久化。目标同 Workspace，CAS + Mongo snapshot transaction + source/target 内部 fence；删除 Record 同事务清理 incoming relations，不删除 Page；依赖 Property 拒删。Page/Block Local-first、Database online-only、MCP 均保持边界。

Bounds：AST128/深度16/依赖16/字符串20000；候选50、search候选5000；派生100行/总5000目标；workspace advanced properties1000；清理总10000源记录，超限fail-closed。

最终验证已通过。Desktop node12/17：4项 legacy block props fixture与1项Temp清理EPERM属于已确认基线，相关文件hash与HEAD一致，EPERM隔离复现；未修无关问题。两项附件fixture早期超时各隔离3/3通过；HMR导致的模块状态分离在fresh全产品243/243解决，未改断言。最后strict enum修复后domain/contracts/API/Database/typecheck/build再次通过，独立review复核0 blocker。

正式契约与限制见 docs/p8-database.md；后续只在用户明确要求时进入P8.6。