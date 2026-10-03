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
| `runbooks/versioning.md` | 产品版本、build number、Git SHA 与多端版本映射 |
| `knowledge/` | 长期稳定、未来会重复使用的工程经验 |
| `exec-plans/` | 复杂、跨会话执行计划 |
| `p1-mobile-demo.md` | P1 移动 WebView PoC 的验证入口与判读方式 |
| `p2-editor-demo.md` | P2 Tiptap 编辑器 PoC 的验证入口、三端步骤与当前结果 |
| `p3-local-first.md` | P3 本地存储契约、adapter、oplog 与恢复语义的验证入口 |
| `p4-server-domain.md` | P4.1 服务端领域、Mongo 集合与 P3/文件服务边界 |
| `p4-auth-session.md` | P4.2 User、认证、Session 与 Workspace owner 权限基础 |
| `p4-http-api.md` | P4.3 Typed HTTP API、Cookie Session 与 Eotion SDK |
| `p4-sync.md` | P4.4 canonical sync operation、HTTP transport 与 Mongo receipt 幂等语义 |
| `p4-file-storage.md` | P4.5 File metadata、authenticated HTTP 与 ali-oss-server object lifecycle |
| `p5-product-shell.md` | P5.1 正式产品路由、登录/会话和 Workspace 产品链路 |
| `p5-page-tree.md` | P5.2 页面树、页面生命周期（创建/打开/重命名/移动/删除）与 move/delete API |
| `p5-real-page-editor.md` | P5.3 正式 Tiptap Page Editor、Block 映射、自动保存与阶段边界 |
| `p5-real-sync.md` | P5.4 LocalStore 正式保存、服务端 snapshot、push-before-pull、离线恢复及验收状态 |
| `p5-attachments.md` | P5.5 图片/文件节点、在线上传、MIME 安全、持久 cleanup 与验收 |
| `p5-settings.md` | P5.6 已完成：Settings 实现入口、账号安全契约、Theme/Toolbar scope、响应式与 Visual QA 验收 |
| `p5-ui-ux-foundation.md` | P5.7 UI/UX Foundation 主计划、Design Gate、实施与 Visual Acceptance 边界 |
| `design/ui-ux-audit.md` | P5.7.1 已完成：现有 UI/UX 审计与重设计问题清单 |
| `design/stitch-design-brief.md` | P5.7.2 已完成：Stitch 多方向探索的统一 Design Brief |
| `design/design-direction.md` | P5.7.2 已冻结：Quiet Studio 正式产品设计方向 |
| `design/design-system-v1.md` | Quiet Studio Design System v1：P5 已存在能力的正式冻结规范 |
| `design/DESIGN.md` | 给 AI / 实现 Agent 使用的 P5 精简设计契约 |
| `design/product-shell-implementation.md` | P5.7.5.2 桌面 ProductShell、Sidebar 折叠、Workspace Popover 与验证入口 |
| `design/interaction-foundation-implementation.md` | P5.7.5.3 NavItem、SyncStatus、Command Overlay 契约与回归入口 |
| `design/editor-architecture-spike.md` | P5.8.1 文档画布原语及 P5.8.2 共享编辑器基础、边界与浏览器回归入口 |
| `design/core-screen-spec.md` | P5.7.4 核心高保真页面与 Gate A |
| `design/visual-acceptance.md` | P5.7.6 Visual QA / Playwright screenshot comparison / 最终用户视觉签字状态 |
| `p4-final-acceptance.md` | P4 六条退出条件的最终验收证据、测试结果与进入 P5 的结论 |

## 使用原则

- 先确定当前 Roadmap Phase，不提前实现后续阶段。
- 能从代码、测试或配置直接验证的普通事实，不重复复制进文档。
- “现在是什么”写 architecture；“为什么这么选”写 ADR；“应该怎么表现”写 spec；“怎么操作”写 runbook。
- 文档与当前可验证行为冲突时，以当前行为为准，并修正文档。
- 一次性任务日志、临时猜测和普通 debug 过程不进入长期知识库。
