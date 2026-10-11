# 当前任务：Property Type Mutation — Domain / API Foundation（PASS）

master；基线 05887e020aa6c731b87bd8847a62a47ec403edfe。仅 Contract、Domain conversion、Server atomic mutation、API/service；未接 UI、Type List、Final Acceptance/P9。

| Work Unit | 难度 / 模式 / 角色 | 状态 |
| --- | --- | --- |
| 定义原子迁移与依赖边界 | S2 decide / 主 Agent | 完成：复用 transaction/CAS/scan/reference fence；校验本库及 incoming Rollup 来源库 |
| Domain conversion、专用 contract 与 tests | S1 execute / fast_worker | 完成 |
| API/service/repository 原子实现 | S1 execute / fast_worker | 完成 |
| API 定向回归测试与正式文档 | S1 execute / 主 Agent | 完成 |
| 定向验证 | S0 verify / 主 Agent | Domain database 14/14、Contracts database 14/14、API database 12/12；新增并发回归及最后 Property 写入失败后再定向复验 1/1；API build/typecheck、diff check PASS |
| 最终独立复核 | Review / reviewer | 无 blocker；建议直接并发测试已补充并通过，SDK 不在本轮范围 |

验证包含真实 Mongo 10,001 条拒绝、第二条 Record/View/Property 写入后注入故障完整回滚、Formula 与跨库 Rollup 冲突、类型变更与 incoming Rollup 创建并发、版本/权限/CSRF、清理及稳定身份。未运行 Web product suite。

剩余：Property Type Mutation UI hookup；Database UX Final Acceptance。聚焦提交后停止。
