# P11.2 Timeline Renderer 架构

> 架构状态：**P11.2.0 PASS；P11.2A/B/C Scope PASS；P11.2D 核心 Read Acceptance PASS；P11.3 Mutation COMPLETE；P11.4A Read Lines Scope PASS；P11.4B Dependency Editing COMPLETE / PASS；P11.4C COMPLETE / PASS（Scope）；P11.4D 未开始**（实施/验收记录见 §20–§30）
> 基线：`25bd279585772bfdce43799de71fb3c3f5ba5436`（`master`），P11.1D PASS 之后。
> 版本背景：当前版本 `0.0.1`，P11 目标版本 `0.0.3`。§1–§19 保留 P11.2.0 的架构基线；该阶段仅修改文档。P11.2A/B/C 的产品实施与验证见 §20–§22，API、schema、sync、MCP、依赖与版本保持。

## 1. 目的与实施状态

本文冻结 P11.2 只读 renderer 的设计，说明接口、模块、组件边界、状态、算法和后续验收。**P11.2.0 基线中的所有 `Timeline*` 接口和 renderer 文件均为拟实施内容，Timeline 分支当时仍是占位。** P11.2A 的 Shell / 坐标模块见 §20；P11.2B 的 projection/layout/bar 实施见 §21；P11.2C Frozen Table Scope PASS 见 §22。Dependency、Date mutation 等完整 P11 parity 仍属后续实施。P11.2.0 的架构验算不代表完整 renderer 或 P11 Final 已通过测试。

P11.2 读取已有 `DatabaseView`、options、generic records 响应及完整 Record properties；不增加持久化实体、endpoint、Database mutation、同步路径、package dependency 或 MCP surface。P11.2A 是首个实现单元；本次 P11.2.0 只完成架构文档，不启动实现。

## 2. 基线代码证据

以下观察来自指定基线。行号用于定位已检查的 symbol，不表示拟议 renderer 已存在。

| 证据 | 基线源码与 symbol | 对设计的约束 |
| --- | --- | --- |
| Date 类型、validator、共享 normalize、UTC sort、Formula projection | `packages/domain/src/date.ts`：类型约 1、validator 85、`normalizeDatabaseDateValue` 93、sort 114、Formula 121 | 复用共享 normalizer，不新建 renderer raw-date parser。 |
| Record/title projection 与 Timeline config validator | `packages/domain/src/database.ts`：Record/title 115、Timeline config 173、strict validator 251 | 沿用 Page.title 来源与现有 config 契约。 |
| generic records 应用服务 | `apps/web/src/services/productDatabases.ts:105` `loadProductDatabaseTable` | 当前仍经 legacy table 命名的 seam 委托；本轮不改名、不增加请求。 |
| generic records SDK / contract | `packages/sdk/src/index.ts:125` `getDatabaseViewRecords`、URL 212；`packages/contracts/src/index.ts:166` 默认 50 / 上限 100，响应 210 | 使用既有 generic records 请求和响应；响应包含完整 properties。 |
| View config PATCH 会通知 Database listeners | `apps/web/src/services/productDatabases.ts:162-171` `updateProductDatabaseView`；成功后调用 `notifyDatabaseUpdated` / `DATABASE_UPDATED_EVENT` | 显式共享 config 写入会触发既有刷新通知；不为 scale UI 抑制它。 |
| Database listener 刷新已加载窗口 | `apps/web/src/components/editor/DatabaseNodeView.vue:1543-1551` `onDatabaseChanged`；refresh 实现 400-455 | refresh 保留已加载深度并按 25 条页大小循环 GET，继续使用既有 request epoch、cursor 和 version fence。 |
| 父视图 readiness、打开 Record、格式化 | `apps/web/src/components/editor/DatabaseNodeView.vue`：`viewReady` 64、`openRecordPage` 286、`formatValue` 297 | readiness、格式化和 Record Page 打开均由父层持有。 |
| 父层 load/refresh/switch/save/lifecycle | `DatabaseNodeView.vue`：load 360、refresh 400、switch 733、save config 927、unmount / identity watch 1615 | 保留现有 fence、分页深度和父层 config save。 |
| 占位分支与根裁剪 | `DatabaseNodeView.vue`：Timeline placeholder 1828、root overflow clip 约 1895 | 后续只替换占位路由，并留在当前 root 内。 |
| Table 横向滚动容器 | `DatabaseNodeView.vue:1976` | Timeline 自己持有水平滚动容器，不复用 Table scroller。 |
| List / Board projection | `apps/web/src/components/editor/DatabaseListView.vue:19`；`apps/web/src/components/editor/DatabaseBoardView.vue:28` | 不重构这两个 renderer；Timeline 复用父 formatter 和打开事件。 |
| 相同 Page snapshot 语义比较 | `apps/web/src/views/PageView.vue:168,458` | semantic-equal snapshot 不加载 blocks，也不增加 editor revision。 |
| Record 内容与编辑器 Host | `apps/web/src/stores/databaseContent.ts:17`；`apps/web/src/components/product/DatabaseRecordHost.vue:78`；`ProductShell` 持有 singleton Host | child teardown 不拥有或丢弃 editor draft。 |
| 页面滚动容器 | `apps/web/src/styles/base.css:178` `.document-wrap` overflow auto；`.main-pane` overflow hidden | 不能仅凭 CSS sticky 实现 page pin；不产生 document 横向溢出。 |
| standalone Database Page 已知阻塞 | `apps/web/src/views/DatabasePageView.vue:27,64`；`DatabaseNodeView.vue:733` | view 切换会重载有 view ID key 的 Editor / NodeView；B1 在 §14 单独列为 gate。 |

P11.1B Date 证据及 P11.1C/D 契约是相关背景。此前 B/C/D 验收报告只作为历史证据，不能用来证明本文或新 renderer 已验证。

## 3. 17 项冻结决策对照表

顺序严格对应本次确定的 17 项议题。

| # | 冻结决策 | 设计位置 |
| --- | --- | --- |
| 1 | 最终 projection 是包含 record/page/title/rowIndex/显示属性的 unscheduled、point、range 判别联合；不新增持久实体。 | §4 |
| 2 | raw Date 仅在 projection 层读取和转换；共享 normalizer 是唯一日期解析入口；子组件只接收投影值。 | §4 |
| 3 | 所有时间使用统一逻辑 UTC instant 坐标；date-only 通过 display zone 的日历边界映射。 | §5 |
| 4 | ruler、grid、bar、point、Today、offscreen 与未来拖动共用可逆 transform。 | §6 |
| 5 | 冻结七种 scale 密度、单位、导航与未来 snap；selector 只改本实例临时 zoom，共享配置仅由未来显式设置保存。 | §7 |
| 6 | originMs 是 canvas content x=0 的 logical instant，由 center 与本地 canvas/scroll 计算；重置 origin 保留屏幕位置。 | §8、§9 |
| 7 | 使用有限宽度虚拟时间画布、原子 rebase 和真实原生水平滚动条；不创建第二垂直滚动容器。 | §9 |
| 8 | tick 按真实日历边界在有界窗口内生成，稳定 key 与 locale label / 数组位置无关。 | §10 |
| 9 | Today 按 display-zone 当地日初定位，独立、不可拦截指针，并在跨日及页面恢复时更新。 | §10 |
| 10 | projection/layout 明确表示 unscheduled、point、range 三种 item；保留 generic 顺序和真实日期语义。 | §4、§12 |
| 11 | all-day range 的右端视觉覆盖仅供 layout 使用，不改变存储日期或 P11.1 duration。 | §12 |
| 12 | Frozen Table 使用独立列投影，与时间行共用 row geometry。 | §4、§13 |
| 13 | row virtualization 使用现有 page scroll host、record ID 和单一 viewport controller。 | §11、§13 |
| 14 | tick DOM 单独设预算，只在 tick window 改变时重建。 | §10、§15 |
| 15 | config/records 由现有父层持有，像素和 viewport 状态仅为 Timeline local ephemeral state。 | §13 |
| 16 | 保留 P9 inline editor / identity fence；standalone route remount 问题作为独立 gate。 | §14 |
| 17 | P11.2A 仅实现 §16 列出的 read shell；bar、Frozen Table、mutation、dependency 留给后续阶段。 | §16 |

## 4. 只读 projection 与日期来源

本节所有类型都是 renderer 内部拟议接口，不是共享 domain / contract entity。只放在拟建的 `apps/web/src/components/editor/timeline/` 模块中；不向 `packages/domain` 或 `packages/contracts` 增加 Timeline 实体。

