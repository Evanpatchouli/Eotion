# 当前任务：P7.4 Table

状态：PASS；P7.1/P7.2/P7.3 已 PASS，本轮基线 `5724b8a`，本轮只做 P7.4 Table。

| Work Unit | 模式/评级 | 负责 | 结果 |
| --- | --- | --- | --- |
| registry/codec/sync/nested 现状与 Table 集成点调查 | investigate/S0 | 主 Agent | Evidence Pack（含 Tiptap table API 事实） |
| Table 单 block 模型与 nested 边界决策 | decide/S2 | 主 Agent | 整表一个 block + editor-internal rows/cells |
| domain registry / 校验 / MCP DTO / editor UX 实现 | execute/S1 | 主 Agent | product-table 14/14，domain 17/17，MCP 24/24 |
| codeBlock slash context 收口（P7.3 minor） | execute/S1 | 主 Agent | codeBlock 内仅保留文本/标题转换 |
| 完整验证与独立 review | verify/S0、Review | reviewer | product 206/206、visual 6/7（既有基线）、BLOCKER 0 |

验收结果：见 `docs/p7-advanced-blocks.md` 的「P7.4 Table」与「P7.4 Final Acceptance」。review 第一轮报 MAJOR 1（web codec 缺 table 规模上限，超大 HTML 粘贴会使整页无法保存）；已通过共享 `TABLE_LIMITS` + 编辑器粘贴守卫关闭，第二轮定向复核 BLOCKER 0、PASS 为是。

下一步：不开始 P7.5。
