# Handoff
## 2026-10-10 P8.5 Advanced Properties 完成

P8.1–P8.5 PASS，P8.5 current；基线5179c584b335484268e9b9be995d529ef5b2f5d6。仅本阶段，一个聚焦commit；P8.6 not started，到此停止。

单向 multi Relation 使用稳定 Record ID[]（最多50、重复拒绝、保留顺序），允许self/纯关系图环；同Workspace target校验、source/target事务fence；Record删除按sourceDB总10000行有界清理incoming relation，不删Page/targetDB；依赖属性拒删。Rollup支持count/count_values和number sum/avg/min/max，只读、读取时计算，target限base属性。Formula严格AST+静态类型+同库cycle/depth验证，不执行任意代码；array/object enum拒绝且不调用转换hook。派生Filter/Sort明确拒绝，Relation仅empty/nonempty，保持P8.4分页语义。Page.title、online-only/MCP边界不扩大。

Quiet Studio Table配置/picker/Formula模板编辑、linked及目标变更派生刷新、动态标题、390px/离线/error/retry完成。Bounds与删除/类型/图规则详见docs/p8-database.md，检索入口docs/context/README.md。

验收：Domain30、Contracts15、SDK21、API domain9、HTTP27、MCP30、fresh完整Product243、Database32、Storage7+11、Visual7、titlebar2；typecheck及Web/API/Desktop build、diff与UTF-8无BOM通过，零新blocker，独立review0。Desktop node12/17的4个legacyprops及1个EPERM为已确认基线；附件两项早期fixture超时各隔离3/3，fresh全集通过；HMR模块状态分离由无源码修改的fresh服务复跑确认，未削弱断言或更新visual baseline。日志在系统Temp/p85-validation，截图在本任务仓库外p85-ui。

已知限制：date min/max延期；Rollup不可target relation/derived；derived query不支持；Formula轻量JSON AST editor；有界大库search/cleanup会fail-closed；没有跨客户端Database实时推送/离线复制/MCP扩展。390px为Chromium响应式，非原生宿主真机新增验收。

## 2026-10-09 Desktop Custom Title Bar 独立修复

基线 `50a914d15c716576926098672b9dde53960ffd9f`。实现和独立 review 完成（0 blocker）；仅桌面标题栏，不开始 P8.5。BrowserWindow hidden + 44px Windows/Linux native overlay，主题外观同步；ProductShell drag/no-drag 和 CSS env safe area；无 Product Topbar 的页面补 Electron fallback header。正式契约见 `docs/runbooks/desktop-production.md`，回归入口 `apps/web/tests/desktop-titlebar.spec.ts`。

Desktop/Web typecheck/build、相关 Desktop/ProductShell/interaction/theme 回归通过，新 titlebar 2/2。最终完整 product 238/239：linked-view 列上移点击 DOM detached/30s 超时，隔离单 worker 通过；没有削弱断言。Desktop node tests 12/17，5 项 SQLite 测试失败（Invalid block attributes、EPERM）；对应实现和测试与基线 HEAD hash 一致，未顺手修复。diff-check 通过。

真实 Windows 原生 UI 已检查窗口按钮、双击最大化/还原、顶部内容、普通/最大化布局、顶栏/侧栏/SyncStatus 点击和 Light/Dark。**真人鼠标拖动仍待确认**：Sky 对默认原生标题栏对照窗口同样无法移动，不能将自动化工具结果当作产品拖动失败或人工通过。已向用户请求确认并保留隔离 Eotion 测试窗口；后续只收尾这项验收，不启动 P8.5。macOS/Linux 原生视觉未验收。

## 2026-10-09 P8.4 Views + Filter + Sort 完成

P8.1–P8.4 **PASS**，P8.4 为 **current**；基线 `4f123090066b7016f1c658a3536f4bd88c624853`。本轮仅交付 P8.4，P8.5/P8.6 not started，到此停止。正式契约与检索入口见 `docs/p8-database.md`、`docs/context/README.md`。

同一 Database 多 Table View 支持创建、重命名、切换和安全删除。View 独立保存 AND filters、多级 sorts、visibleProperties/propertyOrder，records/properties 共享；linked 引用修改 Record 后按各自配置刷新并保留加载深度。六种基础 Property 有严格 operator/type/option ID 校验；空值双向排序均末尾，Record ID asc 最终兜底。服务端先筛选/排序再 keyset 分页；无 Filter/Sort 保留索引 limit+1 与批量 Page 投影，动态查询采用受校验的 Mongo 映射。

