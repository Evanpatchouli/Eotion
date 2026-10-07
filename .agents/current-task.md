# 当前任务：P8.1 Database Domain Foundation

状态：COMPLETE / P8.1 PASS（2026-10-08）；基线 c0e716f；只完成 P8.1，不进入 P8.2；最终一个聚焦 commit。

| Work Unit | 模式/评级 | 负责 | 结果 |
| --- | --- | --- | --- |
| domain/server 与 editor/MCP 边界检索 | investigate/S0 | scouts | Evidence Pack 完成 |
| 模型、引用与原子创建决策 | decide/S2 | 主 Agent | 独立实体、稳定引用、事务 fail-closed |
| domain/contracts registry 基础 | execute/S1 | fast_worker | domain 23/23、contracts 10/10 |
| 独立 Mongo domain/service | execute/S1（必要边界 S2） | worker | API domain 4/4、引用/Record Page/原子性 |
| editor placeholder/MCP 兼容 | execute/S1 | fast_worker | MCP 30/30、P7+Database 49 个不同产品用例通过 |
| 最终回归与独立 review | verify/S0 + review | scout/reviewer | HTTP 26/26、Storage 7/7、SDK 18/18、typecheck/Web/API build；review 0 blocker |

旧 editor/sync/attachments 110 组发现 fixture 问题：非法快照需隔离 IndexedDB context，成功图片资源需显式 mock。修正后受影响两项 repeat3 共 6/6，最终完整组 110/110、exit 0；相关产品合计 159 个不同用例通过。没有削弱拒绝加载/无 editor、安全与持久化断言。

核心：Database/Property/Record/View 独立 Mongo 集合；Block 仅 databaseId/viewId；title/text/number/checkbox/select/date；table-only View；Record 指向同 workspace Page，关联 Page 删除拒绝；移除最后 Block 引用不删除数据。createInPage 原子创建 Database + title Property + default View + Block，不支持 transaction 返回503/零写入。
Database 数据不加入 Page/Block oplog；既有 Block 引用继续 sync。无新 MCP tools、无 Database HTTP/SDK CRUD、无 slash/完整 Table UI/Database sync。

产品验证发现 BlockIdentity 对单位置 leaf 的 offset+1 锚点越界；改用 leaf offset+assoc1，Database/divider/image/file IDs 稳定，非leaf保留原逻辑。

正式文档：docs/p8-database.md、roadmap、architecture、文档地图/context 已更新。验证与最终独立复核均已完成；一个聚焦 commit，确认 Git clean 后停止，不开始 P8.2。