```ts
type TimelineTemporalPoint =
  | { kind: 'date-only'; date: string }
  | { kind: 'datetime'; instantMs: number; sourceTimeZone: string }

type TimelineProjectedProperty = {
  propertyId: string
  propertyType: DatabasePropertyType
  displayText: string
  token?: string
}

type TimelineItemProjectionBase = {
  recordId: string
  pageId: string
  title: string
  rowIndex: number
  visibleProperties: TimelineProjectedProperty[]
}

type TimelineItemProjection = TimelineItemProjectionBase & (
  | { kind: 'unscheduled'; start: null; end: null; reason: TimelineUnscheduledReason }
  | { kind: 'point'; start: TimelineTemporalPoint; end: null }
  | {
      kind: 'range'
      start: TimelineTemporalPoint
      end: TimelineTemporalPoint
      precision: 'date-only' | 'datetime'
      explicitZeroDuration: boolean
    }
)
```

`DatabasePropertyType` 复用现有 Domain 类型；拟建 `TimelineUnscheduledReason` 是下表 reason 的字符串联合。property 展示值由父层注入现有 `formatValue` 生成；Vue child 只接收 `displayText` / `token`，不消费或解析 raw `DatabasePropertyValue`。标题从 generic 响应中唯一 Title property 的 Page.title 读投影取得，不假设 Record 自带 title，也不复制到 Timeline record。`rowIndex` 只表示当前已加载 generic 顺序，不是持久身份。

拟建 `projection.ts` 从已加载的完整 records、properties、view config 生成投影。bar 列使用 View config 顶层 `view.config.visibleProperties` / `view.config.propertyOrder`；Frozen Table 使用 `options.timeline.frozenTable.visible` 开关，并以该对象的 `visibleProperties` / `propertyOrder` 独立投影列，始终保留 Title。二者共享同一属性值展示 projector，各自传入列配置；不复制 Date 解析，不在两套 Vue template 内处理 raw value。

后续 Frozen Table 接入还需扩展父层的展示数据准备：基线 `DatabaseNodeView.vue:321-343` 的 `resolveVisibleRelationTitles()` 只遍历顶层 `displayProperties`。应按 bar 与有效 Frozen 列的可见 Relation Property ID 联合集合去重，沿用原请求预算、标题缓存和 `relationTitleEpoch`，并随 records/列配置变化重算；虚拟化后优先当前共用 row window 的记录，合并批次而非每个 cell 发请求。标题结果更新只使涉及的展示投影失效，不能因滚动重新解析全量日期。此为 Frozen 阶段的明确接入点，P11.2A 不修改该路径。

raw value 只在 projection 边界通过 `normalizeDatabaseDateValue` 转换；renderer 不写正则、兼容解析器或第二套日期规则。

| dateSource 情况 | 只读 projection 结果 |
| --- | --- |
| 未配置 source | 所有 records 都是 `unscheduled`，reason=`unconfigured-source`。 |
| 单一 Date property | 使用 normalized start；有 end 就是 range，即便两端相等；无 end 就是 point。 |
| 独立 Start / End properties | 只分别使用两字段 normalized start，忽略各字段自身 end；Start 有值且 End 无值时为 point。 |
| Start 无值，End 有值或无值 | `unscheduled`，reason=`missing-start`。 |
| Start / End temporal kind 不同 | `unscheduled`，reason=`incompatible-kinds`。 |
| 同 kind 但 end 早于 start | `unscheduled`，reason=`end-before-start`；不得交换、裁剪或补默认值。 |
| 两个 datetime 的 sourceTimeZone 不同 | 以 UTC instant 比较和定位；不为每条记录另建时间轴。 |
| raw 非空但 normalizer 返回 null | `unscheduled`，reason=`invalid-date`。 |

无效的跨字段记录仍留在 records 集合中，并能在后续未排期展示中查看原值原因和打开记录。不得因此改动 Domain validator、generic records 查询或返回结构。

## 5. 时区与逻辑时间

renderer 使用以毫秒表示的线性 UTC instant 轴。datetime 直接使用 UTC instant。date-only 是 floating calendar date，映射到 `calendarBoundary(date, displayTimeZone)`，即该时区当天第一个有效 instant。不得使用 `getDatabaseDateStartInstant` 的 UTC 零点作为 all-day renderer 位置。P11.1 的排序、Filter 和 Formula 仍保持 UTC 语义。

若后续存在用户时区 preference，则使用该值；当前基线没有此字段，先从 `Intl.DateTimeFormat().resolvedOptions().timeZone` 读取，异常时明确回退 UTC。locale 影响 label，也在没有显式 week-start preference 时驱动 week start，从而影响 week / bi-week / quarter 周 tick boundary；locale 不改变 UTC instant 到 x 的绝对变换，也不改变持久日期值。数学日历始终使用固定 ISO / proleptic Gregorian 字段，不跟随 locale 改历法；避免 `Date.UTC` 对 0–99 年的旧式偏移。

`calendarBoundary` 是拟建于 `coordinates.ts` 的私有 helper，本轮不实现。用 Date 和 Intl 按 IANA 时区计算：午夜 gap 取当天第一个有效 instant；fold 取最早匹配 instant。若整日被跳过，则映射到下一真实边界，同时保留原 date 并提供 `calendarDaySkipped` 状态说明该日历日期在该时区不存在；不得把映射 instant 写回日期值。候选生成或搜索必须有界，通过 Intl parts 验证并缓存；不得解析本地化格式字符串，不加依赖，也不依赖全局 Temporal。后续 P11.2A 单测需覆盖普通日期、DST gap/fold、半小时偏移变化、整日跳过、0/99 年及闰年。

