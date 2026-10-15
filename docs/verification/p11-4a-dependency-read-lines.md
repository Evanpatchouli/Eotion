# P11.4A Dependency Read Model + Lines

日期：2026-10-16（Asia/Shanghai）。基线 `2f9734b4a2bb10ea2c8c51679d3075d92749fd1c`。
分支 `codex/p11-4a-dependency-read-lines`，开始工作树干净。版本保持 0.0.1，P11 目标 0.0.3。
**Final verdict：PASS（P11.4A Scope）；完成后停止，P11.4B/C/D 未开始。**

实现提交：`552207a3c805f9483b3c3f55cef40a818ebe4024`（纯投影/geometry/logic）、
`5dd2c03`（SVG/preview/Web）；文档验收提交为包含本报告的提交，最终 HEAD 见交付报告。

## 1. 数据与只读边界

唯一来源为当前已授权 View 已加载 canonical records 的现有 self Relation `string[]` Cell。
没有 Dependency entity、持久 ID、collection、endpoint 或请求路径；不写 Relation、不写 Date。
配置沿用 `propertyId`、`direction`、`shiftMode`、`avoidWeekends`；后二者只读取/校验、不执行。
P11.1D 服务端硬引用 fence 保持 source of truth；本轮未修改 domain/API/schema/fence。
renderer 再对当前 schema 的 Property 存在性、Database 归属、原生 relation 类型与 self target
fail closed；不可读 schema 不在输入中，不额外请求，也不猜测其他 Relation。

`depends-on`：A cell 包含 B → B predecessor → A successor。
`blocks`：A cell 包含 B → A predecessor → B successor。
纯 `projectTimelineDependencies` 生成 `{id, predecessorRecordId, successorRecordId}`；
ID 是 property/pred/succ 的 JSON tuple，按 ID 确定排序，无 Date 副本、DOM 或 Vue ref。
空值/坏 wire shape、重复、self edge 跳过。filtered/unloaded/deleted/invisible target 都在投影时
过滤，不保留 unresolved edge；分页正常追加或 canonical refresh 后重新投影，不 N+1、不扩大窗口。

## 2. Geometry、routing 与窗口

共享 `layoutTimelineItem` / temporal map / transform 是 Bar 和 Dependency 的唯一坐标来源。
range exit 为 raw visual end，entry 为 raw visual start；point/zero marker 是 raw center；Y 为
Bar top + height/2。all-day inclusive visual end 直接继承既有 geometry，不重复日期数学。

forward 使用水平退出、中点垂直段与水平进入；backward/near edge 使用水平 lead、共享行几何
推导的 gap 绕行再进入。不隐藏排期倒序关系，不自动改日期。两端 raw anchors 必须在 bounded
canvas 内，否则不画完整线；viewport 外但 canvas 内保留，SVG 自身裁剪。没有每边 DOM measurement。

projected edges 基于 loaded View result；renderable edges 需两端 scheduled/canvas 可解析；
window-relevant edges 的 row span 与共享 row window 相交，含两端窗外跨越窗口的边，并保留
isolated focused row 关联边。没有因 viewport 外就当成未加载。Frozen/Bar/line Y 来自同一 layout。

## 3. Preview、layer 与性能模型

canonical geometry 在 transform/records 变化时布局；无 edges 时跳过额外全量布局。
投影 O(N+links) 加稳定排序，geometry O(N)，window selection O(E)，不做 edges × DOM rows。
每个 edge 是稳定 key 的独立组件；Viewport 的稳定 reactive Map 按 record ID 接收现有 Bar
controller 最终 preview geometry。各 path computed 只订阅两个端点 key，pointermove 不重解析
Relation、不重投影 records、不重算无关 edge。取消/卸载/scope change 清 override，pending
复用原 Bar preview，成功后跟随 generic canonical refresh。没有第二套 mutation 状态机。

Grid < Dependency < Today < Bar < preview/handles。SVG/path `pointer-events:none`、aria-hidden、
focusable=false，无新增 Tab 项；每实例 marker ID 唯一，线和箭头使用现有 text-secondary token。
箭尖沿末段提前 10px（SVG marker refX=17），避免 point 菱形覆盖方向；path 仍连接到共享端点。
沿用 native horizontal scroll 与 bounded canvas，不增加第二套 mobile layout。

## 4. 本轮验证

Web 使用仓库 Playwright + Chrome / mock HTTP seam；不以 fixture 代替真实 Mongo 验收。
本轮没有更改 domain/API/schema/lifecycle fence，因此不为 read renderer 启动 Mongo。

| 验证 | 结果 |
| --- | --- |
| Timeline logic（7 个 dependency 新用例 + 52 个原有用例） | 59/59 PASS |
| Domain | 48/48 PASS |
| Contracts | 25/25 PASS |
| P11.4A Web 新用例 | 8/8 PASS；marker 修正后 interaction 1/1 PASS |
| 完整 Database Web（单 worker、retries=0） | **153/153 PASS，3.9 分钟**，含最终 marker 与全部 8 个 A 用例 |
| Web typecheck / production build | PASS；build 有既有 >500kB chunk warning |
| 独立 reviewer | 最终生产/测试 diff 0 个可证实 P1/P2 blocker；未重复跑测试 |

完整 Database 覆盖 P11.3 Drag/Resize 提交、no-op、409 rollback、point/range round-trip
click 抑制、Start/End read-only，以及取消、pending、unknown、identity、offline 与原有
100/500 mutation smoke，全部通过。没有把本轮 A 的只读测试当作 Date mutation 验收替代。

