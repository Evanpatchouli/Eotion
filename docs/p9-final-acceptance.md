# P9 Multi-View Final Acceptance

2026-10-13。Acceptance baseline：`52af49bb2b1b9ee22ececd6d3d31e8b6e0796a57`，开始时 master 工作区干净。P8 Database SEALED；本轮独立验收 P9 Table / List / Board，不增加功能，不进入 Release Acceptance、版本更新、tag 或 Database MCP。

状态：**P9 FINAL PASS**。Domain / Contracts / SDK / API / MCP、Web typecheck/build、完整 Product 367/367、P9 补验 65/65 与既有 visual 7/7 全部通过；三尺寸视觉、生命周期、CAS、兼容和独立复核没有确定的 P9 P1/P2 blocker。

产品实现仍为 acceptance baseline；仅两项测试定位适配形成 `a8d05132407fa550c6b5c6004b15fd7f02bf7a0f`，最终完整 Product 在该 HEAD 执行。本报告所在文档 commit 只收口验收记录、Roadmap、上下文和交接。

## 架构与产品边界

- 持久化仍只有 Database、DatabaseProperty、DatabaseRecord、DatabaseView 四个实体及四个 Mongo collection。renderer 内 `BoardRecord` / `ListRecord` 是 generic response 的局部类型别名，`columns` 是展示计算值，没有 Board/List entity、Column collection 或 renderer-specific persistence。
- `DatabaseView.type` 为 table / list / board。Board 分组只用 `config.options.groupByPropertyId`；Table/List 沿用 filters / sorts / visibleProperties / propertyOrder。未知 options 保留，清除分组只删 grouping key。
- `/views/:viewId/records` 与 legacy `/table` 进入同一个 `getViewRecords()`。Web 继续使用兼容 `/table` seam；Filter、multi-sort、分页、cursor/version/config fence 和 Page.title/derived projection 在服务端，Board 收到 records 后才在客户端分组。
- Database Block 只持有 databaseId/viewId。切换当前 Block 不改变 linked Block 的引用；同 viewId 共享配置，不同 viewId 独立配置。没有 migration；P8 Table config 缺少 options 仍合法，历史缺 config 仍按原默认配置读取。
- Page/Block 保持 Local-first。P8→P9 的 storage adapters、productSync、Electron SQLite 和 Mobile 路径没有相关改动；Database 数据仍在线读写、离线只读，不进入 Page/Block oplog。
- P6 MCP 页面工具继续只投影 Database Block 的 databaseId/viewId，没有 Database Records / Properties / Views CRUD tools。

直接代码入口：`packages/domain/src/database.ts`、`packages/contracts/src/index.ts`、`packages/sdk/src/index.ts`、`apps/api/src/modules/http-api/database.controller.ts`、`apps/api/src/modules/server-domain/services/database.service.ts`、四个 database schema、`apps/web/src/components/editor/DatabaseNodeView.vue` / `DatabaseListView.vue` / `DatabaseBoardView.vue`、`apps/web/src/editor/databaseNodes.ts` / `blockCodec.ts`、MCP read contract。

## Domain / Contracts / SDK / API / MCP

以下每组均为独立命令的计数，不相加为去重测试总数；通过组均 0 fail / 0 skip。

| 验证 | 本轮结果 |
| --- | --- |
| Domain tests | 35/35 PASS |
| Contracts tests | 24/24 PASS |
| SDK tests | 23/23 PASS |
| Domain / Contracts / SDK typecheck | 全部 PASS |
| API full typecheck / build | 全部 PASS |
| Database HTTP + service 两文件、真实 Mongo | 14/14 PASS |
| API test:domain | 13/13 PASS |
| API test:http 第一段 HTTP / Database HTTP | 4/4 PASS |
| API sync-http | 1/1 PASS |
| API file-http | 24/24 PASS |
| P6 test:mcp 完整回归 | 30/30 PASS |

主要命令：

```powershell
pnpm --filter @eotion/domain test
pnpm --filter @eotion/contracts test
pnpm --filter @eotion/sdk test
pnpm --filter @eotion/domain typecheck
pnpm --filter @eotion/contracts typecheck
pnpm --filter @eotion/sdk typecheck
pnpm --filter @eotion/api typecheck
pnpm --filter @eotion/api build
pnpm --filter @eotion/api exec node --test dist/modules/http-api/database-http.test.js dist/modules/server-domain/database.test.js
pnpm --filter @eotion/api test:domain
pnpm --filter @eotion/api test:http
pnpm --filter @eotion/api test:mcp
```

