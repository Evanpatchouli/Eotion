# 当前任务：P9.5C-1 — Board View Creation Entry（已完成）

基线 `a70c8b9a41de42d3b38ac5997d33df314867edff`；P9.5B-2 PASS / SEALED。目标 8–20 分钟，25 分钟硬停止。

| Work Unit | 难度 / 模式 / 角色 | 状态 |
| --- | --- | --- |
| 创建、切换与缺省 renderer 定位 | S0 investigate / 主 Agent | 完成 |
| Board 创建入口与通用默认配置 | S1 execute / 主 Agent | 完成 |
| targeted 创建/identity/Phone 测试及验证 | S1 execute / fast_worker | 完成；targeted 9/9 + Table 创建 1/1 |
| 独立复核 | Review / reviewer | 完成；重试错类型已修复，无剩余 blocker |
| 文档、handoff、聚焦 commit、停止 | S1 execute / 主 Agent | 完成；聚焦提交后停止 |

Implementation Brief：createView 接受 DatabaseViewType，Board 默认名称看板 N，配置严格沿用 DEFAULT_DATABASE_VIEW_CONFIG，不补 options/groupBy。菜单增加同风格新建看板视图，复用 createProductDatabaseView / existing POST views 与 switchView(created.id, true)。只更新当前引用 viewId；Board 缺省分组进入已有 renderer 显示尚未配置分组属性。禁止 grouping settings/自动groupBy/新Property/API/Domain/drag变更/MCP/local-first；禁止 Full Product/Visual/Final Acceptance。

验证：Web typecheck、diff check、UTF-8 无 BOM 通过；一次独立 review 无剩余 blocker。Board 创建、Phone 无 select、409 与未知结果重试 4 项新增 targeted 加既有回归共 9/9，Table 创建生命周期另 1/1，workers=1 / retries=0。保留 Editor/NodeView/Drawer/draft/snapshot，不复制 Database/Records/Pages/Database Block。未发现已确认的 P9.5C-2 blocker，未实现/验收 grouping settings，未运行 Full Product/Visual/Final Acceptance。实际命令与测试 fixture 修正见 handoff。
