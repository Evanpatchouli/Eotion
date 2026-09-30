# Testing Runbook

> 记录项目现有测试层级，以及针对不同改动应该运行什么验证。

## P4 API integration

本机或 `P4_TEST_MONGODB_URI` 指定的 MongoDB 必须可连接。测试使用随机数据库，结束时删除该数据库。
P4.4 sync 集成测试还要求 Mongo 支持多文档事务；将 `P4_TEST_MONGODB_URI` 指向 replica set（单节点也可），例如 `mongodb://127.0.0.1:27018/?replicaSet=eotionP44`。本机默认 standalone 27017 仅适用于旧领域/HTTP 测试。

### 测试文件必须先注入 env

`apps/api` 下凡是会直接或间接读取 `process.env` 的测试文件，**第一行（第一条 import）必须先执行**：

```ts
import 'dotenv/config'
```

尤其是使用 `P4_TEST_MONGODB_URI`、`MONGODB_URI`、`ALI_OSS_*` 等环境变量的 integration test。不要依赖 `AppModule` 中的 `import 'dotenv/config'` 间接加载环境变量，因为测试 helper（例如 `testMongoUri()`）可能在动态导入 `AppModule` 之前就读取 `process.env`，导致错误地使用 fallback 配置。

新增或修改 API 测试时，应保证 env 注入发生在任何环境变量读取、helper 调用和动态模块导入之前；这是测试文件的固定约定。

```bash
pnpm --filter @eotion/api test:domain
pnpm --filter @eotion/sdk test
```

运行包含 P4.4 sync 的 HTTP 测试前，先设置 replica set URI。PowerShell 示例：

```powershell
$env:P4_TEST_MONGODB_URI = 'mongodb://127.0.0.1:27018/?replicaSet=eotionP44'
pnpm --filter @eotion/api test:http
```

HTTP 测试启动 Fastify/Nest 实例，通过真实 HTTP 请求覆盖 Session Cookie、身份边界、Workspace/Page/Block CRUD、跨用户权限、请求体运行时校验，以及 P4.4 sync 的真实本地 oplog → SDK transport → HTTP → Mongo → 本地 synced 路径、重复/并发重试与删除。P4.5 File HTTP 测试另外启动 fake ali-oss-server HTTP 服务；Eotion 仍调用真实 `@ali-oss-server/sdk@1.1.0`，不需要真实 Aliyun OSS。它覆盖文件 CRUD、对象键隔离和 OSS/Mongo 失败补偿。Domain 测试还覆盖 Mongo 未配置时的 `/api/health`。

## Change-to-Test Mapping

修改 contracts、SDK 或 HTTP API 时运行相关包的 `typecheck` / `build`，并运行上述 API/SDK 测试。若改动 contracts 的运行时导出，还需验证 `pnpm --filter @eotion/web build` 与 API 的 CommonJS 导入。

## Known Constraints

API integration 依赖 MongoDB；未运行 MongoDB 时，仍可单独启动未配置 `MONGODB_URI` 的 API 并访问 `/api/health`。

## P5.1 Web 产品与开发页回归

```bash
pnpm --filter @eotion/web test:product
pnpm --filter @eotion/desktop build
pnpm --filter @eotion/web exec playwright test
pnpm --filter @eotion/web typecheck
pnpm build
```

产品测试使用真实 Vue/Router/Pinia 与受控 HTTP 响应覆盖会话、路由、Workspace 与错误状态；它不替代真实 API 验收。实际验收使用独立临时 Mongo 数据库/账号，通过正式产品入口完成登录、创建、刷新、切换、重命名、退出和返回保护。API 集成回归仍按上文运行，包含 Sync transaction/receipt 与 File。

P5.4 增加 `pnpm --filter @eotion/web test:offline-shell`：构建生产 Web 后，用独立 Chrome profile 验证完全断网 reload 与进程重启仍可加载静态应用。`pnpm --filter @eotion/web test:storage` 包含真实 Electron SQLite 产品路径。真实 Mongo + Nest + 生产 Web 双客户端验收先运行 API/Web build，再运行 `pnpm --filter @eotion/web test:real-sync`；它要求本机有 Mongo replica set，默认使用 `mongodb://127.0.0.1:27017/?replicaSet=rs0`，也可通过 `P4_TEST_MONGODB_URI` 指定。测试为每次运行生成独立数据库并在结束时删除。

原示例首页测试入口为 `/#/__dev/workspace`，不再使用 `/`。仓库根目录没有统一 `lint` 或 `test` 脚本，使用各包已有测试命令与 typecheck/build；不要将未配置的 lint 记为通过。
