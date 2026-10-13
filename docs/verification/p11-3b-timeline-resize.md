# P11.3B Timeline Resize Range Mutation

日期：2026-10-14（Asia/Shanghai）。**P11.3B范围验收PASS**。基线 `288bdc1`，分支 `codex/p11-3b-timeline-resize`，开始时工作树干净。正式版本保持0.0.1，目标0.0.3。本轮只执行P11.3B，完成后停止，不进入P11.3C。

## 架构与行为

`Pointer handle → useTimelineBarDrag shared transient preview → resizeTimelineDateValueFromX → NodeView adapter → updateProductDatabaseRecordCell → existing Cell PATCH → Database/Record CAS + Mongo transaction → canonical projection`。

- 仅single Date Property可写。独立Start/End只显示/打开，不显示可用handles，不发送两次PATCH；无新endpoint、collection、queue或公共API。
- Range左handle仅改start，右handle仅改end。越界clamp到另一端，相等仍保留显式end；不交换、不生成inverted range。
- Point仅有end handle，只有向右到有效吸附目标才创建end。Persisted end在release成功前仍absent，preview可从marker变为range。Legacy string升级为Date object；既有object保持object。
- All-day end持久化为包含式日期。右handle原anchor是end次日日初，目标exclusive日界逆转为前一Gregorian日期，DST不用24小时倒推。Point原anchor为start日初，右移一日可生成显式同日range。跳过整日时inverse选择最后存在的前一日期；原端点跳日fail-closed。
- Snap来自scale.futureSnapUnit：Hour15min、Day1h、Week/Biweek/Month/Quarter1day、Year1month；date-only最细day。以原端点为相对anchor，nearest/ties forward，统一timeToX/xToTime和calendar engine；不复制density。Datetime保canonical UTC、原IANA timezone、另一端instant及原毫秒。Fold、midnight gap、year10000内部exclusive边界与溢出有回归。
- Move/resize共用armed/dragging/saving和单个active session。Pointermove只计算active item，release最多一次完整Cell PATCH。Handle为独立sibling button，有accessible name/focus/cursor，事件不触发body drag或open；主体click继续Record Host。零宽range仍有双handle，clamp时保capture元素。Viewport边缘hitbox内收且两端不重叠，marker/极窄条内收handle使用行顶部compact hitbox，保留主体中心点击区域。
- 沿用P11.3A scope/epoch/DOM/Editor/viewport/native-scroll fence、online/cancel。409 clear preview并canonical refresh，不自动retry；4xx rollback；5xx/transport沿用generic uncertain-state核对。失败不永久留preview，不重建Host/Drawer/Editor。

## 验证

| 项目 | 结果 |
| --- | --- |
| Timeline logic | 43/43 PASS（既有28 + mutation15，其中A7/B8）；多端点/shape/clamp/inclusive/七scale/DST/跳日/年界/错误输入 |
| 真实API/Mongo | 19/19 PASS，0fail/skip；现有database domain + database HTTP两文件 |
| Web/API typecheck及build | PASS；保留既有Editor chunk >500kB提示 |
| 新Web resize | 7/7 PASS，workers=1/retries=0；最终focused一轮14.9s |
| 既有相关回归 | 最终完整17/17 PASS；含P11.3A drag/Timeline/Date/CAS |
| 独立review | 两项边缘命中blocker已修，最终0剩余确定blocker |
| Diff/文本检查 | git diff --check、16个改动文本的strict UTF-8无BOM检查PASS |

| 新Web工作流 | 证据 |
| --- | --- |
| all-day左/右、point升级 | 只改单端、完整object、inclusive end；legacy/object point右移升级；reverse/no-op0PATCH；handle不drag主体/不开Record |
| preview/release/refresh | move0PATCH且fixture原值保持；每次release仅1 Cell PATCH；Frozen/Table/reload值及geometry一致；Start/End source0handles |
| native viewport边缘 | native scroll将端点对齐边缘，elementFromPoint命中handle；cancel0PATCH/release1PATCH；zero marker body命中并可开Record |
| datetime七scale | 两端resize、source timezone、UTC毫秒123与另一端保留；显式zero range左handle/clamp后会话可继续 |
| conflict/error | 409远端canonical值rollback、400/500恢复确认值、单请求无retry，preview清除 |
| identity | RecordHost/Drawer/PageEditor/RecordEditor/NodeView DOM/Vue实例与两个Tiptap身份保持，正文draft保留；标题允许既有blur autosave |
| 100/500 | 按25条完整加载；armed后采样，projection/temporal/rowGeometry/Frozen refs保持，其他Bar DOM mutations=0/Vue updated hooks=0/组件refs保持，move0PATCH |
| 390与视觉 | 390真实start resize preview→Escape保持原值/0PATCH，focus可见，无document横溢；Desktop1440/1920与390 Light/Dark五PNG已root视检 |

