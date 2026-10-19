# Database transactional Cell mutations

P11.4C 增加通用 Database 能力；不引入 Timeline Record、独立调度实体或专属 HTTP API。

## Transport 与版本

`POST /api/workspaces/:workspaceId/databases/:databaseId/cell-mutations` 接受：

```ts
{
  mutationId: string,
  expectedDatabaseVersion: number,
  records: Array<{
    recordId: string,
    expectedRecordVersion: number,
    cells: Array<{ propertyId: string, value: DatabasePropertyValue }>
  }>,
  context?: { viewId: string, expectedViewVersion: number }
}
```

最多 500 个不同 Record，每 Record 最多 100 个不同 Cell，输入/最终计划最多 1,000 个 Cell。重复 Record/Cell、未知字段、非法值拒绝。Title 和派生 Cell 不支持此 batch；Title 继续既有 Page CAS 路径。

整批成功时 Database version 只加 1；每个实际发生变化的 Record 只加 1，同 Record 的多 Cell 先合并再单次 CAS。未变化的 Record 不 bump；全 no-op 不 bump Database。即使 no-op 也验证客户端版本。响应返回 mutationId、canonical Database 与目标 Records 的 stored Cells、Page 标题和 pageVersion 投影；不承诺包含 Formula/Rollup，派生值通过后续 generic View records read 获取，继续保留原有派生读取上限。

对已存储的显式 `null` 再提交 `null`，保留原存储值并视为 no-op；对缺失 Cell 清空同样不 bump。清空非空 Cell 才发生实际变化。混合 batch 中，空值 no-op 的 Record 仍保持版本，只有其他实际变化的 Record 增加版本；no-op 事务仍返回 committed receipt。

## 单事务执行

服务端先验证认证/Workspace 写权限与 Database 归属。业务执行使用一个 Mongo snapshot transaction：读取 canonical Database、Properties、Records 和可选 View，验证 Database/Record/View CAS 与真实 Property/Relation/value，计算并合并计划，然后 Database 一次 CAS、每 changed Record 一次 CAS、同事务提交 receipt。任一错误整体回滚；没有顺序单 Cell PATCH、分段提交或 Web 发回可信 graph plan。

显式请求目标使用各自 expectedRecordVersion；服务端生成的 targets 使用同 transaction snapshot 读取的 Record version。Database fence 同时与 View、Property、Relation 编辑竞争，防止用过时配置或 graph 提交。Relation 引用继续经过现有 advanced-reference fence。

## View policy context

可选 context 表示按 canonical View 的配置执行当前 root Cell intent。目前支持 Timeline date-source Cell 更新和 self Relation Cell 更新；context 请求仅接受单 root Record/Cell，避免多根语义歧义。Relation Cell 最多新增一条边，检测到新增时触发调度；同次可移除旧边，纯移除不触发调度。View type/config/property lifecycle 与 expectedViewVersion 在事务内复核。

服务端读取完整 canonical graph，独立于 View filter、sort、pagination、viewport。沿用最大 10,000 records 扫描上限，超限拒绝，绝不截断。纯 domain `planDatabaseSchedule` 接收 predecessor→successor edges，不解释 Relation direction；最大 affected scheduled graph 为 500 records / 10,000 edges。

没有 context 时，它是可复用的通用多 Record/多 Cell 原子更新能力。当前 Timeline Web 仅在 active auto shift 的 Date/create release 时使用 context；其他既有单 Cell 编辑行为不变。

## Unknown result / receipt

每个 mutationId 按 user/workspace/database 唯一，绑定 request hash。先登记 pending，committed 状态与所有业务变更同事务提交；已确定 abort 标为 not_committed。重复 ID 不重新执行；不同 payload 使用同 ID 拒绝。

`GET .../cell-mutations/:mutationId` 经同样认证/读取权限及 scope 校验，返回：

| 状态 | 含义 |
| --- | --- |
| committed | 该 identity 的整个事务已提交 |
| not_committed | 该 identity 已确定未提交 |
| uncertain | pending/missing，仍不能判断；也涵盖进程中断后的待确认状态 |

未知 commit outcome 不标成失败；receipt 查询失败也不能从 root Date 或某条 Relation 猜测整批结果。Web 不自动重试 mutation，先查询 receipt 再刷新已有 canonical window。uncertain/读取失败保持 stale read-only。receipt 没有自动重发、离线队列或后台重试；进程中断留下的 pending 可以持续 uncertain。

语义和验证入口：[P11.4C](../verification/p11-4c-auto-shift-policies.md)、[Atomicity Design Gate](../exec-plans/p11-4c-atomicity.md)。
