# 当前任务：P11.1B Generic Date Data Path（PASS，已完成并停止）

当前正式版本：`0.0.1`，P11 目标版本为 `0.0.3`；本轮不修改版本号。
基线工作树干净，HEAD 为 `499877a`，P11.1A Domain Foundation 已完成；文档契约提交为 `94ffdcd`。
本轮仅执行 P11.1B，完成后停止，不进入 P11.1C。

## Work Units

| Work Unit | 模式 / 难度 | 目标 | 状态 |
| --- | --- | --- | --- |
| B-1 | investigate / S0 scout | 定位 Domain/Contracts/派生值、API/Mongo 查询与测试环境、Web Table 日期链路 | 已完成；找到现成 MongoDB 8.0.32 二进制 |
| B-2 | decide / S2 主 Agent | 冻结 mixed date/datetime 比较、cursor、Formula 投影与无损编辑 Implementation Brief | 已完成，规则写入 §10.4；后续实现降为 S1 |
| B-3 | execute / S1 fast_worker | 复用 P11.1A 扩展 Domain/Contracts/Formula 与相关回归 | 已完成；`5e2d3e1`，Create 初值 schema 随 `03d8ee0` 提交 |
| B-4 | execute / S1 fast_worker | 适配 API/Mongo 查询、持久化与真实集成回归 | 已完成；`03d8ee0`，真实 Mongo 19/19 通过 |
| B-5 | execute / S1 fast_worker | Table 日期展示/编辑、字段保留与 Web 回归 | 已完成；`ccc3b63`，完整 Database 回归 111/111 通过 |
| B-6 | verify/review / S0 scout + reviewer | 最小充分测试、typecheck/build、真实 Mongo、独立复核、文档/提交收口 | 已完成；0 blocker、所有相关验证通过，文档随本提交收口 |

## Invariants 与范围

- 复用 `packages/domain/src/date.ts`，保持 P11.1A 严格校验与 normalization。
- legacy `YYYY-MM-DD` 无损读写；新 Date 对象 `{ start, end?, timeZone? }` 只允许 Date Property。
- datetime 为 canonical UTC instant + IANA timezone；all-day 无 timezone；省略 end 保持单点。
- 沿用 Database/Property/Record/View、generic Record API、online-only、事务/CAS。
- Mongo Filter/Sort/Cursor 使用一致比较规则；不做全库 migration，不加独立日期集合。
- Formula 不引入 range 结果类型；Rollup 保持既有范围。
- 仅改现有 Table Date Cell；不创建 Timeline UI、Timeline mutation 或 MCP 工具。
- Page/Block local-first sync、版本号及 P11.1C 后续范围不变。

## 验证与提交

已启动全新隔离 MongoDB 8.0.32 replica set（`p111bAcceptance`，127.0.0.1:27711），
primary / transaction probe 通过；不会复用历史 dbpath 或用户数据库。

Implementation Brief：Date sort / cursor 统一 canonical UTC start；date-only 视为 UTC 零点。
已有 date Filter 保持按天，datetime 比较 UTC start 日历日；Formula 同样投影 UTC start 日期。
end / timeZone 保留且不影响现有查询排序；Rollup / 类型转换保持原支持矩阵。
Table 使用完整日期草稿、明确 UTC datetime 输入与独立时区字段，字段切换不触发半成品保存。
HTTP 原 Record POST 增加可选初始 properties，复用共享值 schema 与按真实 Property 校验；
原无初值创建请求保持兼容，Page / Record / Database 版本仍在同一事务内提交或回滚。
详细行为契约见 `docs/p11-timeline.md` §10.4。

Web 全量先出现旧 Board drawer 标题草稿时序失败；S2 只读调查发现测试未等 embedded
Record Editor 可编辑，已将决策降为 S1、仅在两旧测试加强就绪等待与操作前草稿断言。
原操作后身份/草稿/联动数据断言保留，Page/Block sync 与 P9 产品逻辑未修改；新鲜全量 111/111 通过。

已覆盖 legacy/new date API 往返、非法对象拒绝、mixed Filter/Sort、多页 cursor、CAS/事务回滚、
Formula/Rollup、Table 编辑保存重载与 P8/P9 关键回归。
Domain 41/41、Contracts 24/24、SDK 23/23、Storage 7/7、真实 Mongo API 19/19、完整 Web
Database 111/111（workers=1 / retries=0）；相关 typecheck/build、diff / UTF-8 检查通过。
隔离 Mongo 测试实例已停止，日志/截图在工作区外保留。

未运行完整 Product、API performance/MCP 全套和 Desktop/Lynx 原生真机；390px 是响应式
Web 证据，既有 Vite chunk warning 保留。详细验证、初轮失败处理与文件清单见
`docs/verification/p11-1b-generic-date.md`；跨会话入口已写入 `.agents/handoff.md`。
停在 P11.1B；P11.1C 未开始，只在用户明确请求后接续。