这些时区处理依赖 Intl 对 IANA 时区数据的支持，见 [ECMA-402 的 IANA 时区数据库条款](https://tc39.es/ecma402/#sec-use-of-the-iana-time-zone-database) 与 [MDN `Intl.DateTimeFormat` 的时区和 format parts 说明](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/DateTimeFormat)。

## 6. 统一坐标 transform

拟议快照结构：

```ts
type TimelineTransform = {
  originMs: number
  pxPerMs: number
  scrollLeft: number
  width: number
  scale: TimelineScaleId
  generation: number
  displayTimeZone: string
}
```

令 `rho = pxPerMs`：

- `timeToX(ms, t) = (ms - t.originMs) * rho`，返回 canvas content X。
- `xToTime(contentX, t) = t.originMs + contentX / rho`。
- `screenX = contentX - scrollLeft`；screen 逆变换先加 `scrollLeft`。

ruler、grid、bar、point、Today、offscreen 及未来 drag 都必须调用同一 engine，不得各自计算。已解析的 logical instant 应在浮点误差范围内按毫秒往返。date-only 保留 kind 和原 date；不得把 inverse 得到的 instant 持久化成日期。Today 指 display zone 当地今天的日初 boundary，不是 `Date.now()` 的移动时刻，也不是服务端 UTC 日期。

## 7. 七种 scale 与配置保存

拟议 scale 结构：

```ts
type TimelineScaleId = typeof TIMELINE_VIEW_SCALES[number] // 复用现有 Domain 常量
type TimelineCalendarUnit = 'minute' | 'hour' | 'day' | 'week' | 'month' | 'quarter' | 'year'
type TimelineUnitStep = { unit: TimelineCalendarUnit; amount: number }
type TimelineScale = {
  id: TimelineScaleId
  majorUnit: TimelineUnitStep
  minorUnit: TimelineUnitStep
  pxPerHour: number
  navigationUnit: TimelineUnitStep
  futureSnapUnit: TimelineUnitStep
}
```

密度按真实经过的一小时定义：`rho = pxPerHour / 3600000`。所以 DST 日的实际宽度随真实经过小时数变化；不得强行把每个当地日都画成 24 小时。

| Scale | Major | Minor | px/hour | 名义 24 小时宽度 | Navigation | Future snap |
| --- | --- | --- | ---: | ---: | --- | --- |
| Hour | day | hour | 48 | 1152 px | 1 calendar day | 15 minutes |
| Day | day | 6 hours | 16 | 384 px | 1 calendar day | 1 hour |
| Week | week | day | 4 | 96 px | 1 calendar week | 1 calendar day |
| Bi-week | week | day | 8/3 | 64 px | 2 calendar weeks | 1 calendar day |
| Month | month | day | 1.5 | 36 px | 1 calendar month | 1 calendar day |
| Quarter | quarter | week | 0.5 | 12 px | 3 calendar months | 1 calendar day |
| Year | year | month | 1/12 | 2 px | 1 calendar year | 1 calendar month |

表中未写数量的单位为 `amount: 1`；Day minor 为 `{ unit: 'hour', amount: 6 }`，Hour snap 为 `{ unit: 'minute', amount: 15 }`。date-only 的未来 snap 至少以一个 calendar day 为单位，不生成时间字段；拖动写入与精度转换仍属 P11.3，当前不实现。

scale definition 不保存中文 label。月份/日期/年份由 locale formatter 生成；季度由 locale 资源与 `Intl.NumberFormat` 组合。week start 先使用未来已有的显式 preference；当前没有此字段，feature-detect `Intl.Locale.getWeekInfo()` / `weekInfo`，不可用时使用本地 locale 周起始表（`zh-CN` 周一、`en-US` 周日，未知 locale 默认 ISO 周一）。不为此新增 View config。week/biweek 的边界不能以当前 render window 的首日为锚点。

现有 Domain 默认仍为 Month。`configuredScale` 是共享 `options.timeline.scale ?? 'month'`；`effectiveScale = localScaleOverride ?? configuredScale`。scale selector 只更新本 Timeline 实例的 `localScaleOverride`，不 PATCH View config、不请求 records，也不写 Records；未配置 scale 时仍从 month 开始。重载/remount 或 view tuple 变化会清掉本地 override，并按新 confirmed config 初始化。其他实例继续使用各自的 local zoom，但共享同一保存的 configuredScale。

`options.timeline.scale` 仍是已有共享持久配置字段。以后只有通用 View Settings 中显式保存 shared scale 时，才由父层 `saveViewConfig` 使用既有双 CAS、scope fence，并保留未知 outer/options 字段；不新增 endpoint。该显式保存沿用现有 service 通知与父层刷新行为。若收到刷新后的 confirmed config 且 scale 值确实改变，则清掉 local override、将新 configuredScale 应用为 effectiveScale，并保留当前 center instant；仅 config version 或 records 刷新、scale 值未变时，保留 local override 和 viewport，不重置位置。未来异步保存继续使用原 scope fence。月末导航 clamp 到目标月份最后一天；day/week/month/year 采用 display-zone 日历运算，只有 sub-day navigation unit 使用 elapsed 运算。

## 8. Viewport、origin 与导航

拟议 `TimelineViewportState` 明确记录窗口与时间范围：

```ts
type TimelineViewportState = {
  width: number
  scrollLeft: number
  originMs: number
  scale: TimelineScaleId
  visibleStartMs: number
  visibleEndMs: number
  overscanStartMs: number
  overscanEndMs: number
  generation: number
  displayTimeZone: string
}
```

设 `s=scrollLeft`、`W=width`、`rho=pxPerMs`：

```text
visibleStart = origin + s / rho
visibleEnd   = visibleStart + W / rho
overscan     = 左右各 0.5W
```

所有范围都使用同一 transform snapshot。Today 将 display-zone 当地日初置于中心。Previous/Next 从 center instant 的 display-zone calendar fields 加上配置的 navigationUnit（sub-day unit 才按 elapsed time），再用同一坐标 engine 计算 scroll offset；一天绝不固定等于 24 小时。

effectiveScale、resize、Frozen pane 宽度、display zone 或 locale/week-start 变化前先保存 center instant，更新密度/宽度/tick window 后恢复该中心。初始宽度为零时延后测量。load more / refresh 不重置水平 anchor。display zone 改变时保留 center instant，重新计算 all-day 位置、ticks 和 Today，不改日期值。视图 tuple 切换清除 local scale override 并按新 configuredScale 初始化；确认的共享 scale 值发生变化时清 override 但仍保留 center。仅同值 config version / records 刷新不得清 override 或重置 viewport。

## 9. 有界时间画布与原生滚动

视口宽 `W` 时，画布宽度为 `C=clamp(16W,16384,262144)` px，居中滚动位置为 `s0=(C-W)/2`，设置 origin 使 center instant 位于视口中心。只绘制 visible window 加 overscan，不为全画布跨度创建 DOM。

在 scroll 即将进入可滚动范围前后各 25% 时 rebase。令 `qLeft=origin+s/rho`，选 `s'=(C-W)/2`、`origin'=qLeft-s'/rho`，维持视觉不变：

```text
(q-origin')rho-s' = (q-origin)rho-s
```

用带 generation 的单一快照，并在同一 animation frame 更新 DOM scroll 与 origin。程序触发的 scroll 必须幂等，避免重复 navigation / rebase。大跳转直接围绕目标设置 origin，不生成巨大 `scrollLeft`。边界遵守 Domain 支持的 0000–9999 年；all-day exclusive visual end 可内部触及 10000 年边界，但不得写入 wire。原生 thumb 只表示本地窗口，不代表全部历史跨度。

`TimelineViewport` 是唯一水平滚动容器，使用真实 `overflow-x:auto/scroll`。底部原生 scrollbar 必须可拖动，并按操作系统策略显示；不以假 slider 替代，也不隐藏它。renderer 不建立嵌套垂直滚动、固定 max-height 或 document 级水平溢出；高度随完整 row 数自然扩展。ruler 是横向 scroller 外的同宽 mask sibling，使用同一 snapshot 的 screen 坐标，因此不会随左表滚动。保留 parent 的 `min-width:0`、max-width、containment 和 root clipping。

原生 `overflow-x` 与另一轴 overflow 的计算值会影响滚动上下文行为，因此需按 [MDN 的 `overflow-x` 轴行为说明](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/overflow-x) 检查 ruler / page host 结构。底部 scrollbar 不代表提供全局 sticky scrollbar。

## 10. Ruler、grid 与 Today

拟建纯函数 `ruler.ts` 生成如下 tick：

```ts
type TimelineTick = {
  key: string
  level: 'major' | 'minor'
  unit: TimelineCalendarUnit
  boundaryMs: number
  spanEndMs: number
  x: number
  width: number
  label: string
}
```

从 overscan 的日历 floor 开始，按真实日历边界迭代到结束；保留跨越左侧边界的 major period，避免 label 消失。所有 x 由统一 transform 计算。month/quarter/year 按真实日历迭代，不使用固定 30/365 天。

tick key 由 scale、level、unit、absolute instant 构成，不依赖数组下标。DST fold 的重复小时有不同 UTC key，并在 label 中包含 offset；gap 不生成虚构小时。兼容半小时等非整小时偏移变化。Day 的 6-hour minor tick 是当地墙上 00/06/12/18 边界，并按 gap/fold 规则处理。locale 变化更新 label 和 locale 驱动的 week start；后者可改变 week / bi-week / quarter 周边界与 tick window，但不改变 UTC instant 到 x 的绝对 transform、日期值或 Record 顺序。重建 formatter/tick window 时保留 center anchor。week start 变化不排序 records。major label 遵守 P11 §4.1 当前 visible period 规则。grid 引用 minor tick 位置，不创建 rows × ticks 的 DOM 矩阵。

Today 是独立红色 semantic-token layer，`pointer-events:none`，绘制顺序在 grid 后、bars 前，从 ruler 下沿贯穿全部 row 高度。定位到 display-zone 当天日初。通过内部 timer 在下一当地日界后加少量容差触发，单次等待最多一小时；在 `visibilitychange`、focus、`pageshow` 时重查，并用分钟 heartbeat 修正系统时间 / timezone 变化。生命周期切换时清理并重设 timer。不得依赖 server clock 或给每行安装 timer/listener。

## 11. Rows 与 row virtualization

每个已加载 generic record 都占一个 logical row，包含 unscheduled；保持 generic server 顺序，不增加客户端业务 filter、sort、group 或持久 row identity。拟议 row layout 为：

```ts
type TimelineRowLayout = {
  recordId: string
  pageId: string
  rowIndex: number
  top: number
  height: number
}
```

由 TimelineView 提供唯一的 48px row-height token 或测量值。未来 bar 默认 32px 高并垂直居中；header+ruler 总高共用 56px。标题换行不得改变行高。

未来 scheduled row 有时间 geometry；unscheduled row 没有时间 geometry，并在主 canvas 的原 row 显示明确的 No-date 原因和打开 Record 入口。主 rows 永远包含所有已加载 records，不移动或隐藏 unscheduled row。完整 read-bars 阶段必须提供 Unscheduled 导航索引：footer 的“未排期 n”展开后只列 record ID/title，定位到主 rows 中原 row 并 focus/open；可用已有 pageId 打开，不生成第二套完整记录行、不二次计数、不重排、不分页。以 `[A scheduled, B unscheduled, C scheduled]` 为例，主 rowIndex 为 `0/1/2`、top 为 `0/48/96`、总高 `144px`；B 仍在主 canvas row 1 显示 No-date / 原因 / open，无时间 geometry，Frozen Table 仍在同一 row 1。P11.2A 只提供所有已加载 records 的通用 title/open 入口与阶段提示，不判断日期分类；完整未排期语义随 read-bars 的 projection 实施。

后续 row virtualization 使用现有 `.document-wrap` page scroll host。根据一个 viewport rect 和 Timeline body offset，计算 `[first,last)`，上下各 overscan 五行并保留 focus row。Frozen Table 与主 canvas 使用同一 `[first,last)` virtual row window 和 spacer，保持页面总高及垂直滚动。DOM key、selection、hover 均按 record ID，不按 rowIndex。导航索引目标不在当前 virtual window 时，先滚动 page host 到目标 row，待该 row 挂载后再 focus/open；不另建导航列表行或垂直滚动容器。

## 12. 三种 item geometry 与 all-day 视觉范围

bar projection/layout 属于后续阶段，但在此冻结 geometry 契约，避免各 renderer 建立不同坐标。engine 提供 raw left/right content 坐标；按 viewport 求交并给出 clipped-left/right。已加载且完全离屏的记录可以显示左右 row-edge indicator，通过同一 engine 跳转；不得为尚未加载的记录造 indicator。

拟议 `TimelineItemGeometry`：

```ts
type TimelineItemGeometry = {
  recordId: string
  kind: 'point' | 'range'
  x: number
  width: number
  rowTop: number
  rowHeight: number
  clippedLeft: boolean
  clippedRight: boolean
  hitRect?: { x: number; width: number }
  zeroWidthMarker?: { width: 12; hitWidthDesktop: 24; hitWidthTouch: 44; focusable: true }
  offscreen?: 'left' | 'right'
  diagnostic?: 'calendar-day-skipped'
}
```

unscheduled 不产生 geometry。point 的真实 start x 不变、width 为零；使用 12px 可见 marker 和独立 hit target（桌面端 24px、触摸端 44px），不伪造 end。显式零长度 datetime range 也使用同一可见 marker、hit target、键盘 focus 和父层 Record open 入口；其投影仍为 `kind: 'range'`，保留原 end，width 仍为零，不把它改成 point。若整日跳过使日期映射后的视觉区间宽度为零，也使用该 marker 与可达入口，并带 `calendar-day-skipped` 诊断；保留原日期，不让 item 消失。

含显式 end 的 all-day range 视觉覆盖 `[start 当日日初, end 次日日初)`，使 end 日期也可见。保留 projection 的 raw end date 和 P11.1 `explicitZeroDuration`。相等 Date endpoint 视觉覆盖一个日历日，但仍是显式零 duration，与缺少 endpoint 不同。此 renderer-only `visualEndExclusive` 不改变持久语义；P11.1 未冻结 inclusive 视觉规则，本设计只冻结 renderer 表现。计算出的边界绝不能作为 Date end 写回。datetime end 不加 1ms 或 1 day。标题长短不能改变 range width，只用 ellipsis。

## 13. 组件、文件位置与状态归属

未来组件关系：

```text
DatabaseNodeView
└─ DatabaseTimelineView.vue             (editor/)
   ├─ TimelineHeader.vue                 (timeline/)
   ├─ FrozenTablePane.vue                 (后续阶段)
   └─ TimelineViewport.vue               (timeline/)
      ├─ TimelineRuler.vue                (同宽 mask sibling)
      └─ TimelineCanvas
         ├─ TimelineGrid.vue
         ├─ TimelineTodayLine.vue
         ├─ TimelineRow / TimelineBar     (后续阶段)
         └─ DependencyLayer                (后续阶段)
```

P11.2A 的 `DatabaseTimelineView.vue` 放在 `apps/web/src/components/editor/`；其它 Timeline Vue 组件及 composable 放在 `apps/web/src/components/editor/timeline/`。所有未来纯函数模块也放在 `apps/web/src/components/editor/timeline/`。这些路径均为拟新建文件，本基线中尚不存在。

root clipping 与 `.document-wrap` page scroll 意味着 CSS `position:sticky` 本身无法完成 page pin。`useTimelineViewport` adapter 在 P11.2A 独占 page-scroll / resize observation 和 RAF；将 hostVisibleTop、rulerNaturalTop、TimelineBottom 都换算到同一 page-host content Y，再在当前 root 内计算 `pinY=clamp(hostVisibleTop-rulerNaturalTop,0,TimelineBottom-rulerHeight-rulerNaturalTop)`。ruler 脱离该 Timeline 可见区域后停止悬浮；Frozen header 后续共用 pinY/headerHeight。无需改全局 `base.css`，只在现有 NodeView 下新增 renderer 编排与事件接线。

P11.2A 六个 Vue 文件：上级 editor 下的 `DatabaseTimelineView.vue`，以及 timeline 子目录下的 `TimelineHeader.vue`、`TimelineViewport.vue`、`TimelineRuler.vue`、`TimelineGrid.vue`、`TimelineTodayLine.vue`。timeline 子目录中的拟建模块为 `types.ts`、`coordinates.ts`、`scale.ts`、`ruler.ts`、`viewport.ts`、`useTimelineViewport.ts`。projection/layout/bar/Frozen/dependency 模块只在后续阶段建立。composable 是 scroll/resize/page listener 的唯一 owner。

| 状态 | 所有者 |
| --- | --- |
| `configuredScale`、dateSource、Frozen 可见开关和列顺序、dependency config、bar 列显示/顺序、filter、sort | 现有共享 `DatabaseViewConfig` |
| `localScaleOverride`、`effectiveScale = localScaleOverride ?? configuredScale` | Timeline 实例本地状态；selector 只改 override，不触发 PATCH 或 records GET |
| 已加载 records、loading、cursor、confirmed view、PATCH | 现有 `DatabaseNodeView` |
| auth、workspace、preferences、record opening、Record Host | 现有 product shell / services |
| scroll、width、origin、tick window、派生 geometry、display locale/zone、hover/selection、pending navigation、generation、timers/observers | Timeline local ephemeral state |
| Database pixels、本地持久化、oplog | 不属于 Timeline renderer |

Linked instances 各自拥有 viewport；相同 view ID 共享 config。打开记录时 child 通过现有父事件传出 `pageId`，不创建 Drawer，也不持有 Record editor。

## 14. Identity fence 与已知阻塞 B1

保留现有 `requestEpoch`、四元组 view identity、`viewIdentityEpoch`、editor block attrs 和 DOM view-ready fence。child 只读 ready snapshot；不自行 fetch records，也不在缺少 epoch 时回写。semantic-equal Page snapshot 不 remount editor。renderer branch 切换可卸载 child，但不能通过 key 重建父 Editor / NodeView。scroll、scale、records refresh 不 remount Timeline。

同一 child 被不同 Timeline view ID 复用时，tuple 变化会重置 controller epoch、local state 和 `localScaleOverride`，并按新 `configuredScale` 初始化。卸载时取消 observer、RAF、timer。每个 callback 捕获 instance epoch 与 scope generation，并检查 DOM 仍连接。A→B→A 的旧 observer 即使 tuple 再次相同也必须按 epoch 拒绝。Timeline selector 不保存 config；未来通用 View Settings 显式保存 shared scale 时，仍只能调用父层 scope-fenced `saveViewConfig`。child 销毁时 draft 仍由全局 Record Host 保留。

**B1 已知阻塞：**基线中的 `DatabasePageView.vue` 在 loading 时清空 selected view，以 view ID 作为 Editor key，并让 view switch 经 route query/watch 触发 reload。因此 standalone route 同库切换会重建 Editor/NodeView。不得声称 P9 standalone 生命周期已满足；本轮只记录，不修复。建议另立最小前置工作：同库 view change 时用 workspace/database 稳定 Editor key，并原地更新 node view attrs、保持 route。只删 key 不足以解决 loading `v-if` 销毁子树的问题。inline P11.2A 可继续，但 standalone 完整矩阵 PASS 需等 B1 修复，并覆盖 Editor DOM/component、NodeView、Record Drawer draft 与 ABA。此前 P9 PASS 不是本路径的新测试证据。

## 15. 性能目标

100/500/5000 条记录下，projection 为 `O(N × selectedProperties)`，仅在 records/schema/config 变化时计算；scroll 时不重新 normalize 日期。date-only boundary / geometry 按 record version、display zone、scale generation 缓存；boundary LRU 上限 1024。tick 只覆盖 visible/overscan，软预算 `T≤256`，窗口更宽时降低合适密度并保持有界迭代。

100 条可全部渲染；达到 200 条前必须有 row virtualization，作为 P11.2 read PASS 条件。500/5000 条时渲染 `V = viewportHeight / 48 + 10 个 overscan rows + focused row`；scroll 工作量 `O(V+T)`，metadata projection `O(N)`，不得 `O(N×T)`。优先 parent translate，每帧一个 RAF，仅在 tick window 跨 bucket 时重建 ticks。不为每个 bar/tick 建 listener。未来 dependency adjacency 为 `O(N+E)`，只处理可见/关联边并用 stable ID map，禁止 pairwise `N²`；未知的下一页 target 不合成记录。

Canvas 指逻辑 DOM 容器，不创建 `C × 全部 rows 高度` 的 bitmap。空 spacer 仅保留总布局尺寸；grid、Today、bars 与未来 dependency 的实际绘制限于共享 visible/overscan row window。不要把整个巨大 spacer 强制提升为 GPU texture；CSS transform 作用于有界绘制层。依赖 ID/邻接索引在数据变化时批量更新，每帧只处理窗口相关 edges，复杂度为 `O(V+T+E_visible)`，不扫描全部 graph。

本实例 local zoom 每次切换不产生网络请求，坐标及 visible rows 更新仍为 `O(V+T)`。未来显式保存共享 scale 会沿用现有 `DATABASE_UPDATED_EVENT` 通知及 `refreshLoadedWindow`：刷新目标为已加载记录数 N，按 25 条一页顺序 GET，成本为 `O(N/25)` 次 records 请求；5000 条就是 200 次 GET，且受现有 cursor / View-version / request-epoch fence 约束。本设计不宣称已优化此刷新路径，不抑制既有 service 通知，也不重构 loader/cursor。P11.2.0 不跑 benchmark；60Hz 下 scroll computation ≤4ms 是尚未测量的后续目标。

## 16. P11.2A 精确接续范围

P11.2A 仅实现 read shell 和坐标 engine。拟建文件如下：

- Vue：`apps/web/src/components/editor/DatabaseTimelineView.vue`；`apps/web/src/components/editor/timeline/TimelineHeader.vue`、`TimelineViewport.vue`、`TimelineRuler.vue`、`TimelineGrid.vue`、`TimelineTodayLine.vue`。
- 纯函数模块：`apps/web/src/components/editor/timeline/types.ts`、`coordinates.ts`、`scale.ts`、`ruler.ts`、`viewport.ts`。
- lifecycle adapter：`apps/web/src/components/editor/timeline/useTimelineViewport.ts`。
- 既有接入点：替换 `DatabaseNodeView.vue` 的 placeholder routing；records/loading/cursor/footer、view switching 和 config save 继续由父层持有。

实现 shell、coordinates/scale/ruler/grid、原生底部横向滚动、Today 与导航。selector 只改变本实例 `localScaleOverride` / `effectiveScale`，初始值为 `options.timeline.scale ?? 'month'`；每次切换均为 0 HTTP、0 PATCH、0 records GET。A 不新建 shared scale 保存 UI，也不改 `saveViewConfig`。P11.2A canvas 使用固定最小高度和 empty state，不画 Record bars 或 Frozen Table；不加日期 source projection、drag/resize、dependency、新建按钮、schema/API/version。读取现有 `options.timeline`。测试可通过现有 API 和 fixture 创建 Timeline View，不加创建 UI。

A 提供所有已加载 records 的通用只读 title/open 入口，并明确提示本阶段尚未绘制记录时间条；只使用父层 Page.title 展示与既有 open event，不在 A 识别 scheduled / unscheduled，也不读取 raw Date。这不是 List renderer fallback。日期分类、主 canvas No-date 行与未排期导航索引随后续 `projection.ts` / read-bars 实施，父层 pagination 保持原行为。

### 后续验收目标（P11.2.0 未运行）

纯数学用既有 Playwright test runner 的 Node-side test，放在 `apps/web/tests/timeline-coordinate.spec.ts`，无需启动浏览器；本仓库没有 Vitest，不新增测试依赖。browser shell cases 使用现有 Playwright runner 和 `apps/web/tests/product-database.spec.ts`。覆盖七种 scale、日历边界/月末/闰年/DST/day timer、Today/Prev/Next center 与 resize anchor、rebase 视觉不变量、真实水平滚动条、无 document 横溢出、无内层垂直滚动、Phone/Light/Dark、延迟测量、stale RAF/observer ABA 和清理、P9 inline 四 view 的 draft/snapshot 矩阵，以及 `zh-CN` / `en-US` 切换后的 major/minor week boundary 和 center anchor 保留。standalone 完整矩阵受 B1 gate 限制。这些只是后续验收目标，不是当前结果。本轮实际验证见 §19。

## 17. 风险与后续边界

| 风险 / 边界 | 处理方式 |
| --- | --- |
| B1 standalone route remount | 另列前置 gate；此前 P9 PASS 不覆盖该问题。 |
| IANA 非常规日期转换和 proleptic year | resolver 有界并缓存，执行指定边界用例；注意不同 runtime 的 IANA 数据可能有差异。 |
| locale week-start 变化会改变 week / bi-week / quarter tick boundary | 重建 formatter / tick window，按 `zh-CN`、`en-US` 和未知 locale fallback 验证，同时保留 center anchor 与 UTC instant 坐标。 |
| Unschedule 导航与 virtual row 生命周期交错 | 导航先定位 page host，等待目标 row 挂载后再 focus/open；Frozen Table 与主 canvas 共用同一 row window。 |
| shared scale 显式保存触发完整已加载窗口 refresh | scale selector 保持 local-only；未来共享设置接受既有 `O(N/25)` GET、cursor 和 version fence 成本，不抑制通知或另造刷新策略。 |
| 原生 scrollbar 与 overlay scrollbar 外观不同 | 保留原生行为，在目标操作系统核验；不伪造或隐藏。 |
| P11.1 未冻结手动 row order/grouping | 保持 generic server order，不设计新排序模型。 |
| Linked-in-page database 当前仅支持 Table | 保持 Table-only，不顺手放开 Linked Timeline。 |
| 历史 B/C/D 报告被误认为 renderer 测试 | 明确标记历史证据；本文不声称 renderer 已验证。 |

## 18. 外部依据

外部资料只支持 Intl / IANA 与 overflow 轴行为等平台事实；项目代码与测试仍是 Eotion 行为证据。

- [ECMA-402：IANA 时区数据库的使用](https://tc39.es/ecma402/#sec-use-of-the-iana-time-zone-database)
- [MDN：`Intl.DateTimeFormat` 的显式时区与 format parts](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/DateTimeFormat)
- [MDN：`overflow-x` 及轴向计算行为](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/overflow-x)

## 19. P11.2.0 验证与停止点

日期：2026-10-13。本轮只变更六份 Markdown：本架构、P11 产品标准、文档地图、context index、current-task 与 handoff。基线 HEAD 含 P11.1D PASS，开始时工作树干净；Timeline routing 仍为明确占位，未创建文中拟实施 renderer 文件。

| 本轮检查 | 结果与边界 |
| --- | --- |
| 17 项决策与真实源码交叉复核 | 全部冻结；独立 reviewer 最终 0 个确定文档 blocker。B1 是后续产品 gate，未修复。 |
| 文档范围、相对链接、UTF-8 strict / 无 BOM / CRLF、`git diff --check` | 通过；只有允许的六份文档，没有产品实现 diff。 |
| 临时给定 instant / 公式验算 | 62 checks PASS；七种 density 的 inverse、rebase、center；给定 New York 23/25h、Lord Howe 23.5h、重复小时和 Samoa 整日跳过样例。 |

验算在仓库外临时目录执行：`node C:/Users/31250/AppData/Local/Temp/eotion-p1120-604cc99c231949ad915b085346732f75/coordinate-design-check.cjs`。环境为 Node 24.21.0、ICU 78.3、tzdata 2026c；同目录 `coordinate-design-check.log` 保留结果。该脚本验证已给定边界与数学不变量，**未实现或验证 `calendarBoundary`**，也不是 renderer / browser scroll / benchmark 验收。

本轮未执行产品测试、typecheck/build、Mongo、E2E/Visual、真机或 P11 Final Acceptance；无产品代码变更，不能沿用历史 P9/P11.1 验收来宣称 renderer PASS。异常时区解析、真实滚动/rebase/page pin、异步 observer/ABA 及性能实测由 P11.2A 和后续 renderer 阶段完成。

结论为 **P11.2.0 Architecture PASS**，不代表 P11.2 Read Renderer PASS。本轮提交后停止，只有后续明确任务才执行 §16 的 P11.2A。

## 20. P11.2A 实施记录

2026-10-13，**P11.2A 范围验收 PASS**。P11.2A 已按上述冻结设计建立六个 Vue 组件和纯函数模块，
DatabaseNodeView 的 Timeline 分支进入真实 Shell，Table 路由也显式判断 view.type。
实际 API、浏览器接线、测试结果和停止边界见
[P11.2A 验证](../verification/p11-2a-timeline-shell.md)。完整相关回归167/172通过；两项基线可复现失败，
另外三项复跑通过，尚未定性完整运行时序。完整边界以验证页为准，不代表整个P11或Product全绿。

- coordinates/scale/ruler/viewport 为纯函数；共享 Date validator 通过 Domain date 子路径读取，
  scale 常量通过 database 子路径读取。没有 raw Record 日期解析或新的共享领域实体。
- date-only 使用显示时区日初，datetime 保持 UTC instant。轴端点包含合法 UTC instant 与
  显示时区年 0000–9999 的 date-only 日界并集；年 10000 只可作内部 exclusive 边界。
- local zoom 不保存、不请求 records；有限 tick bucket、统一 transform 和 native horizontal
  scroller 为后续 bars 保留空间。浏览器原生像素取整通过同一纯坐标快照校准，保留语义中心。
- §14 的 standalone B1 已按最小前置边界修复：稳定 workspace/database Editor key，
  已有文档不被 loading 子树销毁，受保护 synthetic Database reference 原地更新 viewId；
  protected document 仍拒绝结构/正文修改。P9 scope fence 与全局 Record Host 保留。
- 已加载 View 重新联网复用原有 generic window refresh，避免 loading 卸载 renderer；
  首次/失败加载仍使用原 load path。不增加 Timeline 专用 loader。
- 未实现 projection/layout/bar/Frozen/dependency/mutation、Linked Timeline 创建或 schema/API/MCP/版本变更。
  本轮完成后停止，P11.2B 需用户另行启动。

## 21. P11.2B 只读时间条实施

2026-10-13，按用户独立启动的 P11.2B 严格范围实施。基线 `03138bc`，
纯逻辑提交 `47d675c`，只读接线与 Web 回归提交 `71e72f9`。
实际结果与限制见 [P11.2B 验证](../verification/p11-2b-read-only-bars.md)。
本轮只代表 P11.2B 范围，不代表完整 P11.2 read 或 P11 FINAL PASS。

- `projection.ts` 使用完整 raw Date normalizer，单 Date 消费 start/end，独立 Start/End
  消费各自 normalized start；显示属性和 Title 复用 generic response 与父 formatter。
  投影保留原顺序、record/page identity、range 的 precision/explicitZeroDuration，以及
  未排期 reason。Renderer 不读取 raw Date，也不改变 Records。
- `geometry.ts` 批量解析投影的 temporal point；date-only 复用已有日界 resolver。
  `nextCalendarBoundary` 是同一 resolver 的薄 helper，支持原 date 的次日日初与内部
  year10000 exclusive 边界，不复制时区规则。datetime 使用精确 instant/end。
- `layout.ts` 集中生成 content X 的 raw/cropped geometry、48px 行和 32px bar。
  200 条起只计算 page-host 可见窗口、上下五行 overscan 与单独焦点行；焦点按 record ID
  保存并映射当前 rowIndex，完整 generic rows 的高度仍由 spacer 保持。
- `DatabaseTimelineView` 分别缓存 projection、temporal map、窗口 geometry；scroll/zoom
  不重解析全部 Date。`TimelineBar` 只消费 geometry/title/display/visual state。
  point/零宽 range 以 12px marker 表示，desktop/touch 命中区域为 24/44px，不补 end。
- `TimelineViewport` 复用唯一 native scroller，Grid/Today 绘制仅覆盖当前行窗口；
  未排期原 row 无时间 geometry，保留标题/原因/打开，透明背景不遮住 Today 红线。
  footer 索引由同一 controller 定位原 row、等待挂载、focus，再走既有 Record Host。
  epoch/scope/DOM guard 拒绝过期导航；原生 details 按 scope 重建并拒绝旧节点 toggle。
- selection 来自同 workspace/database 的 singleton Record Host pageId，点击仍由父层
  openRecordPage 处理。generic loader/cursor/P9 fence、Editor 与 Drawer draft 归属保持。

本轮未实现 dependency、drag/resize、Date mutation、Record edit shortcut、auto shift、
Calendar 或配置 UI。完全离屏 scheduled row 保留及 offscreen geometry 已建立，方向
indicator/jump 留给后续完整 read parity；本轮不建立 Timeline 专属打开逻辑。Frozen Table
后由 P11.2C 接续，见 §22。

## 22. P11.2C Frozen Table 实施记录

2026-10-13，按独立授权实施 P11.2C，**Frozen Table 范围验收 PASS**；这不代表完整 Product suite 全绿、P11.2 Read 完成或 P11 Final PASS。正式验收入口为[P11.2C Frozen Table](../verification/p11-2c-frozen-table.md)。版本保持 `0.0.1`，P11 目标仍为 `0.0.3`。

- `timeline/frozenTable.ts` 的 `resolveFrozenTableProperties(properties, config)` 仅解析 Timeline 内嵌的 Frozen Table 配置；只有 `visible === true` 才显示。列 ID 缺省/null 使用 schema 默认顺序，部分 order 采用稳定去重并忽略缺失 ID，Title 始终保留。不改写配置或未知 outer options。
- `projectFrozenTableDisplay(records, columns, formatValue)` 生成非 Title 的 recordId → propertyId → displayText 投影；Title 从现有 Timeline item 的 `title` 读取。格式化继续复用 DatabaseNodeView 注入的 formatter。
- `DatabaseTimelineView` 的 Frozen 与 Timeline 组件消费同一 `rowGeometry`、同一 row window / focus island 和同一 body height；Frozen 不创建第二 row model、loader 或行测量。
- `FrozenTablePane` 是 `TimelineViewport` 的水平 sibling。水平滚动仍由 TimelineViewport 唯一持有，垂直滚动仍由现有 `.document-wrap` / page host 持有。两个 header 共用 `TIMELINE_HEADER_HEIGHT`（56px）与 `pinY`，Timeline ruler 仍沿用现有 viewport anchor。
- Host `selectedPageId` 负责选择态，实例内 record ID hover 同步两侧；focus island 可跨两侧保留。scope 变化和虚拟行移除会清理相应状态。Title button 复用现有 `openRecord`。
- Frozen row 的 `v-memo` 只依赖 item、top/height、当前 record display map、该行 selected/hovered boolean。可见 Relation 属性由 NodeView 与 Timeline 共用窗口信号并复用既有 formatter/cache/budget；当前窗口优先、缺失缓存按窗口补取、scope fence 与 pending request single-instance 去重已通过本轮定向验收。正常分页仍执行既有强制标题刷新。
- 根容器使用同一 Web 主 UI 的 container query：700px 及以下隐藏非 Title 列并把 Title 前置；Frozen 桌面宽度约 32%，上限 480px 与根宽 45%，窄屏不超过 `min(120px, 40%)`，Timeline 保持可收缩并继续横滚。

不包含列编辑、Date/Property mutation、drag/resize、dependency、Timeline 设置 UI 或独立 Frozen View；不改 API、schema、Domain/wire、MCP、sync、版本、依赖、coordinate/projection 算法或 row model。P11.2C 完成后停止；P11.2D 需要另行明确授权和范围。此 Scope PASS 不等同 P11 Final PASS。

## 23. P11.2D 核心 Read 最终验收

2026-10-13，P11.2D按明确授权完成Acceptance，**核心Read PASS**；正式矩阵、fresh失败基线
对照、截图/样本与限制见[P11.2D Read Acceptance](../verification/p11-2d-timeline-read-acceptance.md)。
本轮只补测试与文档，不改上述坐标、投影、组件或领域契约。完成Shell/Coordinates/七Scale/
Ruler/Grid/Today/Read-only bars/Frozen八项，保generic records、Host identity与scroll ownership。
完全离屏scheduled indicator/jump仍是未实现parity；mutation/dependency/Calendar/Chart均不包含。
核心PASS不表示全Notion parity、全Product或P11 Final完成；完成后停止，不进入P11.3。

## 24. P11.3A Drag Mutation Foundation

P11.3A 在已有 renderer 上增加整体 Bar move，Timeline 不建立独立编辑或持久化系统。
唯一链路：`TimelineBar → useTimelineBarDrag → DatabaseNodeView adapter →
updateProductDatabaseRecordCell → generic cell HTTP → DatabaseService transaction / CAS`。

- 单 Date Property 的 date-only/datetime point/range 可拖动。独立 Start/End 两列经用户确认
  暂保只读：现有 cell transaction 一次只写一列，不能用两个请求维持原子区间不变量。
- `mutation.ts` 用既有 `timeToX/xToTime`、日界 resolver 生成 temporal offset 并平移原 wire
  value。date-only 最近有效日界吸附、两端 Gregorian 日历日差保持；datetime 整数毫秒
  instant 差保持，timezone 不改变。不可把 renderer-only inclusive 右界写回 end。
- 每个 Bar 的 controller 持有自己的 armed/dragging/saving preview。pointermove 仅重新投影
  当前 item 并复用 temporal resolver / 单 item layout，不回写 records、不刷新全部 row、不发请求。
  parent caches 仍只随 generic records/schema/config/viewport 更新。
- pointerdown 冻结 raw Date、Record/Database version 和 scope；pointerup 发出单 command。
  adapter 再核对 scope/epoch、当前 source/schema/version，复用既有 service 串行化、在线检查、
  双 CAS、transaction 和 generic refresh。drag 不持有 Host/Drawer/Editor。
- 拖动后的合成 click 被抑制；普通 click 仍走既有 openRecord。取消、offline、viewport 改变、
  scope/version 改变和卸载必须丢弃 active preview，旧 callback 不可污染新 scope。
- release 到 server confirm 期间允许当前 Bar optimistic preview。409 回到 canonical Record
  并提示；4xx 拒绝回退，5xx/transport 不确定结果刷新核对，无重试或本地持久队列。成功响应
  与 generic refresh 继续保 loaded window、Record Host draft 和组件 identity。

正式验收见 [P11.3A](../verification/p11-3a-timeline-drag.md)。本轮不实现 handles/resize、
dependency/auto shift、multi/bulk、undo/offline、Calendar、settings 或独立 Start/End 原子 API；
P11.3B 接续需明确范围与授权。

## 25. P11.3B Resize Range Mutation

Resize 沿用 §24 的 controller/transient state、command、NodeView adapter 与 generic single-cell
transaction，不新增服务端入口。Range 的 start/end handle 分别只改一个端点；point 仅通过
end handle 向右升级 range，legacy string 必要时升级 Date object。独立 Start/End 两列仍只读。

共享 resize helper 将原端点 geometry anchor + pointer delta 经 `timeToX/xToTime` 转成 target，
消费 scale `futureSnapUnit`，以原端点为相对吸附锚点；date-only 最细 day。所有 preview 与提交
先 clamp 到 `start <= end`。All-day end 使用 `inclusive date ↔ exclusive visual calendar boundary`
转换，不用24小时做日期回退。Datetime 保 canonical UTC、timezone、另一端与毫秒精度。

Handle 与主体使用独立 button/事件，不嵌套 button；共用 active session、preview geometry、
单次 release 与 CAS/refresh/cancel。Pointermove 不改 parent projection/temporal map/Frozen rows，
不生成 ruler ticks或HTTP请求。事件、日期与验证契约见
[P11 主计划](../p11-timeline.md#p113b-resize-range-mutation-契约) 与
[P11.3B 验收](../verification/p11-3b-timeline-resize.md)。P11.3C 需后续独立启动。

## 26. P11.3C Mutation UX + Conflict

P11.3C 不新增 mutation 能力，而是把 P11.3A/B 的 drag/resize 收敛为稳定的产品行为与单一状态机。

模块与归属：

- `timeline/interaction.ts`（新，纯逻辑 + 一个 reactive busy Set）
  - `TimelineInteractionPhase`、`createTimelineInteractionLedger()`：`idle → previewing → pending → idle`，
    单调 token 作为所有 completion 的 fence；`cancelPreview()` vs `cancel()` 语义分离。
  - `TIMELINE_DRAG_THRESHOLD_PX = 4`：move/resize 共用。
  - `beginTimelineDateMutation` / `endTimelineDateMutation` / `isTimelineDateMutationBusy`：
    view 级 `recordId + propertyId` fence（`reactive(new Set())`）。
- `timeline/focus.ts`（新）：`captureTimelineBarFocus` / `restoreTimelineBarFocus` 捕获原 bar anchor DOM
  identity；仅在焦点丢失或落到 `body` 时恢复。原 handle 消失时只在同 anchor 找同 record 的当前 control
  或回退到 bar；其他非 `body` 焦点（包括另一 bar、drawer/Frozen/Table）不抢。恢复在 `nextTick` 后再核验
  interaction token 与 scope。
- `timeline/useTimelineBarDrag.ts`：ledger 接线、`phase` / `mutationBusy` / `pendingMode` 暴露、
  pointercancel / lostpointercapture / window blur / visibilitychange / viewport 变化取消、
  preview 期间 window 级 Escape（`AbortController` 生命周期）、`settleWithoutCommit`。
- `timeline/TimelineBar.vue`：零尺寸 `eotion-timeline-bar-anchor`，bar button 与两个 resize handle
  是绝对定位兄弟节点（handle 不再嵌套于 bar，点击不会穿透到 Record open）；pending 视觉
  （opacity / progress / `aria-busy` / `data-saving` / `role="status"`）；handle 可 focus。保存期间
  `writable=false` 使 `draggable=false`，resize handles 暂时卸载；bar 仍显示 pending 状态并可打开 Record。
- `timeline/TimelineViewport.vue`：新增 `recordMutationBusyById` 透传。
- `DatabaseTimelineView.vue`：`pendingTimelineMutations` reactive map、`prepareTimelineDrag` 的
  record fence、`commitTimelineDrag` 持有 pending、`recordMutationBusyById` computed。
- `DatabaseNodeView.vue`：`moveTimelineRecord` 外层加 `beginTimelineDateMutation` /
  `endTimelineDateMutation`，wire-shape-aware no-op guard，409 / known-failure / unknown 文案收口。

Pointer capture 结束时可能出现后续 click；抑制标记必须在释放 capture 前置位，并保留到对应 click 被消费，
避免真实 drag 后的 click 打开 Record。不假定释放 capture 会同步派发 click。

已知行为/边界：

- `切换视图` 按钮 `:disabled="viewBusy"`（含 `savingCell`）→ pending 期间切 View 在 UI 层
  fail closed；跨 View stale callback 由 ledger token 覆盖。
- 无移动（或低于 threshold）的 bar body 手势是既有 click 语义，会打开 Record；resize handle
  手势被显式抑制，不 fall through。
- 超过 threshold 的真实 drag 在最终日期与 canonical 相等时仍抑制本次 release click；
  no-op 只决定不提交 PATCH，不能将已发生的 drag 重新解释为 Record click。
- preview 期间 bar 持有 pointer capture，无法用真实鼠标点击 toolbar；这是浏览器约束。

证据与未执行项见 [P11.3C 验证](../verification/p11-3c-mutation-ux-conflict.md)。P11.3D 需独立授权。

## 27. P11.3D 最终验收与当前边界

2026-10-16，按独立授权对已有 single Date mutation 做最终验收，**P11.3D PASS / P11.3 COMPLETE**；实际结果见
[P11.3D Final Acceptance](../verification/p11-3d-timeline-mutation-final.md)。生产写入路径仍为
Bar/Handle → shared interaction controller → temporal command → Timeline/View adapters
→ existing generic Record Cell API → Database + Record CAS / Mongo transaction → canonical refresh。
不新增 endpoint、collection、mutation queue 或 pointermove 写入。

本轮正式冻结 **Database mutation pending 时不允许用户切换 View**：`viewBusy` 保留
`savingCell`，View switcher disabled / fail closed；完成后恢复。不为该流程放宽 generic busy guard。
preview 的 scope/unmount 变化必须 cancel；pending unmount 的旧 callback 仍受 token、epoch、DOM
root 与 scope fence 保护。真实 UI、同 document route 生命周期与 logic fence 证据在验收页分别说明。

独立 Start/End 两 Property 继续 readable/openable 且手动 mutation read-only；P11.3D 验收时 generic Record API
没有 atomic multi-cell mutation，不使用 sequential PATCH workaround。Dependency、auto shift、
bulk、Undo/Redo、offline queue、Calendar 与视觉 polish 不属于本轮；P11.4 未开始。

## 28. P11.4A Dependency Read Model + Lines

数据路径为已授权的当前 View canonical records / schema / `options.timeline.dependency`
→ `timeline/dependency.ts` 纯投影 → 共享 Bar geometry → 纯 routing →
`TimelineDependencyLayer` / `TimelineDependencyPath`。不新增 domain entity、API、Mongo schema、
持久 ID 或业务数据请求。P11.1D Property Lifecycle Fence 仍负责服务端硬引用；renderer 只对
当前已授权 schema 防御校验，不绕过它请求隐藏属性或记录。

`projectTimelineDependencies` 独立验证冻结 Timeline options 与所引用 Property 的存在、
当前 Database 归属、原生 Relation 类型和 self target。只读取实际 Relation `string[]` wire
shape；空值/坏值、重复链接、self link、当前结果中不存在的 target 跳过。不会猜测另一个属性。
`depends-on` 是 target predecessor → owner successor；`blocks` 是 owner → target。
edge ID 由 `[propertyId, predecessorRecordId, successorRecordId]` 的 JSON tuple 派生，按 ID
确定排序。只保留 Record IDs，不复制 Date，也不保存 unresolved edge。

未加载、被 filter 排除、已删除或不可见的 target 采用同一种 fail-closed 结果：过滤该边，
不补 GET、不扩大分页、不创建假 Bar。后续正常加载分页或 View refresh 后重新投影。
shiftMode / avoidWeekends 仍由原配置保存与校验，本轮不执行。

`dependencyGeometryById` 对 scheduled items 调用既有 `layoutTimelineItem`，与 Bar 消费同一
temporal map / transform / row index。无 dependency 时不建立额外的全量 geometry。
range 出端使用 rawX + rawWidth（包含原有 all-day inclusive visual end），入端 rawX；
point / zero-width marker 使用 rawX center；Y 使用 top + height / 2。
不重复日期解析或 Date→pixel 数学，不读取 DOM bounding box。raw anchor 超出 bounded canvas
时不画完整边；仅在 viewport 外但仍在 canvas 内时保留，并由 SVG 裁剪。

routing 为确定的 orthogonal path：forward 使用中间折点；backward / 很近的端点先水平退出，
通过共享 row geometry 推导的行间隙绕行，再水平进入 successor。支持 predecessor 在上/下、
远近行及不同 Record 的极近端点，不为排期倒序改写 Date。

分层与性能：

- projected edges 只依赖 canonical records / schema / config。
- canonical geometry map 按共享 transform 生成；row-window 选择两端可解析且 row span 与窗口
  相交的边（含两端窗外但跨越窗口），并保留 isolated focused row 关联边。
- SVG 仅创建 window-relevant edge 组件；不做 edges × DOM rows 扫描。投影为 O(N + links)
  加稳定排序，canonical layout O(N)，window selection O(E)；路径不引入 DOM measurement。
- `TimelineBar` 将现有 controller 最终 preview geometry 只读发给 Viewport，稳定的 reactive
  Map 按 record key 存储 override。每个 Path computed 只读取自身两个 key，pointermove 只
  使 incident edges 失效；不 clone Map、不重解析 Relation、不重建 Record projection。
- preview 清除、取消、卸载或 scope 切换时删除 override；pending 沿用原 Bar preview，确认后
  由 generic canonical refresh 更新。没有第二套 mutation / 日期状态机。
- Grid < Dependency SVG < Today < Bars < Handles / Preview。SVG、path 不可 focus、
  `pointer-events:none`，箭头 marker 使用每个实例唯一 ID；线色复用现有 text-secondary token。
  箭尖沿末段提前 10px 显示，避免被 point 菱形遮住；path 本身仍到达原始共享 anchor。

验收与限制见 [P11.4A](../verification/p11-4a-dependency-read-lines.md)。本轮到 A 为止；
P11.4B Editing、P11.4C Auto Shift、P11.4D Final Acceptance 都需独立后续任务。

## 29. P11.4B Dependency Editing

P11.4B 在 §28 canonical renderer 上增加可逆 Relation editing；不新增实体/API，不移动日期。
gesture source 永远是 predecessor，target 永远是 successor；`dependencyMutation.ts` 的
`resolveDependencyRelationMutation` 统一 create/delete mapping：depends-on 修改 successor Cell
中的 predecessor ID；blocks 修改 predecessor Cell 中的 successor ID。create stable dedupe
append，delete filter 指定 ID，保留其余顺序；一次完整 generic Relation Cell PATCH，无第二侧写入。

`captureTimelineDependency` 在 pointerdown 捕获 scope/user/workspace/database/view/block、
epoch/DOM root、property version、direction/config fingerprint、Database version 和所有 loaded
Record 的 Relation raw value/Record version。owner 在命中 target 后用快照映射，不临时取新版本。
`mutateTimelineDependency` 在提交前校验 identity/config/property/self target/原值与双版本，
复用 `savingCell` 和 `updateProductDatabaseRecordCell`；existing validator/CAS/事务仍是服务端权威。
已提交请求的实例归属独立于编辑器是否临时可写，防止只读切换跳过 canonical refresh 或滞留 busy。

`useTimelineDependencyInteraction` 只保存 transient linking pointer/candidate、pending 与 selected
stable edge ID。canonical projection 是唯一永久 graph；self/semantic duplicate 0 PATCH，cycle允许。
`Cycle scheduling semantics deferred to P11.4C Auto Shift Policies.`
只命中当前 rendered Bar；filtered/unloaded/unscheduled 目标没有额外 GET、picker 或自动加载。

preview 与 canonical 复用 `layoutTimelineDependency` 和 Bar raw anchors；pointermove 不重新读取
Relation、不重投影 graph。创建首条边时，有效 dependency config 也建立共享 geometry Map。
visual SVG 保持 Grid < Dependency < Today < Bar；透明宽 stroke hit layer 高于空白行且低于 Bar /
resize/connector，visual path 不进入 Tab。独立 keyboard control 管理 selection 和 delete，label
使用 record title；首次点击管理仅选择，后续显式删除或 Delete/Backspace 执行 mutation。

active linking 与 Date drag/resize 互斥。Escape/cancel/lostcapture/blur/hidden/unmount、scope/
config/viewport change/offline 清理 capture 与 preview，0 PATCH；offline 不允许开始 create/delete。
409 refresh canonical、不 retry；确定性4xx清 pending、保留 canonical；网络/5xx读取 canonical
membership 确认 create/delete结果，读取失败 staleReadonly、只允许重新读取，不重发 mutation。
selection 在 edge 消失或 scope change时清空；scope ABA不复用旧选择。

验收、100/500观察、真实Mongo、视觉与未运行项见
[P11.4B](../verification/p11-4b-dependency-editing.md)。C 的独立实施见下节；当前
**P11.4C COMPLETE / PASS（Scope）**，D 仍未开始。

## 30. P11.4C Auto Shift Policies

状态：**P11.4C COMPLETE / PASS（Scope）**。验收和接续证据见
[P11.4C 验收记录](../verification/p11-4c-auto-shift-policies.md) 与
[2026-10-19 接续证据](../verification/evidence/p11-4c-resume-20261019.json)。

active auto shift 的 Date drag/resize 和 dependency create 在 release 时提交一次 generic
Database `cell-mutations`，仅传 root Cell intent 与 pointerdown 捕获的 Database/Record/View
versions；不由 Web planning，也不先保存 root 再 cascade。no_auto_shift / dependency delete
继续原单 Cell 路径；pointermove 仍仅 root Bar / linking line 局部预览，0 HTTP。

server 在同一 Mongo snapshot transaction 中验证 canonical View/Properties，读取本库完整
有界 records，不应用 View filter/window，映射 Relation 成 predecessor→successor，再调用纯
domain `planDatabaseSchedule`。多 predecessor（含 affected set 外 incoming）取最大约束，
stable topological evaluation 让 diamond 只计划一次；Date patches 与 Relation/root 合并，
一个 Record 一次 CAS，Database 整批一次 bump，任何失败全回滚。

Scheduling interval 不使用 UI width/display timezone：datetime point 为精确 instant，range
finish 为 end；date-only point finish=start，显式 date-only range finish 为 inclusive end
次日。separate Start/End 只读各 Cell normalized start；缺 End 是 point，Start Cell 内部 end
不当作 finish。auto shift 可双 Cell 同事务；手动 Start/End 继续只读。

overlap 仅向未来消除重叠；keep-gap 保留每边 mutation 前的非负间隔；no_auto_shift 不级联。
avoidWeekends 只调整需要移动的 successor start 至周一，datetime 使用自身 IANA 时区并保持
local wall clock/毫秒；range 保 elapsed duration。unscheduled 节点停止路径、不造 Date；
affected scheduled cycle fail closed，无关 cycle 不阻塞。

scan 上限现有 10,000 records，affected 最多 500 records / 10,000 约束边（含实际参与的
外部 incoming；不参与 root 排期的外部 incoming 除外），最终最多 1,000 changed Cells。
超限拒绝而非截断。unknown batch 只依据 mutationId receipt committed/not_committed/uncertain，
不得用 loaded root 日期/membership 猜整批结果；uncertain/读取失败保持 stale read-only，
409 刷新、0 retry。配置/property lifecycle 和 scope/epoch/DOM root fence 继续成立。

正式契约：[Database transactional Cells](database-cell-mutations.md)；
调度矩阵、真实 Mongo、测试和停止边界：[P11.4C 验收](../verification/p11-4c-auto-shift-policies.md)。
P11.4D/P11.5/P11 Final 不属于本轮。connector keyboard create P2 留待 D 或 P11.5。