至少保留一个 View；被持久化 Block 引用的 View 拒绝删除，当前引用先切换并同步，不自动改写其它 Page。View 引用写入与删除使用事务 fence；配置和生命周期沿用 owner 权限、Database/View version CAS。Property 删除同事务清理所有相关 View 配置；option 删除只移除真正带该 option ID 的 Filter，保留空值条件。Page/Block 继续 Local-first，Database/View online-only，没有 Database oplog、新 MCP tools 或 Page DTO 数据扩展。

验收：Domain 24/24、Contracts 12/12、SDK 20/20、API domain 5/5、HTTP 27/27、MCP 30/30、完整 product 239/239、storage package 7/7、浏览器/Electron 11/11、visual 7/7，零 skip；根 typecheck、Web/API build、SDK 缺版本负向编译检查、git diff --check 与 UTF-8 无 BOM 通过。500 条记录的真实 Mongo profiler 回归验证默认首/次页查询成本。Desktop Light/Dark 与 390×844 View/Filter/Sort/列设置截图已人工检查；独立 review 最终 0 blocker。首轮两个旧回归超时后定向重复各 6/6，最终完整 product/storage 均通过，未削弱断言。日志和截图保留于 ignored `test-results/p84-validation/`、`test-results/p84-visual/`。

已知边界：仅 Table、20 条 AND Filter、10 条 Sort、最多 100 Property/View；没有 OR/nested、高级属性、列宽持久化、完整 Database offline sync 或跨客户端实时推送。动态筛选/排序、View 删除引用扫描、Property/option 清理成本随数据规模增长；共同 Database version 可能要求刷新重试。Page 并发改名不提供跨页快照隔离；未知操作恢复仅限客户端会话。移动验收为响应式 Chromium，不替代原生宿主真机测试；Web 保留既有大 chunk 提示。

## 2026-10-09 P8.3 Properties + Record Editing 完成

P8.1 PASS；P8.2 PASS；P8.3 **PASS / current**，基线 `014ddbbcb1b4be104a7c9c08950e1a545102de99`。本轮仅交付 P8.3，P8.4–P8.6 not started。正式契约与检索入口见 `docs/p8-database.md`、`docs/context/README.md`。

Property 支持 title/text/number/checkbox/select/date；非 title 可新增/删除，全部可重命名，select option 使用稳定 ID。Table 提供 typed cell 编辑、清空、校验、保存错误与冲突重试；linked 引用刷新共享数据并保留分页深度，390px 可编辑。Page.title 是唯一持久化标题来源，Record 读响应投影标题与 pageVersion，后续写入清除旧 title 副本；Table 标题写入与 Record 在同一事务内 CAS。新记录先输入非空标题，再原子创建 Record + Page。

HTTP/application/domain/repository 继续复用 Workspace owner 权限，拒绝跨 Workspace/Database 注入；schema/cell 使用共同 Database version，Property/Record/Page 使用对应版本条件。删除 Property 或 option 在同一事务内清理受影响值。Database 编辑仅在线；Page/Block 继续 Local-first，MCP 不新增工具，get_page 只返回 Database 引用。

验收：Domain 23/23、Contracts 12/12、SDK 19/19、API domain 4/4、HTTP 27/27、MCP 30/30，零 skip；product 237/237（Database 26 + 其余 211，单 worker）、storage package 7/7 与浏览器/Electron 11/11、visual 7/7、根 typecheck、Web/API build、git diff --check、UTF-8 无 BOM 通过。Desktop Light/Dark 与 390×844 cell/property/select 编辑截图已人工检查，保留在 ignored `test-results/p83-visual/`。最终独立 review 0 blocker。

已知边界：没有类型互转、Filter/Sort/其他 View、高级属性、Database MCP 或完整 Database offline sync；共同 Database version 可产生需刷新重试的冲突，删除 Property/option 的事务扫描成本随记录数增长。Page 离线改名继承现有 last-writer 同步语义；未知创建跨重启幂等恢复仍未扩展。移动验收为 Chromium 响应式证据，Web 保留既有大 chunk 提示。本轮到此停止。

## 2026-10-09 P8.2 Inline Database + Table View 完成

P8.1 PASS；P8.2 **PASS / current**，基线 `3ddab71784220fd928be9c411cc19965323679cc`。本轮只交付 P8.2，P8.3–P8.6 not started。实现与正式边界见 `docs/p8-database.md`，检索入口见 `docs/context/README.md`。

`/database` 在独立正文空行或 Toggle 真实子块打开选择器：新建 Database/默认 title Property/Table View/引用 Block 走同一 Mongo transaction；linked 绑定当前 Workspace 的既有 Database/View，不复制数据。Table 展示基础属性、分页及 empty/loading/error，390px 使用块内横向滚动。新增 Record 同事务创建普通 Page，标题沿用现有 Page 路由与编辑器；删除 Block 不删除 Database。Block props/MCP/Page snapshot 继续只保存引用；Database 数据没有完整 offline/sync。

