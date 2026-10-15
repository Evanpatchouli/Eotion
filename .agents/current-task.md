# 当前任务：P11.3C 审阅问题修复

基线 `574a93c`，分支 `codex/p11-3c-review-fixes`。用户授权修复本会话审阅确认的四项 P2 并按规范提交。
限于 cancel click、刷新失败反馈、焦点转移和 resize 焦点闭环；不进入 P11.3D，不改 API / model / sync / 版本。

| 单元 | 模式 / 难度 / 角色 | 输出 | 状态 |
| --- | --- | --- | --- |
| F1 | decide / S2 主 Agent | 复用审阅 Evidence Pack，确定最小修复与验收 | 完成 |
| F2 | execute / S1 fast_worker | 保留取消拖拽 click 抑制 + 真实 lostpointercapture 回归 | 完成；定向 Web 1/1 PASS |
| F3 | execute / S1 fast_worker | 尊重用户焦点转移；resize 可聚焦、原 DOM 失联时同 anchor 回退 + 回归 | 待执行 |
| F4 | execute / S1 fast_worker | unknown 刷新失败保持不确定文案与只读 + 回归 | 待执行 |
| F5 | verify / S0 scout + reviewer | 定向 Web / logic / typecheck / build，最终一次独立 review | 待执行 |
| F6 | execute / S1 fast_worker + 主 Agent | 同步验收文档、handoff、提交并检查最终 diff | 待执行 |

Implementation Brief：

- 取消：abortPreview 在清 active 之前保留 moved 对下一次 click 的抑制；不能覆盖 pending 原有抑制状态或失效在途 token。
- 焦点：除原目标或 body/空焦点外，任何其他 activeElement 都视为用户主动转移；包括另一个 Timeline bar。
- Resize：移除 controller 中阻止 pointerdown 默认聚焦的 preventDefault；保留事件隔离。捕获同一 bar anchor 的 DOM identity，在原 handle 失联时仅在该 anchor 内寻找同 record 的当前目标/bar，禁止全局查询跨 View 抢焦点。
- 恢复时确认当前 ledger token 和 scope；等 Vue DOM 更新后处理目标失联，卸载后不恢复。保持既有 pending busy guard 和 handle 永不打开 Record。
- Unknown：refreshLoadedWindow 返回后若 staleReadonly 为 true，返回 false 并显示刷新未完成/结果未确认，不使用旧 records 宣称 canonical 已更新。
- 回归复用现有 product-database harness；审阅临时复现在系统 TEMP/eotion-p113c-review-evidence/reproduction.spec.ts，可取场景但不可整份复制进仓库。
- 每个完成的独立逻辑单元单独 commit，最终文档收口另一次 commit；不推送、不发布。

已知验证背景：审阅时 logic 52/52、Web typecheck 通过；P11.3C Web 首跑 5/6，冲突用例初始 bar 超时单独复跑 3/3 通过，根因未确定，不直接标为既有浮动。
