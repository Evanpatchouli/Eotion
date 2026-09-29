# Current Task — P4.4 Real Sync Transport + Operation ID Idempotency

Base: `73bf014ada70f9678d29eba8ba9b5b9e09bc3c20` (`origin/master`, 2026-09-29).

## Goal

将 P3 durable oplog 经 authenticated HTTP 和 SDK 送入 P4 application services；Mongo 以稳定 operation ID 幂等应用。只覆盖 page/block upsert/delete，不引入冲突合并。

## Work units

| ID | 模式 / 评级 | 边界与验收 | 状态 |
| --- | --- | --- | --- |
| W1 | investigate / S0 | 核对 P3 storage 缺口、P4 service/HTTP/test 与 Mongo 事务条件。 | 完成 |
| W2 | decide / S2 | 定义 canonical sync operation、旧本地数据处理、事务 receipt/fingerprint 和 delete 语义。 | 完成 |
| W3 | execute / S1 | contracts 与 P3 adapter/存储输入调整；迁移和原测试更新。 | 完成 |
| W4 | execute / S1 | server sync service/receipt、delete service、authenticated HTTP。 | 完成 |
| W5 | execute / S1 | SDK OperationTransport、Mongo+HTTP E2E 与轻量文档。 | 完成 |
| W6 | verify/review | 相关验证、独立 review、修复 blocker、按逻辑单元提交推送。 | 验证与独立 review 完成；已按逻辑单元提交，待推送 |

## Constraints

- Network contract 位于 `@eotion/contracts`；每条 operation 显式 workspaceId，upsert 完整且稳定。
- Cookie Session 和 owner-only permission 由现有边界执行；同 ID 同内容成功，同 ID 异内容拒绝。
- receipt 与业务写入原子提交；客户端未 mark synced 时沿用原 ID 重试。
- 客户端时间只作 mutation 事实，不作冲突版本或 Mongo 持久化时间。