未知提交按本次固定 Block/Page ID 核对；不能确认时会话内禁止同页面再次插入、同 Database 再次新建 Record，并提示联网刷新确认。周边正文继续本地保存。跨应用重启幂等恢复、结构化属性编辑、Filter/Sort、其他 View 与 Database MCP tools 均未实现。

验收：Domain 23/23、Contracts 12/12、SDK 19/19、API domain 4/4、HTTP 26/26、MCP 30/30，零 skip；完整 product 单 worker 231/231（含 Database 20/20 与 P7），根 typecheck、Web/API build、visual 7/7、`git diff --check`、UTF-8 无 BOM 通过。独立 review 最终 0 blocker。Connectivity 单张陈旧截图按现有 env 关闭诊断行的行为维护，视觉阈值未变；桌面明暗主题、空表、错误和 390px 初始/横向滚动截图已人工检查。

真实事务与权限使用隔离 Mongo replica set 测试，已关闭本任务启动的实例；Web 使用 mock transport，移动端证据为 Chromium 响应式截图。截图保留于 gitignored `test-results/p82-visual/`。Web 仍有既有大 chunk 构建提示。到此停止，等待用户下一个阶段指令。

## 2026-10-11 P7.5 Advanced Blocks 验收完成（P7 COMPLETE）

P7.1–P7.5 全部 PASS，**P7 Advanced Blocks COMPLETE**。本轮只做验收（不新增 Block、不开始 Database），基线 `84f5c0d`，验收记录见 `docs/p7-advanced-blocks.md` 的「P7.5 Advanced Blocks Final Acceptance」。

验收：新增 `apps/web/tests/product-p75-acceptance.spec.ts`（混合文档创建→编辑→缩进/重排→reload→浏览器进程重启→offline→reconnect→push/pull，含 ID/parent/orderKey 与 orphan/cycle 检查；旧 P5/P6 页面兼容）。`test:product` 211/211（`--workers=1`）、`test:storage` 11/11（含 Electron SQLite）、domain 17/17、contracts 6/6、storage 7/7、API domain 2/2、HTTP 24/24、MCP 25/25、typecheck/build:web/build:api、`git diff --check` 通过；`test:visual` 6/7，唯一失败仍是既有 `Connectivity backend unavailable desktop` 基线差异（21748 px，ratio 0.02），不更新基线。

独立只读 review 报 2 个 BLOCKER，均已修复并补回归：

1. 编辑器可产出 codec/domain 拒绝的结构（粘贴 `<ul><li><p>a</p><h2>b</h2></li></ul>`、`<blockquote><table>…` 或在 listItem 内用 `# ` input rule）→ 整页永久无法保存。修复：`apps/web/src/editor/contentRules.ts` 用 domain `EDITOR_NODE_RULES` 派生 `listItem`/`blockquote` 的 ProseMirror content，`useDocumentEditor` 关闭 StarterKit 对应节点；放不进容器的粘贴内容被提升到最近合法祖先，内容不丢。
2. 属性维度同类漏洞：`<ol type="A">`、`<ol start="abc">`、非法 cell span、HTML 注入 `blockId`。修复：`EotionOrderedList`（type 固定 null、start 归一化为正安全整数）、`tableNodes` cell span 归一化与 colwidth 不解析、`blockIdentity` 的 `blockId` `parseHTML: () => null`。回归 `product-content-rules.spec.ts`。

另外修复：P7.3 回归「Toggle 子块内 slash 折叠列表静默无效」（`isBlockCommandRangeSafe` 把包住选区的父 toggle 误判为被吞掉的 child owner）；测试环境「Vite watcher 因 Playwright 临时目录 EBUSY 崩掉 `pnpm dev`」（`vite.config.ts` 的 `server.watch.ignored`）。

当时记录的 Toggle summary MCP 保真度和服务端 props 校验缺口已在封板后边界修复中解决（见 `docs/p6-mcp.md` 与 `docs/p7-advanced-blocks.md`）。仍保留的已知限制：5,000 块连续输入仍是既有 O(N)/docChanged（基线约 112 ms/字符，本轮约 119 ms/字符）；真实设备输入法与原生宿主验收仍不由浏览器回归替代。运行 `test:storage` 前需清除 `ELECTRON_RUN_AS_NODE`。

环境：本轮在 `apps/web/package.json` 新增 `@tiptap/extension-blockquote@3.31.3` 与 `@tiptap/extension-list@3.31.3`（starter-kit 已依赖的同版本），新增依赖后需重启 `pnpm dev`。

