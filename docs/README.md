# Eotion Documentation Map

Eotion 的长期项目知识以 `docs/` 为 source of truth。Agent 开始非平凡任务时先看本页和 `context/README.md`，再按任务读取少量直接相关文档。

| 入口 | 用途 |
| --- | --- |
| `roadmap.md` | 当前阶段、阶段目标与退出条件 |
| `architecture/architecture.md` | 当前系统架构、平台边界和技术方向 |
| `architecture/agent-integration.md` | MCP / Agent 集成规划边界 |
| `context/README.md` | RAG 检索入口、模块索引和 Context Pack 规则 |
| `specs/` | 产品行为、协议和验收契约 |
| `decisions/` | ADR：为什么做出重要技术/架构决策 |
| `runbooks/` | 开发、测试、部署、排障等可重复操作 |
| `knowledge/` | 长期稳定、未来会重复使用的工程经验 |
| `exec-plans/` | 复杂、跨会话执行计划 |
| `p1-mobile-demo.md` | P1 移动 WebView PoC 的验证入口与判读方式 |
| `p2-editor-demo.md` | P2 Tiptap 编辑器 PoC 的验证入口、三端步骤与当前结果 |

## 使用原则

- 先确定当前 Roadmap Phase，不提前实现后续阶段。
- 能从代码、测试或配置直接验证的普通事实，不重复复制进文档。
- “现在是什么”写 architecture；“为什么这么选”写 ADR；“应该怎么表现”写 spec；“怎么操作”写 runbook。
- 文档与当前可验证行为冲突时，以当前行为为准，并修正文档。
- 一次性任务日志、临时猜测和普通 debug 过程不进入长期知识库。
