# 当前任务：Database UX UI Consistency 小修

状态：**本轮 UI Consistency 小修 PASS，Database UX Refinement 尚未 Final PASS**。基线 `a2a50aee0615e2a9da7cbe4cdf9c4e93b486bf5d`；未开始 P9，也未处理 Page Tree / 10k projection。

| Work Unit | 难度 / 角色 | 状态 | 验收 |
| --- | --- | --- | --- |
| Drag Handle visibility 调查 | S0 / scout | DONE | 定位共享控件样式、touch 隐藏策略与嵌套定位边界 |
| Database Header icon 调查 | S0 / scout | DONE | Header 是唯一不一致点；Slash / Sidebar 已使用 Database icon |
| Record Opening Settings 容器调查 | S0 / scout | DONE | 设置页容器与实际 Record / Property preference 边界已查清 |
| 聚焦实现与定向测试 | S1 / 主 Agent | DONE | 三项偏差已修复；未改 DnD、preference 模型或 Property 行为 |
| 定向验证与构建 | S0 / scout + 主 Agent | DONE | Database 51/51、Overlay/Settings 30/30、Web typecheck/build、diff check PASS |
| 独立 review | Review / reviewer | DONE | 首轮触屏嵌套定位 blocker 已修复；最终复核 0 blocker |
| 单一聚焦提交 | 主 Agent | DONE | 一个聚焦 commit；提交后 workspace clean |

## 边界

- 不处理 Page Tree / 10k projection、Database navigation、Record 创建、Opening preference 数据模型、Page / Record domain、Overlay 基础架构、Filter / Sort、P9、MCP、Automation。
- Property 设置继续服从独立 Property Opening preference。
- Record Opening Settings 的设置页容器仅统一为 Desktop/Tablet Modal、Phone Bottom Drawer；三端可配置项与持久化行为不变。

## 验证摘要

- Database product：51/51 PASS；Opening remount 相关 helper 保留真实菜单与最终 preference 断言。
- Overlay / Settings：30/30 PASS。
- Web typecheck、`build:web`、`git diff --check` PASS；build 仅有既有 EotionEditor 大 chunk warning。
- 独立最终 review：0 blocker。

## 后续仍需处理

- Page Tree / 10k projection 性能审查
- Database UX Final Acceptance