下一步：P7 已封板，不开始 Database / Property / View / Relation 等下一阶段，等待用户指令。


## 2026-10-07 P7.3 Nested Blocks UX 完成

P7.3 已 PASS。Tab/Shift+Tab 缩进、拖拽嵌套、slash 上下文过滤、移动端缩进/反缩进、child attachment 顶层边界、hardBreak+marks 一致性全部落地，并走既有 moveBlock → block.move → LocalStore → sync。核心文件：apps/web/src/editor/nestedBlockInteractions.ts（单 PM transaction 移动整棵子树，MAX_BLOCK_DEPTH=8，`Decoration.node` 高亮不改正文 DOM）、apps/web/src/editor/blockCommandContext.ts（以 registry / allowedChildTypes / EDITOR_NODE_RULES 过滤 slash 与附件）、packages/domain/src/order.ts（LIS 保留旧 key、只给移动块补 gap）。

验证：product 189/189（`--workers=1`；默认多 worker 有本环境既有 flaky）、domain 13/13、contracts 6/6、storage 7/7、API domain 2/2、HTTP 24/24、MCP 22/22、Electron SQLite 17/17、test:storage 11/11、typecheck / build:web / build:api / git diff --check 通过；visual 6/7，唯一失败为既有 Connectivity 基线差异 21748 px。独立 review 0 blocker；已关闭移动端 Touch Toolbar 绕过上下文过滤（曾可在 listItem 内建出 codec 拒绝的 heading 导致整页无法保存）与工具栏选区 range safety，并补回归。

性能回归已修：拖拽把手由逐块 rAF 定位（5000 块 O(n²)，readyMs 38.5s）改为每帧一次批量定位（约 4.5s，与无把手基线一致）。

已知限制：附件仍只支持顶层插入且不参与块级拖拽；MCP nested document replacement 拒绝；大文档持续输入仍是 O(N)/docChanged；被拒绝的 drop 静默无提示。运行 Electron 用例前清除本沙箱默认的 `ELECTRON_RUN_AS_NODE=1`。下一步：P7.4 Table 未开始。

## 2026-10-06 P7.1 Advanced Blocks 交接

P7.1 Block Model Foundation 实现完成。阶段重定义：P7 由「协作」调整为 Advanced Blocks（P7.1 Block Model Foundation / P7.2 Rich Blocks / P7.3 Nested Blocks UX / P7.4 Table / P7.5 Acceptance），原协作内容顺延为 P7.x，docs/roadmap.md 与 docs/README.md 已同步。

- Block 单一来源：packages/domain/src/block-types.ts 的 BLOCK_TYPES / BLOCK_NODE_TYPES / BLOCK_CAPABILITIES / EDITOR_NODE_RULES / BLOCK_COMMANDS 同时服务 editor codec、server domain、MCP read 与 slash menu；BLOCK_TYPES 新增 toggle 属加性扩展，旧数据仍合法。
- 嵌套模型：复用 parentBlockId；packages/domain/src/block-tree.ts 提供 self-parent / missing parent / cross-page parent / cycle 校验与稳定树重建（buildBlockTree / flattenBlockTree / orderForDeletion）；LocalStore、SqliteLocalStore、BlockService、validateWorkspaceSnapshot 共用同一实现；reparent 走新的 block.move（contracts + LocalStore.moveBlock + SyncService）。
- 编辑器：EotionToggle + ToggleNodeView；折叠状态是 localStorage 偏好（eotion:collapsed-toggles），不进入 props；BlockIdentity 覆盖 toggle 子区块；PagePersistence 按 parent 分组分配 orderKey、parent 变化发 block.move、删除按子先于父排序。
- MCP：无新 tool；read 增加可选 parentBlockId/depth 并按深度优先返回，toggle 可读不可写。
- 验证：domain 10/10、storage 6/6、api domain 2/2、api mcp 16/16、web test:product 167/167（含新增 product-blocks，需 `--workers=1`；本沙箱默认多 worker 运行偶发与本次改动无关的 UI 超时，逐个单独运行均通过）、test:storage 11/11、root typecheck、build:web/build:api、git diff --check 通过。注意本沙箱默认 ELECTRON_RUN_AS_NODE=1，会让 3 个 Electron 用例报 Process failed to launch，运行前需清除该变量。test:visual 为 6/7，Connectivity backend unavailable desktop 在干净基线同样失败，属既有环境基线差异，与本阶段无关。
- 独立 review（只读）无 blocker；review 提出的 Major（新测试未接入脚本、BlockIdentity 身份继承、环/损坏树未 fail-closed、allowedChildTypes 未落地、toggle summary 假设）已在提交前修复并补回归测试。
- 已知限制：已有段落转 Toggle 会走一次 block 重建（旧段落 block 删除 + 新 toggle block 创建）；wrapIn 与 Quote 相同会留下尾部空段落区块；拖拽嵌套与 Tab/Shift+Tab 缩进属于 P7.3。
- 下一步：本轮只到 P7.1，不开始 P7.2。

