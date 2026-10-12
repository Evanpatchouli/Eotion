# 当前任务：P9.1A — Generic View Records Read Foundation（已完成）

master 基线 `13053793ffa4683e3ffdb6d7f1f512f270ebc499`；P8 COMPLETE / SEALED。开始时间 2026-10-12 13:20（Asia/Shanghai），25 分钟硬停止。

| Work Unit | 难度 / 模式 / 角色 | 状态 |
| --- | --- | --- |
| 定位现有 read 流程与测试边界 | S0 investigate / 主 Agent + scout | 完成 |
| 决定最小 generic seam 与兼容关系 | S2 decide / 主 Agent | 完成 |
| Contracts / SDK / API 最小实现 | S1 execute / fast_worker | 完成 |
| 定向 HTTP / contract / SDK 回归 | S1 execute / 主 Agent + fast_worker | 完成 |
| 最小验证与一次独立 review | S0 verify / scout；Review / reviewer | 完成：目标编译与 API 13/13；独立 review 无 blocker |

Implementation Brief：新增 GET `/api/workspaces/:workspaceId/databases/:databaseId/views/:viewId/records`；新增 `DatabaseViewRecordsQuery` / `DatabaseViewRecordsResponse` 和 schemas，legacy query/response 保留为兼容别名。SDK 增加 `getDatabaseViewRecords()`。将 getTable 查询体移至 `getViewRecords()`，getTable 只 delegate；transaction 递归调用 generic 方法。保持 permission、validation、filters/sorts、bounded query、title/derived projection、cursor 与 version/config fence 原样。

保持 DatabaseView.type=table，不改 Mongo/domain/view CRUD、queryTableWindow、cursor helpers、DatabaseTableRecord 或 Web。验收：legacy/generic 核心数据及分页等价、generic filter/multi-sort、workspace/database/view/version/config fencing；原 Table 测试保留。禁止完整 Web Product / Visual / Final Acceptance。完成文档、提交、报告后停止，不进入后续 P9。

验证：Contracts 23/23、SDK 23/23；两包 typecheck 通过。API 目标测试依赖闭包的 scoped TypeScript compile 通过；真实 HTTP + 原 database service tests 13/13，无 skip。完整 API build/typecheck 因未变的 MCP 源/依赖环境失败（缺失 MCP 包、Zod 类型错配），未修复。HTTP fixture 引入生产 HttpApiModule + ConfigModule + Mongo，保留所有原 Table 断言；不承担完整 AppModule 启动验收。详情见 handoff。

未发现本阶段或 P9 后续 seam blocker。完整 API 构建环境需另行恢复；不在本轮处理。提交后停止，不开始 View.type 泛化、List 或 Board。
