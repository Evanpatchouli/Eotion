# 当前任务：P9 Multi-View Final Acceptance（已完成）

Acceptance baseline：`52af49bb2b1b9ee22ececd6d3d31e8b6e0796a57`（2026-10-13，master，开始时工作区干净）。P8 SEALED；P9.1–P9.6 implementation COMPLETE。本轮为独立验收，不增加功能，不进入 Release / 版本 / tag / Database MCP。

| Work Unit | 难度 / 主要模式 / 角色 | 范围与验收 | 状态 |
| --- | --- | --- | --- |
| 架构与兼容边界证据 | S0 investigate / scout | 同一模型、generic records、legacy Table、Block references、storage/local-first、MCP；映射产品测试覆盖与缺口 | 完成：未分叉；List/Board 状态与分页缺口交由临时验收探针 |
| Domain / Contracts / SDK / API / MCP 验证 | S0 verify / scout | 相关测试与类型检查、真实 Mongo Database HTTP/service；重新确认完整 API MCP/Zod blocker；P6 回归 | 完成：35/35、24/24、23/23；DB 14/14、MCP 30/30、API domain/http；全部类型/构建通过 |
| Web 完整产品与构建验证 | S0 verify / scout | fresh server；完整 test:product workers=1/retries=0，记录总数/pass/fail/skip；Web typecheck/build | 完成：最终完整367/367，0 fail/skip/flaky，workers=1/retries=0；typecheck/build PASS；前两轮及隔离证据保留 |
| P9 Visual / Responsive 验收 | S0 verify / 主 Agent + fast_worker | 既有 screenshot harness；54 个 P9 矩阵截图 + 11 个专项产品探针；差异先判断归属 | 完成：同一最终源65/65（54矩阵+11探针），既有visual7/7；17张有效截图人工检查，无blocker |
| P9 selector 验收测试适配 | S1 execute / 主 Agent | 修正非 exact group 与旧直系 button 结构断言，正向验证三类创建入口 | 完成：targeted 2/2，commit `a8d05132407fa550c6b5c6004b15fd7f02bf7a0f`；产品源码未改 |
| 验收结论与独立复核 | Review / reviewer + 主 Agent | 生命周期、CAS、ABA、向后兼容，证据与最终 diff；只处理稳定复现的 P9 blocker；正式记录与聚焦 commit | 完成：最终完整Product与65项补验/7项visual证据复核，无确定P1/P2；正式报告与交接收口，P9 FINAL PASS |

纪律：不修改当前 identity fence，除非稳定复现真实 P9 blocker；不扩大 API/model/sync/MCP/断点/离线写入范围；scope-external 或疑似 flaky 必须有基线证据。关键项未完成即 `P9 FINAL ACCEPTANCE — HOLD`。
