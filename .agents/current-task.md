# Current Task — Connectivity polish + HTTP 500 fallback

目标：仅扩展共享 transient helper 的精确白名单至 TypeError / 500 / 502 / 503 / 504；诊断详情保留原生语义并使用现有 Morphicons。

## Work Units

1. 调查/决策 S0→S2（主 Agent）：确认 ApiError、auth/workspace/sync 的共用边界；已完成，不新增恢复流程。
2. 执行 S1（主 Agent）：局部 helper、App summary 样式/图标、正式行为文档。
3. 执行 S1（fast_worker）：现有 connectivity/offline/desktop 回归测试扩充。
4. 验证 S0（主 Agent）：Web typecheck/build/product/offline、storage/desktop/real-sync 与 Visual QA。
5. Review（独立 reviewer）：聚焦授权隔离、RouterView 保留、同步链路与 summary 可访问性，主 Agent 复核后提交。

## 状态

已完成；开始时 git 工作区干净。无版本/schema/附件/移动原生/架构扩展。

Web typecheck/build 通过；product 100/100、offline-shell 1/1、storage/Electron 11/11、storage 单测 6/6、Desktop 单测 8/8、SDK 单测 17/17 通过；storage/Desktop typecheck、Desktop/SDK build 通过。真实 Mongo/API/生产 Web 1/1 通过（既有 Mongo 认证配置阻挡首次运行，隔离临时 replica set 重跑通过；临时容器已移除）。

390×844 / 1366×900 Visual QA 通过：两态 SVG、Enter/Space、hover/focus-visible、reduced-motion、无溢出/overlay/pageerror；截图在 E:/Eotion-QA（仓库外）。独立 reviewer 复核后无 blocker；HTTP 状态与 body 不一致安全缺口已以 SDK 实际响应状态修复并补回归。git diff --check 和 UTF-8 无 BOM 验证通过。
