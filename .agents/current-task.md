# 当前任务：P7 两项边界修复

状态：COMPLETE；基线 2a59ce3；不进入 P8，不新增 Block / MCP Tool / MCP write 能力。

| Work Unit | 模式/评级 | 负责 | 结果 |
| --- | --- | --- | --- |
| 服务端写路径与 domain validator 调查 | investigate/S0 | scout | HTTP/sync/MCP 均汇入 BlockService |
| Toggle read DTO 决策与实现 | decide/S2 -> execute/S1 | worker | summary 递归业务 DTO、旧 text 兼容 |
| 统一 props 校验与入口回归 | execute/S1 | fast_worker | 13 类型矩阵、HTTP/sync/MCP derived props |
| tests/typecheck/build/product | verify/S0 | scout + 主 Agent | domain 20、contracts 7、storage 7、API domain 2/HTTP 24/MCP 29 通过 |
| 最终独立 review | review | reviewer | 兼容边界修复后无 blocker |

兼容：空 list/quote、嵌套列表开头的 listItem、旧 Toggle 空 summary 回退；旧合法 P5/P6/P7 文档不迁移。
非法 snapshot 在 hydration 前拒绝；已有合法本地正文保留，首次加载非法文档不开放编辑。
Typecheck、Web/API build、diff check 通过。相关 product 129 项均有通过结果（初跑 124/129，5 个失败项修正/定向复跑通过，未重跑全 suite）；browser storage 8 项均通过（2 个环境失败项定向复跑通过）。

最终一个聚焦 commit，工作区干净后停止。
