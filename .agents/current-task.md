# 当前任务：P9.4A — Board Config Foundation（已完成）

基线 `e15d6d1b9f3519f0cb6d16f937209c98bc0d1370`；P8 COMPLETE / SEALED，P9.1A / P9.2 / P9.3 已完成。目标 8–20 分钟，25 分钟硬停止；开始于 2026-10-12 17:43:55（Asia/Shanghai）。

| Work Unit | 难度 / 模式 / 角色 | 状态 |
| --- | --- | --- |
| 定位 API View config validation、property repair 和既有测试 | S0 investigate / scout | 完成 |
| 确定 Board options 类型与 View-aware validator 接口 | S2 decide / 主 Agent | 完成 |
| Domain / Contracts 类型、validator 与定向回归 | S1 execute / fast_worker | 完成 |
| API create/update/read 接入与 Board / property repair 回归 | S1 execute / fast_worker | 完成 |
| 最小测试/类型检查和一次独立 review | S0 verify / scout + reviewer | 完成，无 blocker |
| 正式文档、handoff、聚焦提交与汇报 | S1 execute / 主 Agent | 完成（本变更单元 commit），随后停止 |

Implementation Brief：保留通用 `DatabaseViewConfig.options?: Record<string, unknown>`，新增可扩展 Board options/config 类型，其中 `groupByPropertyId?: string`。`validateDatabaseViewConfig(config, properties, viewType = 'table')` 只在 `viewType === 'board'` 且 options 自有 groupByPropertyId 时验证稳定 ID、当前 properties 集合中的 select、options 数组存在（允许空数组）。API create 使用请求 type；update/read 和 records response contract 使用持久化 View type。历史 table/list options 保持 opaque，不对未知字段设白名单。Property repair 保留完整 options，包括 groupByPropertyId；仅校验修复后的通用字段，不新增 dependency/conflict/自动清除逻辑，引用生命周期留给 P9.4B。

边界：只使用既有 POST /views，默认配置与 Database 模型保持；不新增 BoardDatabase / BoardRecord / BoardColumn、renderer、UI、selector、columns、drag、MCP 或 Local-first。不运行 Web Product / Visual / Final Acceptance。API 完整构建的既有 MCP/Zod 环境问题使用已记录的 scoped compile/test 路径验证，不扩大修复范围。

验证：Domain 35/35、Contracts 24/24；Domain / Contracts / SDK typecheck；API scoped compile 与 Database HTTP/service 13/13、0 skip，全部通过。真实 repair 回归确认 select option cleanup / grouping Property type change / delete 后 View version 递增、通用字段确实修复、groupByPropertyId 与未知 options 保留。首跑仅新增测试 ID 与原 fixture 重复，改为独立 ID 后同组通过；没有修复无关模块或削弱断言。独立 review 无 blocker，diff / UTF-8 无 BOM 检查通过。

Board Domain foundation 未发现 blocker。grouping Property 失效后 Board records 按当前 schema 返回既有 409；dependency/conflict/repair 生命周期留给 P9.4B。本轮完成后停止，不开始 Board UI、renderer、drag 或 MCP。
