# Testing Runbook

> 记录项目现有测试层级，以及针对不同改动应该运行什么验证。

## P4 API integration

本机或 `P4_TEST_MONGODB_URI` 指定的 MongoDB 必须可连接。测试使用随机数据库，结束时删除该数据库。
P4.4 sync 集成测试还要求 Mongo 支持多文档事务；将 `P4_TEST_MONGODB_URI` 指向 replica set（单节点也可），例如 `mongodb://127.0.0.1:27018/?replicaSet=eotionP44`。本机默认 standalone 27017 仅适用于旧领域/HTTP 测试。

```bash
pnpm --filter @eotion/api test:domain
pnpm --filter @eotion/sdk test
```

运行包含 P4.4 sync 的 HTTP 测试前，先设置 replica set URI。PowerShell 示例：

```powershell
$env:P4_TEST_MONGODB_URI = 'mongodb://127.0.0.1:27018/?replicaSet=eotionP44'
pnpm --filter @eotion/api test:http
```

HTTP 测试启动 Fastify/Nest 实例，通过真实 HTTP 请求覆盖 Session Cookie、身份边界、Workspace/Page/Block CRUD、跨用户权限、请求体运行时校验，以及 P4.4 sync 的真实本地 oplog → SDK transport → HTTP → Mongo → 本地 synced 路径、重复/并发重试与删除。Domain 测试还覆盖 Mongo 未配置时的 `/api/health`。

## Change-to-Test Mapping

修改 contracts、SDK 或 HTTP API 时运行相关包的 `typecheck` / `build`，并运行上述 API/SDK 测试。若改动 contracts 的运行时导出，还需验证 `pnpm --filter @eotion/web build` 与 API 的 CommonJS 导入。

## Known Constraints

API integration 依赖 MongoDB；未运行 MongoDB 时，仍可单独启动未配置 `MONGODB_URI` 的 API 并访问 `/api/health`。
