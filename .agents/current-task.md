# 当前任务：P10 Database MCP Extension（规划完成，尚未实施）

当前正式版本：`0.0.1`，已发布 tag / release。P8 Database 与 P9 Multi-View 已 SEALED；下一独立阶段为 **P10 Database MCP Extension**，目标版本 `0.0.2`。

路线图已冻结：

`P10 Database MCP Extension (0.0.2) → P11 Timeline (0.0.3) → P12 Gallery (0.0.4) → P13 Calendar (0.0.5) → P14 Chart (0.0.6) → P15 MCP Full Adaptation (0.1.0)`

P10 只扩展 Database 的 MCP 领域能力，不提前实现 Timeline/Gallery/Calendar/Chart，不引入 renderer-specific MCP tools，不改变 Database online-only / Page-Block local-first 边界。

建议 P10 从以下 Work Unit 开始，实施前允许根据最新代码重新拆分：

| Work Unit | 目标 | 状态 |
| --- | --- | --- |
| P10.1 Contract + Security Foundation | 冻结 Database MCP DTO、tools/resources 边界、workspace scope、分页/限额、CAS、幂等与 receipts | 未开始 |
| P10.2 Read Tools | Database / Properties / Views / Records 的有界读取，复用 generic records | 未开始 |
| P10.3 Write Tools | 必要 Record / Property / View mutation，复用既有领域服务/事务/CAS | 未开始 |
| P10.4 Final Acceptance | MCP client、权限/越权、限额、CAS/幂等、P6 回归与 Product regression | 未开始 |

正式范围与后续 P11–P15 约束见 `docs/roadmap.md`。P10 Final Acceptance 通过前不要把版本切到 `0.0.2`。
