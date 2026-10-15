# 当前任务：P11.3C Round-trip No-op Drag Review Fix（完成并停止）

基线 `4fe83eb5fd5cb0692e14353d1e9e78c9ec459b14`；分支 `codex/p11-3c-round-trip-noop-fix`。只修复超过 threshold 后拖回 canonical 日期误开 Record 的 P2；完成后停止，不进入 P11.3D。

| 单元 | 模式 / 难度 / 角色 | 输出 | 状态 |
| --- | --- | --- | --- |
| R1 | investigate / S0 主 Agent | no-op 分支覆盖 click 抑制，旧测试关闭 drawer 掩盖问题 | 完成 |
| R2 | execute / S1 fast_worker | 最小修复 + point/range 往返与后续打开回归，先红后绿 | 完成；红测drawer=1，绿测1/1 |
| R3 | verify / S0 scout + reviewer | P11.3 定向 Web/logic、typecheck/build、独立复核 | 完成；logic52/52、Web35/35、typecheck/build通过、review无blocker |
| R4 | execute / S1 主 Agent | 更正验收文档、handoff、提交与停止 | 完成；本文件所在提交收口 |

Brief：didMove=true 后无论最终值是否 canonical，都必须吞掉本次 release 合成 click；未越阈值的 bar body 继续点击打开；handle 永不打开 Record。保持 0 PATCH、canonical 日期/version、idle 与清空 preview；新 pointerdown 或 Enter/Space 继续可以打开 Record。不改变 threshold、日期归一化、pending/token/CAS、API/model/sync/版本。不推送或发布。

Web 首跑复用了单测短生命周期服务，前2项通过后33项导航连接拒绝；改用独立服务最终35/35，workers=1/retries=0。临时服务已清理，7173无监听。正式结果见 docs/verification/p11-3c-mutation-ux-conflict.md §18。完成本修复后停止，P11.3D未开始。