## 2026-10-06 HarmonyOS 应用内补测交接

用户指定根 release/0.0.1-beta/Eotion-0.0.1-beta-harmony.hap，构建 a0d3a4da93eb，已通过 hdc install -r 覆盖安装 nova 14 (TLR-AL00/OpenHarmony-6.1.1.120)。用户帮登录后只执行应用内剩余项目；用户说已手测断网重连等，本轮不重复网络切换/kill。附件上传也由用户接手，当前未收到结果。

报告 docs/verification/device/mobile-harmony-in-app-2026-10-06.md。Workspace/Page/本次中文composition与基本输入/系统选择菜单通过；长正文末行caret被Touch Toolbar遮挡，Safe Area/IME FAIL；标题按钮实际H2，不满足原H1。图片/文件入口均可弹出ArkWeb系统选择界面，不可沿用旧Android picker失败推断Harmony。普通在线重开内容保留并已同步，不替代pending oplog或第二客户端闭环。网络/Session真正kill Gate未独立重测，完整Mobile Acceptance不得PASS。产品无修改。

原始证据在ignored根release/0.0.1-beta/runtime-verification/harmony-20261005，包含账号信息勿提交；提交证据在docs/verification/device/evidence/harmony-20261006。保留新Page“无标题HARMONY_ACCEPT_20261006”供复核与用户附件手测，当前App停在该Page，未改变设备网络/旋转设置。后续独立修复需先定位caret避让中的visualViewport/inset/滚动容器真实数据；当前只有源码线索，没有证明根因。

## 2026-10-04 公共官网与用户指南交接

`apps/site` 已实现独立 VitePress 官网：六节首页、download、8 篇 guide、changelog；版本/build 复用根 package.json，发布记录复用 apps/web/src/releaseInfo.ts。维护入口 docs/runbooks/public-site.md。版本/typecheck/build、339 链接/锚点/资源、2 SSR 回归、7 Playwright 与三尺寸 Light/Dark 视觉检查通过；独立 review 无剩余 blocker。

上线前配置真实 EOTION_SITE_ORIGIN、公开安装包 URL 与新官网 DNS/TLS。未配置 origin 时 noindex/robots 禁止抓取，不生成伪 canonical。APP origin 保持 https://eotion.evanpatchouli.space。eotion-site 只占本机 8002，现有 Web 8001 不变。Docker 完整镜像构建被 Corepack 访问 npm registry 网络错误阻断；同 Nginx 配置挂载静态产物的临时容器 HTTP 验证通过（公开路径 200，开发路径 404）。部署网络中应重跑完整 image build；本轮未发布公网服务。

## 2026-10-04 最新交接：Mobile 验收（仅 Android）

用户将本轮调整为只测 Android，nova 14 / HarmonyOS 不测。本轮最新 master 基线 3625f74，重新构建 APK 并覆盖安装现有 MuMu Android12，保持既有登录。报告及脱敏证据见 docs/verification/device/mobile-real-device-2026-10-04.md；原始日志/截图/探针在忽略目录 apps/mobile-hosts/release/runtime-verification/acceptance-20261004/。

Android Session 与 Workspace/Page、完全断网下两次 force-stop/restart（A/B 保留）通过；重连后需点击同步状态重试，随后已同步且服务端/独立 Web context 均读到 A/B。原生图片/文件 picker 均失败；javap 证据显示 XElement4.1.0 默认 WebView 没有 WebChromeClient/onShowFileChooser。Touch Toolbar 标题为 H2，不满足本轮 H1 要求；MuMu IME 高度0，真实 composition/键盘安全区未完成。Todo 正文短tap触发checkbox是另一个定位线索（正文位于label内）。仅提交文档与证据，未改产品。完整 Mobile Acceptance / P5.4 / P5 不能据此声明 PASS；下一步独立修复/补测上述边界，HarmonyOS以后补测。已有测试清单正文已恢复，新增无标题测试Page保留复核；网络/旋转设置已恢复。

以下为较早阶段背景，当前移动验收状态以上述报告为准。

> 仅在任务需要跨会话、跨 Agent、跨模型或暂停后继续时填写；任务完成后清理。