本轮 full API build/typecheck 实际通过，之前 handoff 记录的 MCP/Zod 编译 blocker 没有复现，不继承旧失败结论。开始时本机没有 Mongo listener，MCP 首次运行 28 pass / 2 fail，Database combined 等待连接后中止；这些初始环境失败没有计作验收通过。随后按 [MongoDB 官方 Windows ZIP 方式](https://www.mongodb.com/docs/v8.0/tutorial/install-mongodb-on-windows-zip/)准备 portable 8.0.10，核对官方 SHA-256，只在 Temp 独立 dbpath 的 localhost:27709 启动 `p9Acceptance` 单节点 replica set，等 PRIMARY 后覆盖测试进程 URI。所有真实测试在随机隔离数据库执行并清理，未修改 .env、依赖、Windows service 或现有数据库；结束后验证 executable path 并停止本轮 mongod PID，27709 已无监听。

真实回归覆盖 generic/legacy query、跨 endpoint cursor、Page.title 和 Relation/Rollup/Formula 投影、Filter/multi-sort、Database/View/Record CAS、scope/permission、Board grouping dependency delete/type 409 与释放后恢复、旧 Table config 和未知 options 保留。P6 运行了真实 Bearer HTTP/Page/Write 集成及 Database Block 引用输出，不能仅以编译或 contract tests 代替集成 PASS。

证据：`E:/Temp/eotion-p9-final-20261013-52af49b/core/acceptance-summary.txt`、`commands.tsv`、逐条日志；Mongo checksum / download / init / shutdown 在同级 `mongo/`。

## Web 完整回归与测试适配

Web typecheck 和 production build 均 exit 0。Build 有大于 500 KB 的 chunk 提示；本轮不扩大 bundle 优化范围。仓库没有 lint script，不将未配置的 lint 记为 PASS。

完整 Product suite 使用 fresh Vite server，`workers=1`、`retries=0`，没有仅运行 P9 grep：

```powershell
pnpm --filter @eotion/web typecheck
pnpm --filter @eotion/web build
pnpm --filter @eotion/web test:product --workers=1 --retries=0
```

| 运行 | Total | Pass | Fail | Skip | 结论 |
| --- | ---: | ---: | ---: | ---: | --- |
| 首轮完整 Product | 367 | 363 | 4 | 0 | 保留失败证据与逐项隔离复跑 |
| P9 测试适配后 targeted | 2 | 2 | 0 | 0 | PASS，trace on |
| 修正后第二轮完整 Product | 367 | 366 | 1 | 0 | 保留 Sync 初始加载失败证据 |
| 第二轮唯一失败隔离复跑 | 1 | 1 | 0 | 0 | PASS，trace on；完整失败未复现 |
| 最终完整 Product | 367 | 367 | 0 | 0 | PASS，exit 0；1 worker / 0 retries / 0 flaky |

首轮失败处理：

1. Phone header 的 `group name: 数据库视图` 非 exact，P9 新建分组 `新建数据库视图` 导致 strict mode 匹配两个 group。隔离稳定复现；改为 exact 定位原菜单。
2. Inline View rename 测试仍断言 menu 只有一个直系创建 button，P9 创建类型容器包装后收到 0。隔离稳定复现；改为新建分组恰好 3 个 button，并分别精确断言 Table/List/Board 创建入口可见。原名称编辑、hover、图标、muted color 等断言全部保留。
3. Settings profile 的输入框 fill 在首轮超时；trace on 的隔离复跑 1/1 PASS，未复现。P8→P9 的相关测试、Settings/Auth 直接路径无变更。
4. Nested Table/Toggle 用例首轮期望 `Bmoved`、实际 `moved`；trace on 的隔离复跑 1/1 PASS，未复现。该测试与 Table/Toggle/Editor 直接实现路径在 P8→P9 无变更。

后两项不称为已知 flaky，不改其断言、实现或 retries；保留首轮与隔离证据。最终完整复跑中均通过，完整 gate 已闭合。两处确定的 P9 test-only 修正提交为 `a8d05132407fa550c6b5c6004b15fd7f02bf7a0f`，没有修改产品实现或 identity fence。

第二轮唯一失败是 `product-sync.spec.ts:309` 的 Workspace list 403 用例：行 312 初始“还没有页面”在 5 秒内不可见，发生在 fixture 设置 403 前。隔离复跑 1/1 PASS（5.3 秒），最终完整复跑中也通过。该测试、productSync、productWorkspaces、auth 和 storage 路径在 P8→P9 无变更；保留静态归属和各轮运行证据，不将其称为已知 flaky，不修改 Sync 或降低门禁。

最终完整运行从 `2026-10-12T18:54:08.909Z` 开始，耗时 1,037,430 ms（17.3 分钟）。实际命令在上述完整 `test:product` 后增加 `--trace=on --reporter=line,json --output=<full-final/artifacts>`，仅用于独立证据归档。JSON 为 expected 367 / unexpected 0 / skipped 0 / flaky 0，errors 0，config workers 1 / retries 0；CLI exit 0。`web/full-final/product-suite.json`、`product-suite.log`、`product-suite.exit-code.txt` 与 367 个 trace 保留，owned Vite 已停止，7173 无监听。

Web 首轮、targeted-fixed、每项隔离 trace / JSON / error context / log 保存在 `C:/Users/evanpatchouli/AppData/Local/Temp/eotion-p9-final-20261013-52af49b/web/`，各运行使用独立 output directory，未覆盖首轮。

## 产品行为验收覆盖

以下记录完整 Product、真实 API 和补验中通过用例的直接证据；完整 Product 门禁单独计数，没有以分项通过代替。

| 行为 | 直接证据 |
| --- | --- |
| View CRUD / 配置隔离 | Table/List/Board 创建沿用既有 View API；六种有向切换、rename/delete/fallback、当前 Block 引用持久化、linked Block 引用保持；相同 viewId 共享配置、不同 viewId 独立配置。既有 `product-database.spec.ts` 与 List/Board 两项 CRUD 补验通过。 |
| Table / P8 回归 | records、Page.title、text/number/checkbox/select/date 编辑、Relation/Rollup/Formula 投影、服务端 Filter/multi-sort、visibleProperties/propertyOrder、分页/同 cursor 重试、Record 打开 preference 与离线只读。既有 Database Product 与真实 API 回归通过。 |
| List | Page.title / 空标题“无标题”、属性可见性与顺序、共享服务端 Filter/multi-sort、Record 打开、empty state、三尺寸；补验真实 GET loading、load error retry、25→31 唯一记录分页和离线只读通过。没有 List mutation API。 |
| Board renderer / settings | configured/unconfigured、空 Select options、空列、未分组、Page.title、属性可见性/顺序；分组候选仅当前库 Select、set/change/clear、未知 options 保留、shared/independent View、离线不可写。既有 Product、54 项矩阵和真实 API 通过。 |
| Board mutation / dependency | picker 的 option→option、option→null、null→option、同组 no-op；Desktop drag 高亮、跨列/未分组、pending 不先移动、server-confirmed refresh、failure 原列、409 显式刷新重试；分组 Property delete / select→非 select 返回 409，释放分组后 mutation 恢复。Phone picker 是完整写入路径，不要求 touch drag。 |
| CAS / 生命周期 | Database/View/Record CAS、View config 409、Record cell 409、delayed View PATCH success/409、外部 Block/viewId 收敛、A→B→A、旧响应不污染新 View；真实 Editor/NodeView/Drawer DOM 与 Vue 引用、title/body LocalStore 草稿和等价 snapshot 保持。没有改当前 identity fence。 |
| 兼容 / Storage / MCP | 无 options 的 P8 Table config、legacy `/table` 与 generic records 兼容；Page/Block Local-first、Database online read/write / offline readonly；真实 P6 MCP 30/30，仅输出 Database Block 引用，不增加数据库 CRUD tools。 |

## P9 Visual / Responsive / Lifecycle 补验

既有 `playwright.visual.config.ts` screenshot comparison 与 P9 专项截图分开记录。既有 harness 没有 P9 snapshot；不自动生成或批准新的像素基线，也不因非产品像素差异重写 UI。

临时 P9 harness 复用 `product-database.spec.ts` 的 API fixture 和实际产品入口，保存在 ignored `apps/web/test-results/p9-final-harness/`；可复查副本在 Temp `supplement/harness/`。矩阵为 9 场景 × 3 viewport × Light/Dark，共 54 项：Table、List、configured Board、View selector、Board settings、Select-only grouping candidates、unconfigured Board、empty Board、empty Select options Board。尺寸为 1440×900、834×1112、390×844；Phone 是 Chromium touch/mobile context，Tablet 为 touch context。

每项检查 renderer 互斥、文档无横向 overflow、浮层在视口内；Board Desktop/Tablet 保持内部横向滚动与横排，Phone 单列并保留 picker。配置 fixture 有空列、未分组与 Page.title 空标题。Phone 整页截图先保存，随后用真实滚动逐列/逐 Record 捕获 viewport。截图等 fonts ready、真实 loaded identity 与 Overlay 稳定状态，未增加 breakpoint。

11 个专项产品探针补充现有 suite 的直接证据：List/Board 分别 25→31 唯一记录分页及 append failure 同 cursor 重试、初始 GET loading barrier、load failure retry、cached offline Database readonly 与 Page body LocalStore 编辑、当前 View rename/delete/fallback 且 linked reference 保持；另以真实 Record body LocalStore draft 和同步 POST 门禁检查背景 renderer 切换、Board grouping config/record mutation、等价 snapshot convergence 前后的 Editor/NodeView/Drawer/Record editor DOM 与组件 identity。

最终同一源的完整补验 **65/65 PASS**（54 项矩阵 + 11 项产品探针，0 fail / 0 skip，exit 0，139.0 秒）；既有 screenshot comparison **7/7 PASS**（0 fail / 0 skip，exit 0，12.0 秒），未更新任何基线。新 P9 场景没有既有像素 baseline；其结论来自实际截图、几何断言和人工检查，不能虚称新场景完成了像素 baseline comparison。

主 Agent 人工检查了 17 张有效截图，覆盖全部 9 类场景、Desktop/Tablet/Phone 与 Light/Dark，未发现视觉 blocker。Table 的局部横滚、List 属性与空标题、Board 横排/单列、空列/未分组、View selector 三类创建入口、分组 Settings 与 Select-only popup、empty/unconfigured Board 均可读且没有视口外浮层。最终保留 54 张矩阵截图和 10 张 Phone Board 逐视口截图；另外 2 张原 locator 全高截图被裁剪，仅保留为调试证据，不用于视觉 PASS。

正文探针使用真实键盘编辑和 IndexedDB LocalStore。同步 POST 测试门禁开启且 mock server 尚未收到同步 POST 时，Table→List→Board、分组 View PATCH 和精确 Record ID 的 cells PATCH 均保留正文、title 及 Editor/NodeView/Drawer/Record editor DOM 和 Vue 实例引用。等价 snapshot 的 fixture 对齐只复制 host Page 的 Database Block，不预拷 Record Page 正文。解除门禁后观察到真实同步 POST、snapshot revision 增加、semantic comparison 为 true、服务端最终包含正文，LocalStore/Drawer 文本与所有引用保持。这项探针不单独断言 POST 与 snapshot GET 的请求顺序；产品原有 push-before-pull invariant 没有绕过，也不宣称 pending operation 在被产品拒绝的 snapshot 中完成了替换。

最终源 SHA-256：`B50D2CB5C997EFC2C2CB1CC0F94B4DC06A45033980B75885A8E61221308AA055`；config：`4CBA2C63B56CAE635E4194CC73F4C473F1C593E194D7BD0918B0E27B240557CA`。副本在 Temp `supplement/harness/`；`harness-results-final-65.json`、`visual-results-final.json`、相应 log、65 个 trace 与 `captures/` 均可复查。Owned Vite 已停止，7173 已释放给最终 Product run。

临时 harness 首轮为 65 total / 36 pass / 29 fail / 0 skip（exit 1），保留 JSON、trace、error context 和截图。失败归于脚本边界：Table/selector 多嵌套一层根定位 12 项；未配置 Board 错套记录断言、增加空选项后旧列数预期 12 项；GET barrier glob 未命中 2 项；重命名后误切关闭已打开菜单 2 项；Drawer 遮住后台 Settings pointer 1 项。按真实 UI/request 行为最小修正后重新完整运行，没有拼接首轮成功项和单项复跑冒充完整 PASS。

第二轮为 65 total / 50 pass / 15 fail / 0 skip（exit 1）：Table/selector 错套 List/Board 的“无标题”可访问名称 12 项，修正菜单流程时临时变量声明顺序错误 2 项，正文探针用第一张卡片操作 Archive 却断言 Launch 1 项。按 P8 Table 空值契约、声明后检查菜单、精确 Record ID 定位纠正；View/Record PATCH 仍校验真实响应与目标请求，空标题、linked 引用、真实草稿与 identity 断言均保留。前轮失败不计为产品 PASS，结论只采用同一最终源完整 65/65 的结果。

第三轮为 65 total / 44 pass / 21 fail / 0 skip（exit 1）：Table 的相对 locator 和 List 含装饰箭头的整按钮文本预期 18 项；CRUD 对异步 Page/Block 同步做即时 server mock 引用断言 2 项；正文探针 Playwright 方法拼写 1 项。主 Agent 核对实际 DOM、Table/List/Board 源码与 P8 已有异步持久化断言后收口最终脚本。CRUD 保留精确 LocalStore 与服务端 attrs 断言，仅按原契约等待异步收敛；正文探针按精确 Record ID 操作，保留 View/Record PATCH、目标列、其他 Record 不变及所有草稿/identity/snapshot 断言。受影响的 6 项诊断后，最终同一源完整补验 65/65 与既有 visual 7/7 均通过。

最终诊断保留 6 项中的 5 pass / 1 fail：正文 snapshot 因永久 abort sync POST 无法越过产品 push-before-pull gate。改为先验证未同步草稿安全，再解除测试门禁后，正文单项 1/1 PASS。一次将 Board 误套 List 内部 span 的错误完整运行在 26/65 时人工中止，标为 INTERRUPTED（没有完整 JSON），不计入任何完整通过结论；主 Agent 直接修正 renderer 分支，Board 精确定向 1/1 后同一最终源完整 65/65 通过。全部前轮失败、诊断和中断证据保留。

对临时 spec 的额外独立 TypeScript 命令得到 9 条复用 fixture / Vite 动态 `/src/...` import 诊断，没有将该命令记为 PASS；它不进入产品 build/typecheck 的源集合。产品 Web typecheck/build 和最终真实 Playwright 运行单独记录，未修改 fixture 类型或产品代码来隐藏结果。

人工检查发现 Phone locator 全高 Board 截图被页面滚动容器裁剪，下方为空白；它不提供完整可视证据。最终改用真实逐列/逐 Record 滚入视口的 viewport 截图，不拼接或修改图片，不调整 UI。

## 独立复核与阶段结论

独立 reviewer 已确认 test-only 修正没有弱化断言，并复核同模型/generic seam、Board dependency 事务/CAS、P9.6 scope/epoch/Editor/DOM identity fence、storage/MCP/legacy 边界，静态审读未发现确定 P1/P2。`renameView` 的相似在途风险沿用 P9.6 记录：没有稳定运行复现与用户可见 blocker 证据，不擅自扩大修改。

最终证据与文档 diff 经同一独立 reviewer 收口复核，没有确定的 P1/P2。确认的 P9 blockers：0；所有用户指定关键项均已完成。没有增加功能、依赖、breakpoint 或修改产品 identity fence；只有测试适配与正式验收文档变更。

已知非阻塞记录：production build 大于 500 KB 的 chunk 提示；前轮 Settings / Table / Sync 失败保留原始证据，本轮隔离与最终完整复跑通过，运行时根因未确认，不称为已知 flaky。临时 harness 的独立 TypeScript 诊断与调试失败已如实区分于产品 typecheck 和最终运行结果；不将它们标成通过，也不据此扩大产品修改。

P8 Database 保持 SEALED，P9 Multi-View Final Acceptance 正式通过。验收服务已清理，正式记录与交接提交后停止；不进入 Release Acceptance、版本更新、tag 或 Database MCP extension。

**P9 FINAL PASS**
