# 当前任务：P8.4 Views + Filter + Sort

状态：COMPLETE / PASS；基线 4f123090066b7016f1c658a3536f4bd88c624853。仅 P8.4，最终一个聚焦 commit，不开始 P8.5。

| Work Unit | 模式/评级 | 负责 | 验收 |
| --- | --- | --- | --- |
| 现有服务端/引用/分页调查 | investigate/S0 | backend_scout | COMPLETE：Evidence Pack |
| View contract/query/lifecycle 决策 | decide/S2 | 主 Agent、web_decide | COMPLETE：typed config、Mongo mapping、safe deletion、CAS Brief |
| Domain/contracts/SDK/API 与回归 | execute/S1 | backend_impl | COMPLETE：六类型 filter、多 sort、有界查询、事务清理 |
| Quiet Studio View controls 与产品测试 | execute/S1 | web_impl | COMPLETE：多 View、独立配置、linked/reload/offline、390px |
| 验证与正式文档 | verify/S0 | backend_scout、主 Agent | COMPLETE：全部要求的 tests/build/visual 与正式文档 |
| 最终独立复核 | review | reviewer | COMPLETE：查询成本、SDK 入参与特殊 option ID 清理问题修复后 0 blocker |

禁止高级 Property/View、OR/nested filters、Database MCP、完整 Database offline sync。Page/Block 继续 Local-first，View 配置 online-only。

Domain 24/24、Contracts 12/12、SDK 20/20、API domain 5/5、HTTP 27/27、MCP 30/30、storage package 7/7、visual 7/7 全部通过，零 skip。最终完整 product 239/239、Storage IndexedDB/Electron/Sync 11/11、根 typecheck、Web/API build 通过。默认查询的 Mongo profiler 成本回归与 SDK 缺版本负向编译检查通过。

首轮旧编辑器 retry / Electron restart 用例各一次超时；两类定向重复各 6/6 通过，最终完整回归通过，未改对应产品或削弱断言。P8.4 PASS/current，正式契约与限制见 docs/p8-database.md；P8.5/P8.6 not started。
