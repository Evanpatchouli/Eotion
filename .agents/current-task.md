# 当前任务：P9.4B — Board Property Dependency（已完成）

基线 `a344268135e45f49d06d230222dc0a6cf1df5cd7`；P8 COMPLETE / SEALED，P9.4A 已完成。开始于 2026-10-12 18:20:21（Asia/Shanghai）；目标 8–20 分钟，25 分钟硬停止。

| Work Unit | 难度 / 模式 / 角色 | 状态 |
| --- | --- | --- |
| 定位 Property mutation、View repair、事务与既有测试 | S0 investigate / scout | 完成 |
| 决定 Board dependency guard 的复用点与无写入冲突边界 | S2 decide / 主 Agent | 完成，执行降级为 S1 |
| 既有 delete/type mutation 入口保护与定向 API 回归 | S1 execute / fast_worker | 完成 |
| scoped compile/test 与一次独立 review | S0 verify / scout + reviewer | 完成，14/14，无 blocker |
| 正式文档、handoff、聚焦提交与汇报 | S1 execute / 主 Agent | 完成，本逻辑单元聚焦 commit 后停止 |

验收：同库 `DatabaseView.type === 'board'` 且 `config.options.groupByPropertyId === property.id` 时，Property delete 与 select → 非 select 返回明确 409 conflict，Property/Record/View/version 不变；无 Board dependency 的既有 mutation 成功。Select option 删除及 Record value cleanup 保持；filters/sorts/visibleProperties/propertyOrder/options repair 保持；Table/List opaque options 不构成 dependency。

Implementation Brief：沿用 repository 既有 `model.exists(filter).session(session)` 模式，以 workspaceId/databaseId/type/grouping Property ID 直接判断；不枚举 View 或增加上限失败语义。私有 service guard 在 delete 事务首次写入前、change-type 版本校验/no-op 之后且 candidate dependency/fence 写入前执行。错误为 `Property is used as Board grouping property.`；updateProperty 不接入 guard。复用既有 Database CAS / snapshot transaction，Board create/update 同样推进 Database version，继续防止并发 mutation 基于旧状态提交。repair 保留原 spread/通用 validator。

边界：直接通过 View config 判断依赖；不新增 Entity / 表 / API / dependency registry，不自动清空 groupByPropertyId。不运行 Web Product、Visual、Final Acceptance，不开始 Board renderer/UI/drag/MCP。不扩大既有 MCP/Zod 环境问题修复范围，沿用 P9.4A scoped compile/test。
验证：API Database HTTP/service 真实依赖闭包 scoped TypeScript compile 通过；真实 Mongo 定向测试 14/14，0 fail、0 skip。新增 targeted HTTP 子测覆盖 A–F、多个 Board 引用、冲突后 entities/versions/config/fences 不变、Select no-op/rename、Doing Record value cleanup 与 Board records 可读；旧 generic 测试显式迁移 grouping 后保留原 repair 回归。首跑发现新增 Record fixture 的非法字段及迁移后旧 grouping ID 断言；按既有 RecordPage POST + cell PATCH 和显式迁移状态修正后同组全通过。没有修改产品逻辑以迁就测试，没有 scope-external failure。

独立 review 无 blocker；最终 diff / UTF-8 无 BOM 检查通过。未发现依赖/API 层的 Board renderer blocker；未检查或实现 renderer/UI/drag/MCP。完整 API build/typecheck 沿用既有 MCP/Zod 环境限制未执行；没有运行 Web Product、Visual、Final Acceptance。完成后停止。
