# Current Task — P3 本地优先基础

## Goal

共享 LocalStore，Web IndexedDB、Electron SQLite/typed IPC、Mobile typed bridge；内容和 oplog 原子提交，重启与重连可恢复。

## Work units

| ID | 验收边界 | 实际路由 | 状态 |
| --- | --- | --- | --- |
| W1 | 共享 contract、顺序重连状态机及测试 | S2 worker | done，0ea1be9 |
| W2 | Web IndexedDB、单一 factory、开发演示页和真实浏览器测试 | S2 主 Agent | 实现并验证，待提交 |
| W3 | Electron main SQLite、typed preload IPC、真实窗口测试 | S2 worker | done，2e55316；端到端由主 Agent 验证 |
| W4 | Mobile typed bridge 与 HarmonyOS 可行性 | S1 fast_worker | done，ab72578；真机待人工验证 |

## Constraints

不进入 P4/P5/P6、远程同步、Redis/Kafka。应用业务只依赖共享契约。每个独立逻辑单元提交；最终主 Agent 复核与验证。

## Evidence

- Shared storage 3/3 tests + typecheck passed.
- Web Playwright Chrome IndexedDB CRUD/persistence/ordering/transaction/reconnect passed.
- Electron SQLite 2/2 tests + typecheck/build passed；Playwright Electron renderer 经 typed IPC 的 reload 和 app restart passed.
- Mobile build passed；HarmonyOS 原生存储仍 manual verification required。
