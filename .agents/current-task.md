# Current Task — P3 真机 ID 生成兼容性

## Goal

修复缺少 `crypto.randomUUID` 的 WebView 中 P3 本地存储及 Mobile bridge ID 生成，保持 operation retry 的持久 ID。

## Work units

| ID | 模式与验收边界 | 状态 |
| --- | --- | --- |
| W1 | investigate：检索全仓 randomUUID 用法、现有 ID 与 retry 语义 | 完成 |
| W2 | decide：storage 包导出统一 nanoid helper；现有 demo 固定 ID 继续服务更新/重开验证 | 完成 |
| W3 | execute：Web、Desktop、Mobile bridge 调用 helper；补缺失 randomUUID 的 Page/Block 测试 | 完成 |
| W4 | verify/review：Web/Mobile typecheck、build、storage tests、diff 复核 | 完成；独立 review 无 blocker |

## Constraints

不使用 Math.random fallback；operation retry 沿用持久记录的 ID；不改 Page/Block upsert 契约或无关功能。

## Evidence

Storage、Web、Desktop typecheck；Mobile `tsc -b`；Web、Mobile、Desktop build；Storage 单元测试 5/5、Web storage Playwright 4/4（含 Electron）、Desktop 单元测试 2/2 通过。缺失 `crypto.randomUUID` 的浏览器回归用例覆盖 Page/Block 创建、重开持久化及 operation ID 重试稳定性。全仓源码无 `randomUUID()` 调用，独立 review 无 blocker。
