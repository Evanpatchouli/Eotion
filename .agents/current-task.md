# 当前任务：Database UX — Page Tree / 10k Projection Performance Audit

状态：完成。基线 `7c7a7e528393e31f5af9261a2390fe20f0a888c3`，分支 `master`。本轮仅审计和 benchmark，没有修改产品实现、index 或数据 schema；未开始 Database UX Final Acceptance 或 P9。结果由一个聚焦 audit commit 记录，提交后工作区 clean。

| Work Unit | 难度 / 角色 | 状态 | 验收 |
| --- | --- | --- | --- |
| Server navigation / snapshot 路径与 fixture 调查 | S0 / scout | 完成 | 真实 service/repository 调用链、Mongo explain/profiler 与隔离 fixture 已确认 |
| Web IndexedDB / ProductPages / PageTree 路径调查 | S0 / scout | 完成 | 两次全量页面读取、role projection 与 PageTree 数据边界已确认；发现旧缓存 revision/loading race |
| Desktop SQLite 路径调查 | S0 / scout | 完成 | local adapter SQL 与 `EXPLAIN QUERY PLAN` 已确认 |
| 三端可重复 benchmark | S1 / fast_worker + 主 Agent | 完成 | API 8 组（4 个规模 × 新 role/legacy roleless）；Web/SQLite 各 12 组（4 个规模 × 新 role/raw roleless/server-projected legacy）；每项 3 次；细表在 `docs/p8-database.md` |
| 必要 correctness regression | S0 / 主 Agent | 完成 | API Database HTTP 1/1 覆盖 Database navigation 与 Record Page direct read；PageTree、独立 Database route、Linked View 3/3；各 benchmark 角色/数量断言通过 |
| 审计结论与文档同步 | S1 / 主 Agent | 完成 | docs 与 handoff 已同步 A/B/C 结论；不扩展至 Acceptance |
| 独立 review / 单 commit / clean check | Review / reviewer + 主 Agent | 完成 | 独立 reviewer 无 blocker；单个 audit commit；提交后工作区 clean |

## 结果摘要

- 判定 **B — PASS WITH DEBT**：role-aware 10k 常用本地 PageTree hydration 中位数约 88–96ms，树计算约 0.1–0.2ms；没有 measured beta blocker。
- 服务端新 role Page navigation 约 31ms，仍检查 10,050 Pages；legacy `$lookup` 约 0.93s，profiler 合计约 20,051 docs/keys。Snapshot 包含 10,050 Pages、1 Block、约 3.22MB JSON；服务端生成约 178–195ms，不含网络与 IndexedDB 写入。
- IndexedDB 每次页面/导航读取都从全量 Pages 过滤；SQLite nav 命中 expression index，plan+fixture 推断的 workspace 候选行为 10,050（无实际 row-visit counter）。raw roleless cache 可把 10,050 Record Pages 带入 tree；offline 持续如此，revision/loading race 可能丢弃一次 refresh。
- 主要瓶颈不是树构造，而是 legacy 服务端关联查询、客户端 O(N) read/materialization 与 snapshot payload。后续工作只建议覆盖旧缓存收敛与 legacy lookup；本轮不优化。

## 验证

- `pnpm --filter @eotion/api benchmark:page-tree`：通过；8 组（新 role/legacy roleless），MongoDB 8.2.11，随机 database 创建/清理。
- `pnpm --filter @eotion/web test:page-tree:benchmark`：通过；12 组隔离 IndexedDB fixture（新 role/raw roleless/server-projected legacy）。
- `pnpm --filter @eotion/desktop benchmark:pages`：通过；12 组内存 SQLite fixture（新 role/raw roleless/server-projected legacy）。
- `pnpm exec node --test dist/modules/http-api/database-http.test.js`（apps/api）：1/1 通过。
- `pnpm exec playwright test tests/product-database.spec.ts --grep "page tree shows databases under their host page|standalone database route switches views|linked views keep independent server filters" --workers=1`（apps/web）：3/3 通过。
- `git diff --check` 通过；独立只读 reviewer 无 blocker；一个 audit commit 后工作区 clean。

禁止项：不修改 Page repository 查询、数据库/local schema/index、snapshot contract、ProductPages/PageTree 架构、lazy loading、Record local-first 语义或 Database domain；不开始 Database UX Final Acceptance 或 P9。
