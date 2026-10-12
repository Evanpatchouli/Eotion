# 当前任务：P9.5A — Board Renderer Foundation（已完成）

基线 `73f1762d2c860f1c8d96ff9548cdb569950d8bca`；P8 COMPLETE / SEALED。仅只读 Board renderer，目标 8–20 分钟，25 分钟硬停止。

| Work Unit | 难度 / 模式 / 角色 | 状态 |
| --- | --- | --- |
| 现有 records、renderer、fixtures、opening、responsive 定位 | S0 investigate / 主 Agent + scout | 完成 |
| renderer 边界与分组/空值/Phone 策略 | S2 decide / 主 Agent | 完成，执行降级 S1 |
| Board 独立组件与最小 routing | S1 execute / fast_worker | 完成 |
| targeted tests、typecheck 与独立 review | S0 verify / 主 Agent + reviewer | 完成 |
| 正式文档、handoff、commit 与汇报后停止 | S1 execute / 主 Agent | 完成 |

Implementation Brief：组件接收现有 records/properties/config/formatValue，emit openRecord 复用父组件 openRecordPage。select options 的稳定 ID 构建 columns，保持 options 顺序和 records 输入顺序；缺失/null/未知 option 值放未分组，仅有此类 records 时出现。未配置分组提示，不自动选属性。不修改 records/schema/config。title 使用 title Property ID 下 Page.title projection；非 title 属性按 visibleProperties（null 全显示）与 propertyOrder。Desktop/Tablet 局部横向滚动，Phone <768 单列堆叠，不加断点。父组件只 import + renderer 分支，不改 Table DOM、loading、snapshot、draft、Drawer。禁止 drag/mutation/settings/MCP/local-first。

验证：targeted Playwright 8/8；Web typecheck、diff check 通过；独立 review 无 blocker。首轮 6/8，两项新测试 locator/Drawer 遮挡问题修正后同组通过；无 scope-external failure。完成聚焦 commit 后停止。
