# P11.1B Generic Date Data Path 验收

日期：2026-10-13。基线：`499877a`。状态：**P11.1B PASS，已完成并停止**。
仅覆盖 P11.1B；P11.1C 未开始。正式版本保持 `0.0.1`，P11 目标版本仍为 `0.0.3`。

## 数据契约与行为

正式标准见 [P11 §10.4](../p11-timeline.md#104-p111a--p111b-date-数据契约)。

| 形状 | 示例 / 约束 |
| --- | --- |
| Legacy | `"2026-10-13"`；无损读写，编辑 start 不升级 wire shape |
| 单日期对象 | `{ start: '2026-10-13' }`；原对象保持对象 |
| 日期范围 | `{ start: '2026-10-13', end: '2026-10-15' }`；不带 timezone |
| 单 datetime | `{ start: '2026-10-13T09:30:12.345Z', timeZone: 'Asia/Shanghai' }`；无 end |
| datetime 范围 | canonical UTC start/end + 有效 IANA timeZone；保持毫秒 |

继续复用 P11.1A validator / normalizer；未知字段、非法 timezone、无效日期、非 canonical
instant、混合类型与逆序范围拒绝。相等 end 保持显式范围；省略 end 不伪造时长。
只有 Date Property 可接受上述对象，其他 Property 与派生结果不因联合类型扩展而放开对象。

原 Record POST 增加可选 `properties` 初值；旧 body 保持兼容、API 路径不变。
初值按真实 schema 校验，title 仍来自 Page.title，派生字段不持久化；null 初值省略。
Page、Record 与 Database version 在既有 Mongo 事务内一致创建或回滚。

Mongo 查询沿用受校验 aggregation：date-only start 补为 UTC 零点，datetime start 保持
canonical instant。Sort 与 cursor anchor 使用同一键；empty 始终最后，Record ID asc
为最后 tie-break。既有 `is / before / after` Filter 按 start 的 UTC 日历日比较，范围 end /
timeZone 不改变结果。原始值仍用于持久化/响应，没有日期集合、materialized key 或全库迁移。
无 Filter/Sort 的查询继续 ID 索引快路径；旧 cursor 的 scope/config/version fence 保持。

Formula 将 Date 对象投影 start 的 UTC 日历日，输出仍为 `YYYY-MM-DD`，不增加 range
结果类型。Rollup Date 仍只支持 count/count_values，每个非空对象计一次，date min/max
继续拒绝。同型 Date 变更保留全部字段；legacy Date → text 保留字符串，日期对象 → text
沿用未支持转换的清除行为，既有类型变更确认与事务回滚不变。

Table 显示 start、显式 end、UTC datetime 与 timezone 元数据；多字段完整草稿可编辑保存。
只修改 start/timeZone 不丢其他字段，datetime 毫秒保留。字段间 Tab 不提交，首末 Tab 可
离开编辑器，Enter/保存提交完整值，Esc/取消关闭，显式清除才删除整个值。
错误/409 保留草稿并可刷新后重试；未知网络提交结果通过 normalized 结构相等确认。

## 验证环境与结果

- MongoDB **8.0.32**，Windows portable binary；全新临时 dbpath，不复用历史或用户数据。
- 单节点 replica set `p111bAcceptance`，`127.0.0.1:27711`；primary 和真实 transaction probe 通过。
- 所有 API 测试通过 `P4_TEST_MONGODB_URI` 指向隔离实例，每次生成随机数据库并清理。
- Web：`http://127.0.0.1:7173`，Chromium/Chrome，桌面与 `390×844` 响应式 Web。
- Browser 技能未在会话中列出；依据 frontend-testing-debugging 使用仓库 Playwright。
- 日志与截图：`E:\Temp\eotion-p111b-20261013-ad204e56`，不提交运行产物。
- 验收后隔离 Mongo 实例已停止；测试日志、临时 dbpath 与截图保留。

| 验证 | 结果 |
| --- | --- |
| Domain tests / typecheck / build | 41/41；通过 |
| Contracts tests / typecheck / build | 24/24；包含新 Record POST 初值 schema；通过 |
| SDK tests / typecheck / build | 23/23；通过 |
| Storage tests / typecheck | 7/7；通过（无独立 build script） |
| API server-domain | 2/2；真实 Mongo |
| API Database | 12/12；真实 Mongo，含 P11.1B 新日期/查询/事务测试 |
| API HTTP | 1/1；真实 Mongo |
| API Database HTTP | 4/4（含 2 个子测试）；真实 Mongo |
| API typecheck / build | 通过；API 合计 19/19，0 failed / 0 skipped |
| Web 定向 P11.1B + 相关旧流程 | 最终 4/4；workers=1 / retries=0 |
| Web 全部 Database 测试 | 111/111；fresh dev server，workers=1 / retries=0，0 failed / 0 skipped |
| Web typecheck / production build | 通过；既有 >500 kB chunk warning |
| 独立 reviewer | 首轮发现 Tab 边界 trap；修复与定向复核后 0 blocker |
| `git diff --check` / UTF-8 无 BOM | 通过 |

Web P11.1B QA：URL / 页面标题匹配、非空产品内容、无 Vite error overlay、console/pageerror
检查、desktop/390px 截图和实际保存/重载交互全部通过。
截图为 [桌面](E:/Temp/eotion-p111b-20261013-ad204e56/web-verified-screens/p111b-date-editor-desktop.png)
和 [390px](E:/Temp/eotion-p111b-20261013-ad204e56/web-verified-screens/p111b-date-editor-mobile-390.png)。

核心验收已由真实测试覆盖：legacy 回归；五种 wire shape 的 POST/PATCH/GET 和既有 Page
createRecord 路径；合法 normalization 与非法值拒绝；其他类型对象拒绝；mixed Filter/Sort；
升/降序、limit 1/2 与多 Sort prefix 的 keyset 分页；旧 cursor 409；CAS 与注入失败后的实际
事务 rollback；Formula/Rollup；同型/跨型转换与 rollback；Table 编辑、重载、草稿与焦点。

## 验证过程中处理的问题与边界

- Mongo 首轮发现新测试的 ID tie-break 预期错误和 fixture 残留；按二进制 ID asc 修正，
  清理新增 Record/Page 并恢复旧日期初值，没有修改生产排序或弱化旧 P8 断言。
- Web 日期清空后的可访问名称增加属性上下文；旧 locator 已适配，并继续明确检查空文本
  与 API null。review 发现的 Tab 边界 trap 已修复，真实焦点逃离与无 PATCH 回归通过。
- 初轮完整 Web 出现 phone settings 与两种 Board drawer draft 的时序失败；Board 测试
  仅等待抽屉可见就填标题，尚未等 embedded Record Editor 初始化。只读调查后补既有
  可编辑就绪条件与操作前草稿断言；保留原操作后身份/草稿/联动断言，未修改 Page/Block
  sync 或 P9 产品逻辑。最终 fresh 全量 111/111、零重试通过；未取得失败时的精确事件
  trace，不宣称修复了所有潜在 PageView 标题草稿竞争。
- 构建保留既有 bundle chunk warning；测试 dev proxy 有未被 mock 的 auth/snapshot
  ECONNREFUSED 与 ResizeObserver 通知。P11.1B 用例检查页面身份、内容、Vite overlay、
  console/pageerror 和实际交互，仅排除测试主动制造的 409 / 请求中断。
- 未运行完整 Product 全套、API performance/MCP 全套、Desktop/Electron 或 Lynx/原生真机；
  390px 仅为响应式 Web 证据。真实 Mongo 查询已运行，不以 Mock 代替其正确性证明。

## 改动文件与提交

| 范围 | 文件 |
| --- | --- |
| Domain | `packages/domain/src/date.ts`、`database.ts`；`test/date.test.cjs`、`database.test.cjs`、`database-property-conversion.test.cjs` |
| Contracts | `packages/contracts/src/index.ts`、`database.test.cjs` |
| API | `apps/api/src/modules/server-domain/repositories/database.repository.ts`、`schemas/database-record.schema.ts`、`services/database.service.ts`、`database.test.ts`；`modules/http-api/database-http.test.ts` |
| Web | `apps/web/src/components/editor/DatabaseNodeView.vue`、`apps/web/tests/product-database.spec.ts` |
| 文档与交接 | `docs/p11-timeline.md`、`docs/p8-database.md`、`docs/context/README.md`、本文件、`.agents/current-task.md`、`.agents/handoff.md` |

实现提交：`5e2d3e1`（Domain/Contracts）、`03d8ee0`（API/Mongo + 创建初值）、
`ccc3b63`（Web Table 日期与回归）；文档/验收收口为本文件所在提交，详见 handoff。

P11.1C 接续入口：[P11 §10.4](../p11-timeline.md#104-p111a--p111b-date-数据契约)、
共享 date helper、generic records/View config 与新增 query/cursor 回归；后续 date source /
View config 必须补 lifecycle fence。本轮不实现 Timeline renderer、缩放、拖拽或依赖连线。
