# 当前任务：P9.6 — Multi-View Product Polish（硬停止收口，待补验证）

基线 `d06a3af32174e32a0f8bcb2de99be109ee5a7324`；P8 SEALED / P9.5 COMPLETE。25 分钟硬停止，不运行 Final Acceptance / Visual Acceptance 全套。

| Work Unit | 难度 / 模式 / 角色 | 状态 |
| --- | --- | --- |
| View identity / lifecycle 调查 | S0 investigate / scout | 完成，设置 PATCH 旧响应风险 |
| List / Board / picker / responsive 调查 | S0 investigate / scout | 完成，List 空标题 accessible name 不一致 |
| 最小修复与回归 | S1 execute / 主 Agent + fast_worker | 完成代码；List 空标题新增回归 |
| targeted verification / review / 收口 | S0 verify + Review | 13/13 定向 product + Web typecheck 通过；review 要求补延迟 PATCH 回归；A–L 矩阵未完成 |

修复：saveViewConfig 捕获 loadedViewIdentity，成功及失败副作用只应用于同一 user/workspace/database/view；List aria-label 与可见“无标题”保持一致。无 API/model/renderer 重构、新功能或 breakpoint。

未完成：外部交易切换 View 时延迟 PATCH 的真实产品回归；Table/List/Board 六组合完整切换、三 renderer 空/loading/error/分页/离线矩阵、所有 opening mode/设备组合。renameView 同类在途响应风险仅静态发现，尚未复现，不顺手扩大修复。

结论：P9.6 尚不能标记 READY FOR FINAL ACCEPTANCE。遵守硬停止，下一轮仅补 P9.6 定向验证与证实的 blocker；不进入 Final Acceptance、Release、0.0.1 或 MCP。