- Goal: P5.4 Real Sync 的完整退出验收。
- Current state: Web / Electron 的正式 local-first 链路与自动 E2E 已完成；P5.4 暂不标完整 PASS。
- Completed: Snapshot API/SDK、`page.move`、IndexedDB/SQLite 安全 hydrate、按当前账号 workspace 过滤 oplog、Page Tree/Editor 本地保存、Push→Pull、离线身份/工作区缓存、生产 Web Service Worker、保存与同步状态分离。
- Remaining: 在目标 Mobile WebView/Lynx 宿主使用稳定 HTTPS origin（或先决策 bundled/local origin 的迁移方案），完成真机完全断网重启、继续写入及重连验收，然后决定 P5.4 PASS。当前默认 LAN HTTP 开发地址不满足安全上下文，不能作为该验收路径。
- Key evidence: `docs/p5-real-sync.md`；独立 review 已检查覆盖保护、跨账号发送、活跃编辑器、空段落、Web/SQLite 语义。
- Files changed: `packages/contracts`、`packages/sdk`、`packages/storage`、`apps/api`、`apps/web`、`apps/desktop` 与 P5.4 文档/测试，详见本阶段提交。
- Validation completed: Web `test:product` 55/55、`test:storage` 9/9、`test:real-sync` 1/1、`test:offline-shell` 1/1；storage 6/6、Desktop 7/7、SDK 12/12、API domain 2/2、HTTP/Sync/File 全通过；相关 typecheck/build 与 `git diff --check` 通过。
- Decisions: 本地内容是 durable source of truth；Push 成功且无未同步本地 operation 才允许指定 workspace 的 snapshot replace；顺序多设备采用 Server 最后成功提交的 mutation，无 CRDT/revision merge。
- Next recommended action: 用户当前决定在 P5 Final Acceptance 前先推进 P5.7 UI/UX Foundation & Product Redesign。先做 P5.7.1～P5.7.4 设计阶段并通过 Gate A，再进入正式 UI 实现；范围见 `docs/p5-ui-ux-foundation.md` 和 `docs/design/*`。之后仍需处理或明确 P5.4 Mobile WebView 真机离线重启验收。
- Risks / blockers: Mobile LAN HTTP 无 Service Worker；IndexedDB pending 查询目前读取整个 oplog，历史 synced 记录很多时有性能成本（不影响当前数据正确性）。

## P5.5 后续上下文

P5.5 Attachments 已 PASS，见 `docs/p5-attachments.md`。附件通过既有 Block/oplog 同步；二进制在线上传，IndexedDB/SQLite cleanup queue 按 delete ack、存活引用与当前授权清理。产品回归更新为 72/72，storage/Electron 为 10/10，真实双客户端为 1/1；另完成线上 OSS 图片/文件、刷新、第二客户端、URL 字节和删除后 404 验收。GPT-6.1 Sol 独立 review 无剩余确定 blocker。P5.5 没有新增原生宿主，以上 P5.4 真机待验收依旧保留，也没有关闭整个 P5。


## P5.6 完成 / 下一阶段

P5.6 Settings & Preferences 已 PASS（2026-10-01），版本保持 0.0.1 / build 1，完整实现与验收见 docs/p5-settings.md。独立认证设置路由、宽屏双栏与 compact Index→Detail；昵称跨设备/缓存一致；scrypt 改密通过 Mongo 事务更新 hash/version 并 revokeAll，所有旧 Session 失效；Theme device-local system/light/dark 在生产入口前应用并实时响应系统；固定 Toolbar 默认 OFF，按 user/workspace/device 隔离且不关闭 touch/Slash；MCP/Agent 只有即将推出。

Web product 111/111、Settings 11/11、theme 3/3 + production 1/1、storage/Electron 11/11、offline-shell 1/1、real-sync 1/1；API/SDK/各端构建类型检查均通过。Light/Dark 1440×900、1024×768、390×844 实际截图与独立 review 无 blocker。真实双客户端验证昵称及改密后的旧会话/旧密码失效、新密码可登录。截图在系统临时目录 eotion-p56-visual-qa，临时测试 Mongo 容器已移除。

下一步：单独开始 P5 Final Acceptance。本次不声明整个 P5 PASS；上文 P5.4 目标移动 WebView/Lynx 真机完全离线重启边界仍保留。运行真实测试时可通过 EOTION_REAL_API_PORT / EOTION_REAL_WEB_PORT 避免占用现有服务，见 docs/runbooks/testing.md。


## P5.7 Design First

P5.7 已正式插入 P5.6 与 P5 Final Acceptance 之间。原因：当前核心功能链已成立，但现有 UI/UX 主要由工程实施逐步演化，用户希望在后续 P6+ 扩展前先冻结 Eotion 的视觉基调、交互原则和 Design System。

