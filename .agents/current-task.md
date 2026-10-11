# 当前任务：Advanced Property Type Mutation UI Hookup（PASS）

master；基线 4eb4b4005eea6926ca3aa092faab1854adffefbb。仅 relation / rollup / formula UI hookup；未修改 Domain / API / Contract，未进入 Final Acceptance / P9。

| Work Unit | 难度 / 模式 / 角色 | 状态 |
| --- | --- | --- |
| UI 状态、版本与确认边界 | S2 decide / 主 Agent | 完成 |
| 高级配置与确认 hookup | S1 execute / fast_worker | 完成 |
| 定向 Web 回归 | S1 execute / fast_worker | 完成：11/11 PASS |
| Web/SDK typecheck 与 diff 验证 | S0 verify / 主 Agent | PASS |
| 最终独立复核 | Review / reviewer | 完成：0 blocker；加载锁及未知响应文案已修正 |

显式 create/edit/change-type；change-type 保留 source/version snapshot、名称只读；candidate 使用 target type、清除 options/替换 config。复用 Advanced Overlay/loader，配置继续后仅进入确认，确认调用 /type；成功刷新 schema，不扫描 Records。失败保留确认；409 同 source type 保留 draft 更新版本，source 删除或外部变更类型则取消。既有 create/edit endpoints 保持。

验证：在 apps/web 运行 `pnpm exec playwright test tests/product-database.spec.ts -g "basic property type changes|advanced type|property type change failures|property menu keeps|advanced properties configure|existing advanced property editors|mobile relation picker"`（11 passed）；Web/SDK typecheck、git diff --check PASS。未跑完整 Database suite。Web 使用 mocked API，复用既有 Domain conversion，不重复实现转换规则。

覆盖 text -> relation/formula/rollup、advanced -> advanced、稳定 ID/name、旧值和 config 清理、filters/sorts 移除、配置/确认取消与 Escape/backdrop、invalid config、503 retry、dependency conflict、409 保留草稿/版本及 source 改型/删除取消、既有 create/edit 与 Desktop/390px Phone。

remaining issues:
- Database UX Final Acceptance

完成本轮后停止。