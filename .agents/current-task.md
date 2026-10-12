# 当前任务：P9.2 — View Type Foundation（已完成）

master 基线 `8c6a7fe25f5879ad82ac43041ab62cdc06f052fe`；P8 COMPLETE / SEALED，P9.1A 已完成。开始时间 2026-10-12 16:15（Asia/Shanghai），目标 8–20 分钟，16:40 硬停止。

| Work Unit | 难度 / 模式 / 角色 | 状态 |
| --- | --- | --- |
| 精确定位 type / config / mutation / 测试边界 | S0 investigate / scout | 完成 |
| 确定 type 与 opaque options 最小契约 | S2 decide / 主 Agent | 完成 |
| Domain / Contracts 和定向测试 | S1 execute / fast_worker | 完成 |
| API / Mongo 与属性 repair 定向测试 | S1 execute / fast_worker | 完成 |
| 最小验证与一次独立 review | S0 verify / scout；Review / reviewer | 完成，全部通过，无 blocker |
| 正式文档、handoff、聚焦提交与汇报 | S1 execute / 主 Agent | 完成；一个聚焦提交，本阶段结束 |

边界：仅支持 `table | list | board` 类型和可选 opaque `options` 扩展点；table 默认、旧 config、generic records 和 legacy Table 兼容。沿用既有 config validator 的 filters / sorts / property reference 校验，Property repair 用 spread 保留扩展字段。不实现 options 语义、groupBy 校验或依赖、Capability Registry、renderer 字段、migration；不修改 Web / Product tests / Visual tests / MCP，不运行 Web Product / Visual / Final Acceptance。一个逻辑变更单元完成并提交后停止，不进入 List 或 Board。

最小验证：Domain / Contracts targeted tests 与类型检查；API database HTTP / service tests 的真实依赖闭包 scoped compile 和 Mongo tests。沿用 P9.1A 已记录的 API MCP 环境限制，不扩展到完整 API build。

Implementation Brief：Domain 单一常量 `DATABASE_VIEW_TYPES` 导出 `DatabaseViewType`，Contracts create enum 与 Mongo enum 共用常量；create type 仍必填，默认数据库创建仍 table，createView 持久化已校验的 input.type。Config `options?: Record<string, unknown>` 只校验 object 形状，未知内部字段原样保留，默认及旧 config 均不补 options。Generic records 移除 table-only guard，沿用已有 config/query/cursor/version 校验；legacy Table 委托关系不变。Property delete 补 `...config`，select-option cleanup / type-change 既有 spread 保持。linkInPage 保留现有 table 限制，等待后续 View UI 接入。

验证：Domain 35/35、Contracts 23/23，两个包及 SDK typecheck 通过；API 两个 Database 测试文件真实依赖闭包 scoped TypeScript compile 通过，HTTP/service 13/13、0 fail、0 skip。首跑新增 Board fixture 导致既有 View 数量期望过时，改为核对三个确切 ID 后同组通过，未削弱其他断言。独立 reviewer 无 blocker；diff/UTF-8 无 BOM 检查通过。完整 API build/typecheck 未运行，继承 P9.1A 已记录的 MCP/Zod 环境限制。

未发现 P9.3 List View 的 foundation blocker。List renderer、Web selector/链接入口接入属于后续阶段；本轮不实施。完成一个聚焦 commit 后停止。