P5.7.1～P5.7.4 只做 Audit、Design Direction、Design System v1 和核心高保真页面；用户明确批准 Gate A 前不得重构正式 Product UI。P5.7.5 才是实现阶段，P5.7.6 建立 Light/Dark × Desktop/Tablet/Mobile 的 Visual Acceptance / screenshot regression 基线。

主计划：`docs/p5-ui-ux-foundation.md`。设计文档地图：`docs/design/README.md`。


## P5.7.1 Audit 完成 / P5.7.2 Stitch

P5.7.1 UI/UX Audit 已于 2026-10-01 PASS，核心问题见 `docs/design/ui-ux-audit.md`。重点包括：Editor giant bordered Card、Desktop/Tablet Sidebar 不可折叠、Sidebar footer row 不统一、Workspace/Page inline panel 推布局、稳定态 context/status 重复、Attachment nested card、upload placeholder 脱离插入位置、失败反馈重复、cleanup/raw HTTP 技术语言泄露、Settings detail 超宽屏偏窄、Slash Menu 中英双语重复。

用户明确偏好：展开 Sidebar 右上角与右下角圆角，左侧贴边；Login/Register 暂无明显问题，不作为 P5.7 重设计重点。

当前进入 P5.7.2。统一 Design Brief：`docs/design/stitch-design-brief.md`。第一轮在 Stitch 使用同一 1440×900 Desktop Page 场景探索至少 3 个视觉方向；用户选中/组合后再冻结 `design-direction.md` 和 Design System v1。Gate A 前不得修改正式 Product UI。


## P5.7.2 Quiet Studio 冻结

P5.7.2 已于 2026-10-01 PASS。Stitch 第一轮探索 Editorial Paper / Precision Studio / Ambient Focus，后续收敛为 Quiet Studio A/B，并最终批准 **Quiet Studio**：以 A 的 warm editorial / document-first 为主，吸收 B 的 Sidebar 层级、popover 精度和附件信息对齐；不采用 C 的 Document Card / purple / gradient / glassmorphism。

Stitch 导出规范存在 Newsreader、Material-style token、30/32px 冲突及虚构业务内容等不一致，因此不作为 source of truth。正式方向见 `docs/design/design-direction.md`；Eotion 自维护的规范见 `docs/design/design-system-v1.md` 与 `docs/design/DESIGN.md`。

当前进入 P5.7.3。Gate A 前仍不修改正式 Product UI。Stitch 后续仅用于 Dark/Mobile/Settings/companion states 等视觉稿，不再负责最终规范。


## P5.7.3 Dark Theme 冻结

Quiet Studio Dark Desktop Page 已于 2026-10-02 通过人工 review。正式 Dark palette 已写入 `docs/design/design-system-v1.md` 与 `docs/design/DESIGN.md`。Stitch 原始 `text-muted #73716A` 与 `danger #C9615D` 因关键 dark surface 对比不足被修正为 `#8F8D86` 与 `#D06A66`。其余 Dark tokens 保留 Stitch 推导值。Stitch prototype 中残留的 Newsreader / Material Symbols / 虚构 metadata 不属于 Eotion source of truth。

下一项为 Desktop Settings 高保真推演，重点冻结 Settings detail responsive width/cap、navigation density、setting row anatomy 与 form/control visual treatment。Gate A 前仍不修改正式 Product UI。


## P5.7.3 Desktop Settings 冻结

Quiet Studio Desktop Settings Light 已于 2026-10-02 通过人工 review。Stitch 的三档 viewport 导出尺寸和 HTML max-width 与文字汇报不完全一致，因此正式规范采用人工归一化行为：Settings navigation 240px；detail min 520px / max 740px；1280 目标约 620px、1440 约 700–720px、1600+ 封顶 740px；outer gutter 分别 48 / 64 / 80px。Settings 继续保持 P5.6 list-detail IA，不新增功能，不做 Card dashboard。

Light `text-muted` 从 `#8F8D86` 修正为 `#706E67`，在 Light sidebar/canvas 上均达到约 4.6+:1，适合作为 12–13px muted text。下一项为 Desktop companion states：Collapsed Sidebar、Workspace Popover、Page Action Popover、Attachment Upload Failed。Gate A 前仍不修改正式 Product UI。


## P5.7.3 Desktop Companion States 冻结

Quiet Studio Desktop Companion States 已于 2026-10-02 通过人工 review：Collapsed Sidebar、Workspace Switcher Popover、Page Action Popover、Attachment Upload Failed 全部 APPROVED。未新增 token。