Logic 的 7 个分组覆盖全部 23 项要求：无/坏配置、Property 缺失/非 Relation/非 self target、
空/单/多/重复/self/missing Cell、depends-on/blocks、上下/远近行、forward/backward、四种
point/range anchors、raw clipped/offscreen/canvas、row-window/focus/span、确定 ID/order 与
frozen input 不变性。另有 shared layout scale/rebase 的 screen coordinate 数值回归。

Web 的 8 个分组为两种 direction、无配置、preview/scroll/scale/navigation/390/theme 综合场景
与四组 density 样本；覆盖实际 filter、未加载分页目标、多链接、point/range、backward、raw
X/Y 与 Frozen row 对齐、drag/resize 预览跟随/取消、elementFromPoint 命中 Bar/handle、普通
click 打开 Record、scale/Previous/Today/Next 不增加查询。无配置 geometry Map 为空且 Bar 可打开。

### N+1 与 100/500 观察

测试记录全部 harness HTTP requests。明确只显示 Title/Date，Frozen 同样不显示 Relation，
从而隔离既有 Relation title resolver；没有把 title resolution 的 POST 当作 dependency 请求。
100/500 的 generic table GET 分别恰为 4/20 次（25 条/页），额外 Record GET 和 record-options
resolve 均为 0；预览/缩放/导航没有 PATCH 或补取业务数据。生产 dependency 模块没有 service
import 或 fetch 路径。本结论不声称显示 Relation 列时既有标题缓存也永远不发请求。

| Loaded records / density | Projected edges | Rendered paths | Rendered rows（含原 row overscan） |
| --- | ---: | ---: | ---: |
| 100 / sparse | 11 | 11 | 100 |
| 100 / medium | 197 | 197 | 100 |
| 500 / sparse | 51 | 3 | 28 |
| 500 / medium | 997 | 59 | 28 |

四组真实 pointer drag 中 projectedItems、temporalMap、dependencyEdges、dependencyGeometryById、
windowDependencyEdges 引用均稳定，incident path 的 d 改变且 Escape 恢复；无关 path 节点保持，
MutationObserver 累计 DOM mutation 为 0，move 阶段 PATCH 为 0。scroll/scale 不重建 Record /
Relation projection；500 条滚动后 row-window 仍有界。resize 在综合场景验证关联边跟随和取消。
这些是固定样本的更新/数量观察，不是 FPS benchmark、任意高密度上限或后端负载测试。

### 视觉与原始证据

主 Agent 视检最终 1440×900 Light/Dark、390×844 Light/Dark 及 drag preview；Today 红线清晰、
Frozen 行与线对齐、箭头可见、390px 无 document 横向溢出，Timeline 仍原生横滚。
首次视检发现箭头被 point 菱形覆盖，已用 marker 10px 呈现偏移修复并复验；不修改锚点。
390px 首张捕获 Sidebar 关闭动画中间态，后续等待其完全关闭后重拍，最终不采用中间态作证据。
既有 ruler label density 不在本轮 polish 范围。

原始证据保留于系统 TEMP（不提交账号/fixture 运行产物）：

- `eotion-p114a-domain-contract-6f691b56e60a4c0f967ebb1c98b4106c/`：Domain、Contracts、Web typecheck/build。
- `eotion-p114a-timeline-logic-20261016/`：59 项 logic、typecheck 与 diff-check。
- `eotion-p114a-web-final-20261016-011606.log`：聚焦 8/8。
- `eotion-p114a-web-marker-20261016-011701.log`：marker 修正后 interaction 1/1。
- `eotion-p114a-web-1792084627207-4648/`：最终 6 张 PNG。
- `eotion-p114a-database-full-dc363e89496a4b9685581fab4de83896/`：完整 153 项原始日志、
  list、独立 artifacts、最终 typecheck/diff-check。Vite 有少量既有 mock seam 未拦截的 sync
  snapshot 代理到 7137 后连接拒绝日志，相关测试通过；不将其表述为真实 API 已连接。

初轮失败日志 `eotion-p114a-web-20261016-011102.log`、`011210.log`、`011356.log` 保留。
原因分别是把既有标题 resolver 计为 N+1、evaluateAll 闭包错误、把 record geometry 数量误要求
大于 edge 数、Record overlay selector 错误；均修正 harness 后复跑，不削弱业务门禁。

未运行：真实 API/Mongo、Web 连真实 API 全链 E2E、完整 Product 全套、Electron/Lynx 真机、
正式 FPS benchmark、独立截图 baseline diff、P11.4B/C/D、P11.5、P11 Final 与发布流程。

## 5. 停止与精确接续

本轮只到 P11.4A；不进入 P11.4B、不声明 P11.4 或 P11 Final COMPLETE。
P11.4B 接续先读取 `packages/domain/src/database.ts` 的 `TimelineDependencyOptions`、本报告与
`apps/web/src/components/editor/timeline/dependency.ts` 的 `projectTimelineDependencies` / routing。
写入接缝是 `DatabaseNodeView.vue.setRelation` → `productDatabases.ts.updateProductDatabaseRecordCell`
→ `DatabaseService.updateRecordCell` / `assertRelationValues` 的现有 generic Cell CAS/事务；
同时参考 `prepareTimelineBarDrag` / `moveTimelineRecord` 的 scope/identity fence 调查 editing 边界，
独立定义创建/删除/拖线与cycle策略的需求、失败语义和验收。可以复用本轮只读 edge/geometry，
但不得把 read renderer 当成 mutation/entity/API 授权；auto shift / avoidWeekends 执行仍属于 C。
