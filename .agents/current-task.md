# 当前任务：P8.6 Database Final Acceptance

基线：`ed87dfe2838279d84cac838720af252ee985e37c`（master）。本轮只做最终组合验收、真实 blocker hardening、fresh 验收、文档与一个 Final Acceptance commit；不开始下一阶段。

| Work Unit | 模式/评级 | 状态 / 验收 |
| --- | --- | --- |
| 服务端组合正确性、Page.title 分页、Relation/Rollup/Formula、删除/CAS/scope | investigate S0 → hardening S2 | COMPLETE：Page title 变更事务性推进 Database version；旧游标 fail-closed；Relation/derived/delete/reference fence 与 legacy 路径回归通过 |
| Linked View、UI、Local-first/MCP、P5–P8 数据兼容 | investigate/verify S0 | COMPLETE：共享数据与独立 View config、reload、390px responsive、offline read-only、MCP 稳定引用及 legacy 数据读取通过 |
| 5k/10k 查询性能、Mongo profiler/explain、bounds | verify S0 | COMPLETE：独立 Mongo 5k/10k harness fresh 通过；记录 query latency、docs/keys、stages、usedDisk 与 overflow cleanup |
| 测试矩阵、hardening、最终文档 | execute/verify S1/S0 | COMPLETE：domain 31、contracts 16、SDK 21、API domain 12、HTTP 24、MCP 30、product 244、storage 7+11、visual 7、titlebar 2 全通过；typecheck 与 Web/API/Desktop build 通过 |
| 独立最终 review | review | COMPLETE：0 merge blocker；只读审查并发、权限、cleanup、derived、性能 harness、UI 与离线测试屏障 |

实现变更：Page.title 修改关联 Record 页时在同一事务内推进 Database version，并通过 Page `updatedAt` CAS 覆盖关联竞争；增加 exact/limit+1、legacy 读取和 Mongo 性能 acceptance 用例；修复编辑器尾部 Database node 后首次点击不获光标的产品回归；P7.5 offline restart acceptance 采用 LocalStore 数据完整 barrier，不改变产品持久化行为。

性能观察（本地 MongoDB 8.0.32）：默认首屏约 41–50 ms、下一页约 29–31 ms，约检查 101/102 Record/Page；Filter 326/606 ms、约 7.5k/15k examined；两级 Sort 614/1,213 ms、约 10k/20k examined；100 行/5,000 linked targets 派生读取约 589–593 ms；10k cleanup overflow 在 263–292 ms 内 fail-closed、10,001 examined 并回滚；所有测量 profiler usedDisk spill 为 0。完整数据见 `docs/p8-database.md`。

结论：P8.6 PASS，P8 Database COMPLETE。独立 review 0 blocker；`docs/p8-database.md`、`docs/roadmap.md`、本文件与 `.agents/handoff.md` 已同步；fresh 验收矩阵、性能 harness、typecheck/build、`git diff --check` 与 UTF-8 无 BOM 均通过。最终聚焦提交包含本文件与交接记录；完成后工作区应干净。

禁止：新增 Database 产品功能、扩大到下一阶段、为修绿削弱 assertion/timeout、把 mock/HMR 残留结果写成 fresh 验收。
