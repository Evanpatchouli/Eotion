# Current Task — P3 Mobile Bridge Diagnostics

## Goal

在 native storage 仍返回 unavailable 时，让开发调试页能按真实 bridge 请求生命周期验证真机 #5–#10；不改生产存储语义。

## Work units

| ID | 模式 | 边界与验收 | 状态 |
| --- | --- | --- | --- |
| W1 | investigate | 确认 `MobileBridgeLocalStore` 是请求收发集中点；业务存储结果不能证明 bridge 生命周期。 | 完成 |
| W2 | decide | Web Mobile adapter 内提供仅开发环境记录的 snapshot/observer；按 ID 和方法识别响应；timeout、unknown、duplicate 单独计数。 | 完成 |
| W3 | execute | Adapter 记录、P3 页面展示与清空、自动化测试、真机清单与 P3 文档。 | 完成 |
| W4 | verify/review | storage/web/mobile 相关验证、Playwright、diff 与独立复核。 | 完成；独立复核发现的方法串包问题已修复，复核无 blocker |

## Constraints

未修改 RPC contract、LocalStore、operation retry、native storage 或生产调试路由；保留真机清单原有用户排版改动，#5–#10 仍未通过。

## Evidence

Storage typecheck 和 5/5 单元测试、Web typecheck/build、Mobile build、Web storage Playwright 5/5（含 IndexedDB、Electron SQLite、Mobile bridge）通过。Playwright 覆盖 unavailable、并发逆序响应、unknown 不影响 pending、duplicate 不重复 resolve、错方法响应、timeout、缺少 crypto.randomUUID 和调试页计数/清空。
