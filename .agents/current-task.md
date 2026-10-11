# 当前任务：Property Type Mutation UI Hookup — Basic Types（PASS）

master；基线 8297210eefd5dde8fae79bddcfc2cdc1ab0dc4f2。只接 text/number/checkbox/select/date；advanced 配置、Final Acceptance/P9 不在范围内。

| Work Unit | 难度 / 模式 / 角色 | 状态 |
| --- | --- | --- |
| 确认既有调用链与 UI lifecycle | S2 decide / 主 Agent | 完成：复用 service serialization、专用 endpoint、schema refresh 和产品 Modal |
| SDK / Web service hookup | S1 execute / fast_worker | 完成 |
| 基础 Type List / confirmation lifecycle | S1 execute / 主 Agent | 完成 |
| 定向 Web 回归与已知命令验证 | S1 execute / fast_worker | 完成：4/4 targeted Playwright、Web typecheck PASS |
| 最终独立复核 | Review / reviewer | 完成：无 blocker；409 真实版本递增与刷新后重试已补充 |

验证：`pnpm --filter @eotion/web exec playwright test tests/product-database.spec.ts -g "property menu keeps its focus|basic property type changes|property type change failures|property schema mutations refresh inside the open panel" --workers=1`（4 passed）；Web/SDK typecheck、git diff --check PASS。未跑完整 Database suite。

覆盖基础转换、稳定 Property ID、filter 移除与 sort 保留、当前类型关闭、取消/Escape/backdrop 不提交、API 失败重试、409 新版本重试、三个高级 target 不提交、Desktop 与 390px Phone Header/Settings confirmation。Web 测试使用 mocked API，并复用已验证 Domain conversion；未重新实现客户端 conversion。

成功刷新 schema；失败保留 Modal，409 刷新并重新确认。高级配置入口未修改，不自动删除高级依赖，不新增 Toast 系统。聚焦提交后停止。

remaining issues:
- Advanced Property Type Mutation UI hookup
- Database UX Final Acceptance