冻结要点：Sidebar collapsed 后完全退出主内容区，document 保持居中；breadcrumb 前唯一 reopen control，视觉约 32×32px（实现可扩大 pointer hit area 至约 36–40px），tooltip 为“展开侧边栏”。Workspace Popover 约 240px、trigger offset 约 6px；Page Action Popover min-width 160px、4px padding，固定动作“新建子页面 / 重命名 / 移动 / 删除”。所有 Popover 使用 anchored floating layer，ESC / click-outside 关闭，focus return，keyboard navigation，且不得造成 Page Tree layout shift。

Attachment Upload Failed 固定在最终插入位置，文案“上传中断”，操作“重试 / 移除”；同一次失败仅一个主要错误 Surface，不出现重复全局 banner，也不暴露 cleanup / object-storage 等内部术语。

下一项：Mobile Page 高保真推演（390×844 baseline），重点解决 drawer、mobile topbar/gutters、touch toolbar、IME coexistence、narrow attachment 与 mobile sync/offline presentation。Gate A 前仍不修改正式 Product UI。

## Mobile Native Hosts（Android + HarmonyOS）

本轮为 `apps/mobile` 增加了自有原生宿主：`apps/mobile-hosts/android`（Kotlin/Gradle/AndroidX）与 `apps/mobile-hosts/harmony`（ArkTS/Stage/Hvigor），二者加载 `pnpm build:mobile` 产出的本地 bundle，不依赖 Lynx Explorer，也不复制 Web UI。根命令为 `mobile:android:apk`/`aab` 与 `mobile:harmony:hap`/`app`，详见 `docs/runbooks/mobile-native-hosts.md`。

已实测：Android APK/AAB 构建成功；HarmonyOS HAP/App Pack 在 DevEco 自动调试签名下构建成功、`hap-sign-tool verify-app` 通过，并在 nova 14（HarmonyOS 6.1）真机安装、启动、常驻；两个宿主都读取到打包进产物的本地 bundle（187528 字节）并触发 Lynx `onFirstScreen`/`onLoadSuccess`。

未完成/阻塞：共享 `main.lynx.bundle` 在运行时抛 `ReferenceError: discriminator is not defined`（Android 与 HarmonyOS 完全一致），Lynx 首屏后 WebView 白屏。解码 bundle 可见 `background-thread-script` 顶层使用未声明的自由变量 `discriminator`（zod discriminated-union 路径）；`packages/contracts` 源码用的是字符串字面量，故为移动端打包链路缺陷。修复该 bundle 后，P5.4 的 Mobile WebView/Lynx 真机离线重启验收才具备继续条件。

## 2026-10-04 Mobile Lynx runtime blocker 已关闭

基于master3ef33cf，Mobile从@eotion/contracts根入口取频道常量，意外加载Zod Sync/API schema；Lynx产物的discriminatedUnion初始化有未声明discriminator，旧nova14包本轮复现error201。已用@eotion/contracts/mobile隔离runtime-only协议，root重导出保持兼容，native runtime/host均未修改。contracts边界测试4/4、全要求构建/类型检查及SDK/API回归通过，独立review无blocker。

Android SDK API36、MuMu、HarmonyOS6.1 nova14都实际显示production登录页，无discriminator/error201，白屏消除。APK/HAP同88177B bundle，SHA256 0f98a277417b57bcb5fe5e4fed6b1ea22cba154ea8c87142bc4f9b2a22923664；解码和完整module graph确认无Zod/root，保留production URL/WebView/runtime marker。Android有非阻塞321/2298日志。Android输入和production认证错误响应已验证，nova14用户恢复用手机后未再操作；无测试账号/Session，Workspace/Page未验证。证据在忽略目录apps/mobile-hosts/release/runtime-verification/，正式边界与后续验收见docs/runbooks/mobile-native-hosts.md。本轮只关闭共享bundle blocker，不声明完整Mobile/P5 PASS。

## 2026-10-04 Harmony false-offline 已修复

nova14用户成功登录后显示离线，而MuMu正常。Harmony manifest缺ohos.permission.GET_NETWORK_INFO，设备已装HAP也只有INTERNET；官方ArkWeb FAQ确认缺网络状态权限可使navigator.onLine一直false。Web productSync在该值为false时于请求前退出，但auth.login仍可联网成功。只补GET_NETWORK_INFO后，HAP构建/签名/归档验证通过，覆盖安装保留Session，nova14同一页面由“离线 · 本地已保存”变为“已同步”，有前后UI layout/截图证据。runtime及Web同步逻辑均未变；version检查通过。正式说明见mobile-native-hosts runbook，证据位于忽略runtime-verification目录。完整Mobile/P5验收仍未整体关闭。
