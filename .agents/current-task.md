# Current Task — P4.1 Server Domain / MongoDB Foundation

## Goal

仅建立 Workspace、Page、Block、FileMetadata 的服务端领域与 MongoDB 持久化基础；保留 P3 LocalStore 和无 Mongo 时 `/api/health` 可启动。

## Work units

| ID | 模式 / 评级 | 边界与验收 | 状态 |
| --- | --- | --- | --- |
| W1 | investigate / S0 | 核对 `origin/master`、P3 契约、API 接线与 Mongo 测试环境，形成证据。 | 完成：本地与远端一致，本机 Mongo 可连接。 |
| W2 | decide / S2 | 决定实体字段、workspace 隔离、索引、repository 与 Mongo enabled/disabled 边界。 | 完成：独立集合、Block 持久化 workspaceId、按范围查询、可选模块接线。 |
| W3 | execute / S1 | 按决定实现 schema、repository、薄 service、模块接线、测试及文档。 | 完成 |
| W4 | verify/review / S0 + Review | 执行 P4.1 测试、指定 typecheck/build、独立 review、检查 diff。 | 完成：指定验证及真实 Mongo 集成测试通过；review blocker 已修复并复核。 |

## Constraints

不实现 Auth、HTTP CRUD、真实 sync、OSS 调用、UI 或 P5；稳定 string domain ID；Page/Block 分 collection；不破坏 P3 LocalStore。
