# Current Task — P3 本地优先架构收尾

## Goal

解除 contracts 对 storage 的反向依赖；准确限定 reconnect 的并发与至少一次投递语义，不进入 P4。

## Work units

| ID | 模式与验收边界 | 路由 | 状态 |
| --- | --- | --- | --- |
| W1 | investigate：依赖引用、三端 runtime、oplog 与现有验证证据 | S0 scout + 主 Agent | 完成 |
| W2 | decide：storage bridge 归属、reconnect 范围与投递语义 | S2 主 Agent | 完成：协议归 storage；at-least-once，不新增跨实例锁 |
| W3 | execute：移动 bridge 协议、更新直接消费者与依赖 | S1 fast_worker | 完成 |
| W4 | execute：reconnect 测试、注释与受影响文档 | S1 主 Agent | 完成 |
| W5 | verify/review：定向测试、三端构建、依赖检查、最终 diff | S0 scout + Review reviewer + 主 Agent | 完成；review 无 blocker |

## Constraints

只收紧 P3；保持 LocalStore、强类型 RPC、runtime validator 和 durable oplog。无跨实例互斥承诺，不实现 P4 server sync 或幂等表。每个独立逻辑变更提交。

## Evidence

- `contracts` 与 `storage` typecheck、storage 5 tests、Web build、Mobile build 均通过。
- Web storage Playwright 3 tests 覆盖 IndexedDB durable oplog 与 Electron renderer/SQLite；Electron SQLite 2 tests、build 通过。
- Package 依赖图中 `contracts` 无 storage 引用；最终独立 review 无 blocker。
