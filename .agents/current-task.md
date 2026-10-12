# 当前任务：P11.1A Temporal Domain Foundation（执行中）

当前正式版本：`0.0.1`。P8 Database 与 P9 Multi-View 已封板；P10 Database MCP
Extension 在当前仓库尚未实施，不得虚报完成。当前只执行 **P11.1A**，目标版本仍为
`0.0.3`，本轮不修改版本号。

## 当前 Work Units

| Work Unit | 目标 | 状态 |
| --- | --- | --- |
| P11.1A-1 | 在 `docs/p11-timeline.md` 冻结 Date value / normalization / compatibility 契约 | 已完成 |
| P11.1A-2 | 在 `packages/domain` 实现独立日期类型、严格 validator、纯 normalization helper | 执行中 |
| P11.1A-3 | Domain 单测、typecheck、相邻回归、diff 检查与独立 review | 未开始 |

## 范围与禁止事项

- 继续使用现有 `Database / Property / Record / View`；Date Property 不新增类型。
- 永久兼容 legacy `YYYY-MM-DD` string；不批量迁移旧数据。
- 新对象使用 `{ start, end?, timeZone? }`；all-day 不带 timezone，datetime 使用
  canonical UTC instant + IANA timezone；单点不持久化虚假 `end`；非法混合类型或逆序范围拒绝。
- 保持现有 `DatabasePropertyValue` 联合类型不变；P11.1B 再协调完整数据链路切换。
- 不实施 P11.1B–P11.6，不做 Timeline renderer / scroll / drag / dependency UI，不改 MCP、Mongo migration 或版本号。

## 验收与接续

必须通过相关 Domain 单测、typecheck、必要的相邻回归和 `git diff --check`，并提交聚焦
commit。P11.1B 的接续入口是：在保持 legacy string 可读的前提下，把 normalized date
value 接入 Property / Record / Contracts / Mongo 完整数据链路，再协调共享值联合类型的正式切换。
