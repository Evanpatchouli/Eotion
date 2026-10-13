# P11.1C Timeline View Config Foundation 验收

日期：2026-10-13。基线：`320d2bd930d288a0a33bec5cae62021e15967771`。
状态：**P11.1C PASS，完成后停止**。正式版本仍为 `0.0.1`，P11 目标 `0.0.3`。
本轮没有进入 P11.1D / P11.2，没有改版本、依赖或 Page/Block sync。

初始目录工作树干净，但检出为较早的 `bd9e070`；以本地已有的 P11.1B PASS 提交
创建隔离工作树，分支 `codex/p11-1c-timeline-config`。实际工作目录：
`C:/Users/31250/.codex/worktrees/p11-1c-timeline-config/Eotion`。

## 实际契约与实现

完整 wire shape 和默认值冻结在 [P11 §21](../p11-timeline.md#21-view-config-实际契约p111c-冻结)。

- `DATABASE_VIEW_TYPES` 为 table / list / board / timeline。
- 配置复用 `DatabaseViewConfig.options.timeline`：dateSource 判别联合、七种 scale、
  独立 frozenTable、self-relation dependency；有效默认 scale 为 month。
- dateSource 可省略，不自动选择 Date。单 Date 引用与分离 Start/End 仅接受本库、本
  Workspace 的原生 Date，两个分离 ID 必须不同；Formula/Rollup 不能作为日期来源。
- Frozen Table 只保存配置，Title 保留、列 ID 合法、数组最多 100 且不重复，隐藏不清列。
  bar 顶层 projection 与 Frozen Table projection 独立。
- dependency 方向为 depends-on / blocks，策略严格为 shift_when_overlapping /
  shift_and_keep_gap / no_auto_shift，avoidWeekends 为显式 boolean；不实现自动 shift。
- 内层 Timeline 对象严格，outer options 未知字段保留；引用语义只应用于 Timeline，
  既有 Board grouping validator 保持独立。
- Contracts 沿用原 Create/Update/View/records schemas；Domain shape/类型扩展直接
  接入原 Zod 入口，没有新增 Timeline DTO。服务端 CRUD/query 已使用真实 view.type，
  Mongo View enum 已引用共享常量，因此 API/Repository 生产代码无需重复实现。
- Web 明确显示“时间轴视图暂未实现”，不进入 Table/List/Board renderer，也不叠加
  普通空态。保留通用 selector、Filter/Sort、View CRUD 与 Record 操作；无 Timeline
  创建或专用配置入口。Editor/NodeView/Drawer 身份与标题草稿保持。

## 验证环境与结果

MongoDB **8.2.3**（本机安装 binary），全新临时 dbpath，loopback `127.0.0.1:27712`，
单节点 replica set `p111cAcceptance`。hello primary 与真实 transaction probe 通过。
仅用进程环境 `P4_TEST_MONGODB_URI` 指向此实例，测试创建随机数据库并清理，
不复用用户真实数据、不修改 .env。

| 验证 | 通过数量 / 结果 |
| --- | --- |
| Domain 全套 | 48/48，含 7 个新 Timeline 用例；typecheck / test 编译通过 |
| Contracts 全套 | 25/25；typecheck / build 通过 |
| SDK 全套 | 23/23，0 failed / skipped；typecheck / build 通过 |
| API server-domain | 2/2，含 Mongo 持久化与 disabled health 回归 |
| API Database service | 13/13，含新增 Timeline 用例，真实 Mongo |
| API HTTP | 1/1，真实 Mongo |
| API Database HTTP | 5/5（包含嵌套用例），含新增 Timeline HTTP 用例 |
| API 合计 / typecheck / build | 21/21，0 failed / skipped；typecheck / build 通过 |
| Web 定向 Playwright | 6/6，workers=1 / retries=0；1 新增 + 2 扩展既有 + 3 Board 回归 |
| Web typecheck / production build | 通过；保留既有大 chunk warning |
| 独立 reviewer | 0 确定 P1/P2 blocker |
| 最终 diff / UTF-8 无 BOM | 通过 |

API 新增 targeted 2/2 是以上 21 项的子集，不重复计数。API 全套首次通过后为保留
日志再次运行，同样 21/21；没有把两次相同用例相加。

主要命令（仓库根目录；API 四文件命令在 `apps/api` 运行）：

```powershell
pnpm --filter @eotion/domain test
pnpm --filter @eotion/domain typecheck
pnpm --filter @eotion/contracts test
pnpm --filter @eotion/contracts typecheck
pnpm --filter @eotion/sdk test
pnpm --filter @eotion/sdk typecheck
pnpm --filter @eotion/sdk build
pnpm --filter @eotion/api typecheck
pnpm --filter @eotion/api build

Push-Location apps/api
$env:P4_TEST_MONGODB_URI = 'mongodb://127.0.0.1:27712/?replicaSet=p111cAcceptance'
node --test dist/modules/server-domain/server-domain.test.js dist/modules/server-domain/database.test.js dist/modules/http-api/http-api.test.js dist/modules/http-api/database-http.test.js
Pop-Location

pnpm --filter @eotion/web exec playwright test tests/product-database.spec.ts --workers=1 --retries=0 --grep 'Table List Board switch matrix|empty unconfigured Timeline|board renderer switches with Table and List without replacing editor or record drawer drafts|Board grouping settings stay hidden while switching|board renderer handles missing grouping'
pnpm --filter @eotion/web typecheck
pnpm --filter @eotion/web build
git diff 320d2bd --check
```

API 原始日志：
`C:/Users/31250/AppData/Local/Temp/eotion-p111c-dc408051709e490fa68bce3b5f60009e/api-unified-tests.log`。
SDK/类型检查日志在同目录 `sdk-and-types-final.log`。Mongo 日志在同目录；临时实例结束
后停止，日志/dbpath 保留。Web由当前工作树 Playwright webServer 启动（有启动日志），
结束后 7173 无监听；未单独保存启动前端口快照，不宣称该项预检查已执行。

390px 截图经主 Agent 检查，selector 与占位无水平溢出：
[Timeline 占位](C:/Users/31250/.codex/visualizations/2026/10/13/01a1333f-35c2-7220-9de1-df9dd724d0de/p111c-timeline-placeholder-phone-390.png)。

## 行为证据与过程修复

真实 Mongo 与 HTTP 覆盖默认无 config / 无 options 创建、完整配置创建、两种 dateSource、
七种 scale、Frozen 隐藏保留列、dependency 更新、List/generic GET 配置往返、坏结构/
引用 400、Database 和 View 两层 CAS 409 与事务回滚、独立 View、删除无 Record/Page
副作用。Record 原始文档与版本保持，Filter/Sort 和多页 cursor fence 继续有效。
默认无 dateSource 与 Record 日期缺值不影响 View config 合法性。

Web 将原三种类型切换矩阵扩展为四种，实际更换当前 Block 的 viewId，其他 Block 引用保持；
已有 Timeline 可直接加载，空记录不回退 Table，切回 Table 空态保持。现有 Drawer
标题草稿、Editor/NodeView DOM 与组件身份断言保留，Board 分组关键回归继续通过。

主 Agent 复核发现初始 dependency shiftMode 使用了另一套枚举，已改回 §14 三值并
增加错误旧值拒绝断言。新增 API 测试首次编译的 Mongo cursor/Model 类型用法已修正；
SDK 验证的一次 shell 参数包装仅输出 usage，改用直接命令后全套通过。没有削弱断言、
跳过测试或改动无关产品逻辑来通过验证。

## 剩余边界与 P11.1D 接续

**完整 Property lifecycle fence 尚未实施。**配置校验/引用识别及 generic records 的
fail-closed 不能替代 Property mutation 防护，不能将 C 描述为 D 已完成。

- `DatabaseService.updateProperty`（327 行）：Relation retarget 与事务内 View 检查。
- `changePropertyType`（385 行）/ `deleteProperty`（476 行）：Date source / dependency
  hard reference 409、Frozen Table soft reference 修复；沿用 Board fence 模式。
- 三处 repair 的 `validateDatabaseViewConfig` 调用（376 / 465 / 520 行）仍未传
  真实 view.type；D 必须统一传入，并在同一事务内验证候选 Properties/最终配置。
- `assertNoBoardGroupingDependency`（714 行）与 View Repository
  `hasBoardGroupingProperty`（296 行）是已有引用 fence 接入参考，不得破坏 Board。
- D 需证明 CAS、失败回滚及删除/类型变更/retarget 并发竞态，不能只补读取校验。
- `linkInPage`（161 行）仍 Table-only；本轮真实 HTTP 验证 Timeline 400、无 Block/
  Database version 副作用。未来 Linked Timeline 从此类型门禁及 Block identity 验收接入。

未运行完整 Web Database/Product、MCP/performance/sync/file 全套、Desktop/Electron
或 Lynx 原生真机、完整 Visual/Final Acceptance。390px 只作为响应式 Web 证据。
Timeline 日期解析、时间网格/条、Frozen Table renderer、依赖图/联动均未实施。

## 聚焦提交

| 提交 | 范围 |
| --- | --- |
| `57121c7` | Domain 类型/validator/导出、Contracts 回归、§21 实际契约 |
| `94336f7` | 真实 Mongo service/HTTP Timeline 回归 |
| `ceb4d5d` | Web 占位兼容与定向产品回归 |

验收文档、检索入口和 current-task/handoff 的收口提交为包含本文件的 commit。
完成 P11.1C 后停止，只在新的明确指令下接续 P11.1D。
