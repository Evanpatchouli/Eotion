# 当前任务：P9.6B — Multi-View Verification Closure（已闭合）

基线 `f83d188`；P8 SEALED / P9.5 COMPLETE。本轮只完成 P9.6 定向验证与最小 identity fence 收口，不运行 Full Product、Visual Acceptance 或 P9 Final Acceptance。

| Work Unit | 难度 / 模式 / 角色 | 状态 |
| --- | --- | --- |
| View identity / lifecycle 调查 | S0 investigate / scout | 完成：确认 saveViewConfig 旧响应可能跨 View 产生 config/version、错误处理与刷新副作用 |
| 最小修复与回归 | S1 execute / 主 Agent | 完成：loaded identity 在 View tuple 变化时失效；响应返回时校验 user/workspace/database/view、NodeView/Editor/DOM identity 与 ready 状态；List 空标题名称保持一致 |
| P9.6 verification closure | S0 verify | 完成：延迟 PATCH success/409、A→B→A、Table/List/Board 七方向矩阵与 renderer/设备/失败态回归通过 |
| 独立 review / 收口 | Review / Sol High | 完成：两项 P2 已关闭，无新的 P1/P2 blocker |

验证证据：

- P9.6 targeted product 34/34 通过（workers=1）；其中新增 delayed success/409、A→B→A、Table/List/Board matrix 共 4/4。
- 覆盖 empty / loaded / loading / load failure / pagination / offline readonly、390px header、Board 无分组与空 Select options、Record Drawer/title draft、phone snapshot convergence 与 Editor/NodeView identity。
- `pnpm --filter @eotion/web typecheck` 通过；`git diff --check` 与修改文件 UTF-8 无 BOM 检查通过。

边界：`renameView` 相似在途响应风险已静态检查但未复现，本轮不扩大修改；不改变 API、model、renderer、breakpoint、MCP 或 local-first 边界。P9.6 blocker 已闭合，完成最终 commit 后停在 Final Acceptance 入口。
