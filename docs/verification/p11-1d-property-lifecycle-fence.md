# P11.1D Property Lifecycle Fence 验收

日期：2026-10-13。基线：`e0238a324d47a421ddfb1f0b60358dd7bd1dc661`（P11.1C PASS 收口）。
状态：**P11.1D PASS，已完成并停止**。开始时工作树干净，当前分支 master。版本保持 0.0.1，P11 目标 0.0.3。
只处理 P11.1D；不实现 Timeline renderer / grid / bar / drag / resize / connector / shift。

## 模型与 mutation

统一内部 `DatabaseViewPropertyDependency`：View ID、Property ID、required 约束（select / date / self-relation）。

| 引用 | 分类 | 行为 |
| --- | --- | --- |
| Board grouping | Hard，select | 删除、select→非select 409；沿用原 Board 错误文案 |
| Timeline date-property | Hard，date | 删除、Date→非Date 409 |
| Timeline start/end | Hard，date | 任一删除、任一Date→非Date 409 |
| Timeline dependency | Hard，self-relation | 删除、Relation→非Relation、target不再self 409；空值仍保护 |
| Timeline frozenTable visibleProperties/propertyOrder | Soft | 删除时仅移除该ID，保留Title与其他配置 |
| 顶层filter/sort/projection | Soft | 沿用原通用修复规则 |

`deleteProperty` 在事务内先检查两层 expected version、加载当前 Views、拒绝 hard refs；
以 remaining Properties 验证修复配置，随后删除/清理/按原 View version 写回。
`changePropertyType` 检查候选 Property 的 required 约束和依赖图，按候选 schema 验证
修复配置，再执行原 Record 类型转换；同型 no-op 保持，既有转换的 Record version规则保持。
`updateProperty` 对 Relation retarget 在 Property/Record 写入前检查 self-relation要求；
允许 rename、合法 self target，禁止自动清空或替换 dependency。

三处 repair validator（option cleanup / type conversion / delete cleanup）都传真实
`view.type`，包含配置未改变时的最终校验；Table/List保留opaque options，Board/Timeline
执行各自引用语义。不新增API、实体、集合、依赖或迁移，不修改MCP、Page/Block sync和版本。

新建/PATCH View 的非self dependency输入继续返回 P11.1C 已冻结的400；已有Timeline
引用下的Relation retarget返回409。这一区分保持既有输入错误与生命周期冲突API契约。

## Mongo事务与CAS证据

全新临时MongoDB 8.2.3 dbpath，loopback port27713，replica set p111dAcceptance。
hello PRIMARY和真实withTransaction insert/commit probe通过，probe数据库已删除。
URI仅经进程环境P4_TEST_MONGODB_URI传入，无.env变更，不复用真实27017数据库。
临时目录：`C:/Users/31250/AppData/Local/Temp/eotion-p111d-e8af2b28a6cd41cdb4614e4f8edc314c`。

生产继续使用`withTransaction(readConcern: snapshot)`。View CRUD和Property mutation共用
Database CAS，阻止snapshot里的引用检查与并发新引用写入同时提交。Property写入按版本CAS；
View repair使用读到的View.version CAS。hard409、staleDB/Property/View与注入View repair
CAS失败由真实Mongo全量原始Database/Property/View/Record/Page文档快照证明没有副作用。
并发覆盖View引用更新与type/delete/retarget，断言仅一方提交、另一方409且最终config合法。
软列删除断言Database+1、被修复View+1，未变化View/Record/Page保持。

## 验证

| 验证 | 结果 |
| --- | --- |
| Domain | 48/48，typecheck通过 |
| Contracts | 25/25，typecheck通过 |
| SDK | 23/23，typecheck通过 |
| API server-domain | 2/2 |
| API Database service | 14/14，包含新增P11.1D生命周期/rollback/race |
| API通用HTTP | 1/1 |
| API Database HTTP | 5/5，含嵌套用例及扩展Timeline生命周期矩阵 |
| API合计 | 22/22，0 failed / skipped |
| MCP回归 | 30/30，0 failed / skipped |
| API build/typecheck | 通过 |
| 独立review / diff / UTF-8无BOM | 0 blocker / 通过 / 通过 |

合计148项；P11.1D定向1/1为API全套子集，不重复计数。最终API日志为
`api-mongo-four-files-final.log`，MCP为`api-mcp-test.log`；其他包及类型检查日志、
Mongo8.2.3版本/PRIMARY/事务probe/关闭证据和`final-validation-summary.txt`位于上述临时目录。
隔离Mongo admin shutdown后，PID43988不存在、27713无监听。

首轮新增staleProperty fixture使用version1-1=0，触发输入400而未到CAS；已改为合法
但失配的version+1，P11.1D定向及四文件最终全套通过。没有削弱断言或跳过失败。

命令（包命令在根目录，node命令在apps/api）：

```powershell
pnpm --filter @eotion/domain test
pnpm --filter @eotion/contracts test
pnpm --filter @eotion/sdk test
pnpm --filter @eotion/domain typecheck
pnpm --filter @eotion/contracts typecheck
pnpm --filter @eotion/sdk typecheck
pnpm --filter @eotion/api build
pnpm --filter @eotion/api typecheck
$env:P4_TEST_MONGODB_URI = 'mongodb://127.0.0.1:27713/?replicaSet=p111dAcceptance'
node --test dist/modules/server-domain/server-domain.test.js dist/modules/server-domain/database.test.js dist/modules/http-api/http-api.test.js dist/modules/http-api/database-http.test.js
node --test dist/modules/mcp/mcp.test.js
```

未执行：完整Web Product/Database/E2E/Visual、Desktop/Mobile真机、performance、sync/file
全套、P11 Final Acceptance。本轮未改变Web或原生UI，不能据此声称renderer验收通过。

## 修改文件与接续

生产：`apps/api/src/modules/server-domain/services/database.service.ts`、
`apps/api/src/modules/server-domain/repositories/database.repository.ts`（移除旧Board专用查询）。
测试：`apps/api/src/modules/server-domain/database.test.ts`、
`apps/api/src/modules/http-api/database-http.test.ts`。
文档：本文件、`docs/p11-timeline.md`、`docs/README.md`、`docs/context/README.md`、
`.agents/current-task.md`、`.agents/handoff.md`。

实现提交：`16da8cfdb7753e7a26bc0fc2d491a9b95517d754`。验收/交接收口提交为包含本报告的后续commit。P11.2需新的明确指令，入口为`docs/p11-timeline.md`§23、
现有Web Timeline占位分支、DatabaseView.options.timeline与generic records；先做只读
ruler/grid/scrollbar/scale/today/rows/bars/unplanned/pagination，mutation继续后置。
本轮完成后停止。