正常日期验收收集console/pageerror并断言无相关应用错误，页面内容/无Vite overlay通过。
未复用mock API的通过来代替真实Mongo项，未把局部更新观察等同帧率benchmark。
首轮旧回归17项中P11.1B formats找不到block、P11.3A 390point drag保持idle各失败一次；两项
单测与后续完整17项均通过，原因未证明，不能称为已证实的基线失败或全Product稳定全绿。
focused开发期间Table回切曾有26px geometry差；在viewport resize/视图切换后等待两帧稳定后
独立及最终focused通过，没有放宽geometry断言。测试启动期间还遇到Vite拒绝连接，最终持久
server下串行运行通过；不把开发启动/fixture定位失败隐藏成首次全绿。

最终有效Mongo验证在已提交的`6cb2803`测试源快照上执行，使用独立27716 / replicaSet p113bFinal / 全新dbpath，binary为本机已有MongoDB8.0.32。命令前同一进程显式设置并核对P4_TEST_MONGODB_URI；PID29880已通过admin shutdown优雅关闭，日志exitCode0，27716无监听。Domain/HTTP helper每次建随机测试库并删除；Date full range验证generic validator、单次双version增加、GET持久化、stale Record CAS409与Database bump事务回滚。完整日志在`C:/Users/evanpatchouli/AppData/Local/Temp/eotion-p113b-final-mongo/logs/`的api-build.log、api-typecheck.log、database-tests.tap.log、mongod.log。此前独立p113bAcceptance/PID4812的19/19仅作为过程记录，也已优雅关闭。

执行疏漏：一个执行agent另启动了未设置P4_TEST_MONGODB_URI的HTTP test，dotenv注入后未产生TAP结果，收到提醒即Ctrl+C终止。该test helper回退127.0.0.1:27017并改为随机test库名；无法从无输出run确认是否连接或创建测试库，不采用为验收证据、不访问用户库清理。root事后只读检查27017无监听、无残留该test进程；有效19/19均来自独立27716 run。

Browser plugin的专用browser skill/runtime在会话中缺失，按frontend-testing-debugging使用仓库Playwright fallback，URL `http://127.0.0.1:7173/#/app/database-workspace/page/database-page`，Chrome channel。流程为正式Page/Database renderer → handle pointer → local preview → single release mutation → canonical Bar/Frozen/Table/reload。外部截图/日志目录`C:/Users/evanpatchouli/AppData/Local/Temp/eotion-p113b-validation/`，focused日志p113b-focused.log，最终build日志logs/web-build-final.log；logic与旧回归原输出在工具会话。五PNG副本位于`C:/Users/evanpatchouli/.codex/visualizations/2026/10/13/01a1367e-2601-7951-98ef-bb6da130d638/timeline-resize/`。

命令：

```powershell
pnpm --filter @eotion/web exec playwright test tests/timeline-mutation.spec.ts --workers=1 --retries=0
pnpm --filter @eotion/web exec playwright test tests/timeline-coordinate.spec.ts tests/timeline-projection.spec.ts tests/timeline-layout.spec.ts tests/timeline-frozen-table.spec.ts tests/timeline-mutation.spec.ts --workers=1 --retries=0
$env:EOTION_VISUAL_QA_DIR = Join-Path $env:TEMP 'eotion-p113b-validation'
pnpm --filter @eotion/web exec playwright test tests/product-database.spec.ts --grep 'P11.3B' --workers=1 --retries=0
pnpm --filter @eotion/web exec playwright test tests/product-database.spec.ts --grep 'Timeline|timeline|P11.1B formats|409 refreshes the latest record' --grep-invert 'P11.3B' --workers=1 --retries=0
pnpm --filter @eotion/api build
$env:P4_TEST_MONGODB_URI = 'mongodb://127.0.0.1:27716/?replicaSet=p113bFinal'
pnpm --filter @eotion/api exec node --test --test-reporter=tap dist/modules/server-domain/database.test.js dist/modules/http-api/database-http.test.js
pnpm --filter @eotion/api typecheck
pnpm --filter @eotion/web typecheck
pnpm --filter @eotion/web build
```

## 提交与接续

- `6cb28033262e82192d38dedb36ed653ba7a8b0db`：resize/snap纯函数、logic/API回归。
- `251c1a317b7aa0d0fbb20a3d9c826da796238f38`：UI接线与Web回归。
- 正式验收/docs收口commit即包含本页的提交。

不运行全Product/P11 Final/native真机/正式帧率benchmark，不发布、不改版本。不实现multi-cell、dependencies/auto shift、multi/bulk、Undo/Redo、offline、Calendar、settings/inline Date editor或P11.3C polish。

Separate Start/End mutation requires generic transactional multi-cell Record mutation. Before that capability exists, range move/resize remains read-only.

P11.3C只在后续独立授权后从`TimelineBar.vue`、`useTimelineBarDrag.ts`、`mutation.ts`/`snap.ts`和现有NodeView adapter接续UX工作；完整keyboard mutation可留P11.3C/P11.5。B的捕获/吸附/单Cell/CAS不变量保持，禁止将deferred multi-cell、dependency或settings当作C默认范围。
