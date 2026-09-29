# Current Task — P4 Final Acceptance

## Goal

基于 `7ee21d78b2c47218d98990883f5a5a1bcf4a006c` 对 Roadmap 的六条 P4 退出条件做最终验收。只处理明确的 P4 correctness regression；通过后写验收记录并收尾 Roadmap，不进入 P5 实现。

## Work units

| ID | 模式 / 评级 | 验收 | 状态 |
| --- | --- | --- | --- |
| W1 | investigate / S0 | 收集 Auth、领域 API、Sync、File 的代码和测试证据，形成六条退出条件的 evidence matrix。 | 完成 |
| W2 | verify / S0 | 使用支持 transaction 的临时 Mongo replica set，执行相关 typecheck、测试和三端构建，记录断言数与结果，清理临时实例。 | 完成 |
| W3 | review | 对 evidence matrix 与实际代码/测试做一次独立 blocker 复核。 | 完成：无 blocker |
| W4 | execute / S1 | 仅在 PASS 后新增验收文档、更新 Roadmap 和本任务状态；检查 diff，提交并推送。 | 完成 |

## Constraints

- 不实现 P5 功能、不改变 P4 契约或 MIME 策略。
- 不触碰现有长期 Mongo 容器、volume 或数据。
- 真实 blocker 先建立复现；需要新模型或协议设计时停止并报告。

## Result

P4 Final Acceptance：PASS。当前可以进入 P5 Product MVP；本任务不实现 P5。
