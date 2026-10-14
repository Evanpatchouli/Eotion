# P11 Timeline — Notion Parity Product Standard

> Status: **P11.1、P11.2 核心 Read、P11.3A Drag Foundation 与 P11.3B Resize Range Mutation 范围 PASS；完成并停止，不进入 P11.3C**
> Target release: **0.0.3**  
> Stage: **P11**  
> Product direction: Eotion Timeline 在产品结构与交互上以 Notion Timeline 为直接基准，同时继续遵守 Eotion 的 Database / View / generic records / CAS / Quiet Studio 体系，不复制 Notion 的内部实现。

## 1. 目标

P11 的目标不是“做一个能画横条的甘特图”，而是实现一个真正可作为 Eotion Database 第四种正式 View 的 Timeline。

产品验收应以以下体验为基准：

- 同一批 Database Records 在横向时间坐标上按日期范围绘制。
- 时间轴可以连续水平滚动，底部存在真实可操作的水平滚动条。
- 当前日期在可视窗口内时，绘制一条贯穿时间网格的竖直红色“今天线”。
- 顶部提供时间尺度切换、上一段 / 今天 / 下一段导航。
- Record 以横向时间条显示，可移动整段、拖动左右边缘修改长度。
- 标题与选定属性直接显示在时间条中。
- 可显示 / 隐藏左侧冻结表格。
- 可从视口外记录的方向提示快速跳到对应时间位置。
- 支持加载更多、新建记录、打开 Record Page、Filter / Sort / Property visibility。
- 支持 Notion 式 dependency 可视连接与依赖日期联动。
- Linked View、CAS、snapshot/lifecycle、online-only Database 边界继续成立。

本规范描述的是 **P11 的产品与结构标准**。实现细节可以不同，但不得通过削弱行为来规避这些标准。

## 2. 参考基准

本规范基于：

1. 用户提供的 Notion Timeline 实际截图（2026-10-13）。
2. 用户补充确认：
   - 今天位置存在贯穿时间轴的竖直红线；
   - Timeline 主区域可水平滚动，底部存在横向滚动条。
3. Notion 官方 Timeline Help 当前公开行为：
   - 时间尺度可从小时扩展到年份；
   - Today 可跳回当前日期；
   - 时间条左右边缘可拖动调整时长；
   - 可显示 / 隐藏左侧 table；
   - 可切换用于绘制 Timeline 的 Date Property；
   - 可使用单一 Date range，也可使用独立 Start / End Date Properties；
   - 可控制 timeline property visibility、load limit、row reorder。
4. Notion 官方 Tasks / Dependencies 行为：
   - Timeline 可显示 dependency；
   - dependency 基于 relation 连接记录；
   - 可配置“仅重叠时偏移 / 保持间隔偏移 / 不自动偏移”；
   - 可选避免周末。

外部参考：
- https://www.notion.com/help/timelines
- https://www.notion.com/help/tasks-and-dependencies

## 3. 页面结构

Timeline 仍然位于现有 Database Block / Database Page Shell 中。Database 标题、View Selector、Settings、Create View、Record opening 等通用能力不在 Timeline 中复制。

建议结构：

```text
DatabaseNodeView / DatabasePage
└─ TimelineView
   ├─ TimelineHeader
   │  ├─ MajorPeriodLabel
   │  ├─ CalendarIntegrationSlot
   │  └─ TimelineNavigation
   │     ├─ ScaleSelect
   │     ├─ PreviousButton
   │     ├─ TodayButton
   │     └─ NextButton
   ├─ TimelineBody
   │  ├─ FrozenTablePane?          # 可显示 / 隐藏
   │  └─ TimelineViewport          # overflow-x: auto
   │     └─ TimelineCanvas
   │        ├─ TimeRuler           # sticky top
   │        ├─ GridBackground
   │        ├─ TodayLine
   │        ├─ TimelineRows
   │        │  └─ TimelineItemBar
   │        └─ DependencyLayer
   ├─ HorizontalScrollbar
   └─ TimelineFooter
      ├─ LoadMore
      ├─ MoreActions
      └─ NewRecord
```

关键结构约束：

- Timeline 的横向滚动必须只作用于时间区域；不能让整个页面产生 document-level 横向溢出。
- 左侧 table 展开时保持冻结，不能跟随时间轴横向滚动。
- Table rows 与 Timeline rows 必须严格共用行高和纵向顺序。
- 默认不引入第二个纵向滚动容器；inline Database 应继续由页面负责纵向滚动，Timeline 只负责横向滚动。
- Time ruler 在 Timeline 自身滚动时保持与横向坐标同步，并在页面纵向滚动经过 Timeline 时按既有产品 Shell 策略保持可读。

## 4. 顶部 Header / 导航

### 4.1 Major Period Label

截图左上方的“一月”属于当前可视区的主时间段标签，而不是 View 名称。

行为：

- 标签随横向 viewport 改变而更新。
- Month scale 下显示当前主月份。
- Week / Quarter / Year 等尺度使用与尺度匹配的主周期标签。
- 当 viewport 跨两个主周期时，优先显示当前左侧主周期，下一主周期标签在 ruler 对应位置自然出现。
- 主周期标签与下方细粒度 tick 形成两层时间标尺。

### 4.2 Scale Select

截图中的“月度”是 Timeline zoom / timeframe selector。

P11 至少支持：

```text
Hour
Day
Week
Bi-week
Month
Quarter
Year
```

要求：

- 切换 scale 只改变时间坐标与可视粒度，不修改任何 Record 日期。
- 当前 viewport 的语义中心尽量保持稳定，避免每次切换后跳到无关日期。
- Time ruler、网格宽度、today line、bar position、drag snapping 全部使用同一个 time-scale transform。
- 如果 P11 实施时当前 Notion 已稳定提供更大尺度（例如 5 years），可以作为加性 scale 增加，但不得改变已有 scale 的存储语义。

### 4.3 Previous / Today / Next

截图右上方为：

```text
[Scale]   ‹   Today   ›
```

行为：

- Previous / Next 按当前 scale 的主要 viewport 单位平移。
- Today 将 viewport 跳回当前日期；空间允许时让今天线落在视口中部附近，而不是贴边。
- Today 不修改选择中的 Record，不改变 filter/sort。
- 键盘 focus、aria-label 与 44px touch target 继续遵循 Eotion UI 标准。

### 4.4 “在日历中管理”

截图顶部存在 Notion Calendar 集成入口。它属于 Notion 外部 Calendar 产品集成，不属于 Timeline 核心坐标系统。

Eotion 标准：

- P11 在结构上保留 `CalendarIntegrationSlot`，避免未来 P13 Calendar 接入时重新改 Timeline header。
- P11 不显示一个无法工作的假入口。
- P13 Calendar 完成后，该 slot 可以提供“在日历中管理 / 打开日历视图”等真实能力，但必须由实际 Calendar capability 驱动。
- 不因为视觉复刻而制造无后端语义的 dead control。

这是 P11 对 Notion 唯一明确允许的阶段性可见差异。

## 5. Time Ruler

Time ruler 是 Timeline 的坐标基准，不是普通 header 文本。

截图在 Month scale 下表现为：

```text
一月
31  1  2  3  4  5  6  7  8 ...
```

结构要求：

- 第一层：主周期（Month / Quarter / Year 等）。
- 第二层：当前 scale 下的细粒度 tick。
- tick 必须与下方 grid line / item position 使用完全同一 x 坐标。
- 周末 / 非工作日可以采用轻微 surface 差异，但不能喧宾夺主。
- 跨月、跨季度、跨年边界必须连续，不允许用分页切断时间轴。
- locale 决定月份、日期、星期等标签格式。
- 周起始日遵循产品 locale / preference，而不是写死 Sunday 或 Monday。

## 6. 横向滚动模型

Timeline 是一个近似无限的横向时间空间。

硬要求：

- `TimelineViewport` 使用真实 `overflow-x: auto` / 等价原生滚动能力。
- 底部显示可用的水平 scrollbar；不能只依赖 Shift+Wheel 或手势。
- 鼠标滚轮 + Shift、触控板横移、拖动 scrollbar 都应生效。
- 桌面 / 平板保持横向时间轴模型。
- 不允许 Timeline 横向滚动推动 Sidebar、Page、Topbar 或整个 document。
- viewport 横移后，ruler、grid、bars、dependencies、today line 必须保持像素级同步。
- 大时间跨度不能渲染无界 DOM；需要 windowed / virtualized time canvas 或可证明有界的等价实现。
- 不能通过把所有日期一次性扩成几十万像素永久 DOM 来“实现无限滚动”。

建议 coordinate model：

```text
timestamp/date  <->  logical time coordinate  <->  x pixel
```

所有视觉层只消费同一个 transform，不允许 ruler / bars / dependency 各自计算一套日期位置。

## 7. Today Line

用户明确要求与 Notion 一致：

- 当“今天”落在当前可视时间范围内，显示一条竖直红色轴线。
- 红线从时间标尺下沿贯穿 Timeline canvas 的所有可见 rows。
- 红线不参与 hit testing，不遮挡 Record bar 交互。
- 红线位置必须基于用户当前 timezone / locale 的“今天”，不能使用服务器 UTC 日期直接决定。
- 日期跨日后，在应用存活状态下也要更新，不要求刷新页面才能变化。
- Today button 跳转后，红线应立即进入 viewport。
- Dark mode 仍使用高可识别的 danger/red semantic token，但保持 Quiet Studio 的低饱和度，不使用刺眼荧光红。

今天线是 P11 Visual Acceptance 的必测项。

## 8. Timeline Rows

每个可绘制 Database Record 占一个逻辑 row。

规则：

- row 的纵向顺序来自当前 View 的排序 / 手动顺序语义。
- Filter 在服务端 generic records 查询阶段完成。
- Timeline 不能对当前分页结果重新做一套会改变业务结果的 filter/sort。
- row 高度在同一 View 中稳定；Table pane 打开时左右两侧完全对齐。
- Bar 可以跨越多个时间 tick，但不改变 row 高度。
- 多条 Record 不共享一个 row，因此不需要在单 row 内做事件碰撞排版。

Notion 支持拖动 Timeline item 上下调整顺序。P11 将此行为列为 parity requirement，但持久化必须设计成 **generic View row ordering**，不能创建 TimelineRecord / TimelineRow 实体。若 P11.1 需要新增 View-record order persistence，应设计成未来 List/Gallery 等也可复用的通用能力。

## 9. Timeline Item Bar

截图中每个 Record 表现为白色 / raised surface 的圆角横条。

### 9.1 内容

默认顺序：

```text
Page.title   [visible property 1] [visible property 2] ...
```

要求：

- Page.title 继续是 Record title 唯一来源。
- 复用 `visibleProperties` / `propertyOrder`。
- Select 等属性可按现有产品样式显示为 pill。
- 内容超宽时截断，不撑开 bar 的真实时间宽度。
- 点击标题 / bar 主区域按既有 Record opening preference 打开 Drawer / Modal / Page。

### 9.2 宽度

Bar 左边界 = resolved start。datetime 的视觉右边界 = 精确 resolved end；有显式 end 的 all-day 日期范围，其视觉右边界 = display time zone 中 end 次日的日初，因此包含结束日期。显式 `start == end` 仍遵守 P11.1 零 duration；all-day 覆盖一天只是视觉表现。没有 end 的 item 仍是 point。详细 renderer-only 约定见[Timeline Renderer 架构 §12](architecture/timeline-renderer.md#12-三种-item-geometry-与-all-day-视觉范围)。

- duration 决定 datetime range 的真实几何长度；all-day 显式 end 按上面的结束日视觉规则计算。
- 不能因为标题更长而偷偷扩大日期范围。
- 当视觉宽度不足以显示标题时，只裁剪内容。
- 最小命中区域可以大于真实几何宽度，但视觉日期范围不能被篡改。
- point、显式零长度 datetime range，以及时区整日跳过导致视觉区间宽度为零的 item，都必须显示可见 marker，提供独立命中区域、键盘 focus 和 Record open 入口；range 仍保留 range kind 与 end，跳过日期须保留诊断信息。

### 9.3 Hover / Selection

hover 时提供：

- move cursor / drag affordance；
- 左右 resize affordance；
- dependency connector（启用 dependencies 时）；
- 必要的 date tooltip。

Focus / keyboard 状态必须与 hover 有等价可感知反馈。

## 10. 日期来源与 Date Range

P11.1A 冻结了 date-only / range / datetime 模型；P11.1B 将同一模型接入现有通用 Record 数据链路。

P11.1 必须先扩展 Date 语义，再进入 renderer。

### 10.1 支持两种 Timeline date source

与 Notion 对齐：

**A. 单一 Date Property 内保存 range**

```text
DateProperty
start = 2026-01-05
end   = 2026-01-10
```

**B. 分离的 Start / End Date Properties**

```text
startPropertyId = plannedStart
endPropertyId   = plannedEnd
```

View config 必须明确记录 source mode 与稳定 Property ID，不能靠 Property name 猜测。

### 10.2 Date value 演进约束

P11.1 冻结 wire shape 时必须满足：

- legacy `YYYY-MM-DD` Date value 继续可读，不做破坏性 migration；
- 新模型能表达 `start` + optional `end`；
- 为 Hour scale 保留 date-time 能力，不能永远锁死 date-only；
- timezone / all-day 语义必须明确；
- `start <= end`；
- Property delete / Date → non-Date type mutation 若被 Timeline 使用必须 409 fail-closed；
- 与 P8/P9 一样，不静默清除 View config 引用。

具体 TypeScript wire shape留给 P11.1 在真实代码上冻结，但上述语义不可降级。

### 10.3 单点日期

若 Record 只有 start 而没有 end：

- 解析为 zero-duration / single-point item；
- 视觉上使用当前 scale 的最小可交互宽度；
- drag 整体移动仍只修改 start；
- resize 产生 end 后，该 Record 正式成为 range。
- 这能让 deadline / milestone 类记录存在于 Timeline 中，同时不伪造持久化时长。

### 10.4 P11.1A / P11.1B Date 数据契约

P11.1A 落地 `packages/domain/src/date.ts` 的纯日期领域基础；P11.1B 正式扩展
`DatabasePropertyValue` 并复用该基础接入 Contracts、Mongo、Formula 与 Web Table。
P11.1A 的 validator / normalizer 是唯一校验与规范化标准。

- 继续使用现有 `Database / Property / Record / View`；Date Property 仍是现有
  `date` 类型，不新增 Property 类型或 Timeline 专属实体。
- legacy `YYYY-MM-DD` string 永久可读，不批量迁移旧数据。新对象统一为
  `{ start, end?, timeZone? }`，字段严格校验且拒绝未知字段。
- all-day 值只允许 `YYYY-MM-DD`，不附带 `timeZone`；datetime 值的 `start` /
  `end` 必须是 canonical UTC instant，并且必须附带可由 `Intl` 识别的 IANA
  timezone。单点日期或单时间点省略 `end`，不得持久化虚假的 `end`。
- `start` 与 `end` 必须同为 date-only 或同为 datetime，且顺序满足
  `start <= end`；相等的 `end` 表示显式零长度 range，仍与省略 `end` 的单点语义
  区分；非法日期、闰年、UTC instant、时区或混合类型一律拒绝。
- normalization 通过共享纯函数完成：legacy string 与新对象都归一为带
  `kind` 的 normalized value。持久化和 HTTP 响应保留原 wire shape、end 是否存在
  与 timeZone；不把 `kind` 写入 Record，不改写旧字符串或批量迁移历史值。
- Timeline date source 后续支持单 Date Property range 与独立 Start / End Date
  Properties。Dependency 后续复用现有 self Relation，direction / shift policy
  进入 View config；引用的关键 Property 必须有 lifecycle 409 fence。
- 不创建 `TimelineRecord`、`TimelineEvent`、`TimelineDependency`，不新增
  Timeline 专属 mutation API；Database 继续 online-only，不扩展 Page / Block
  sync。

#### P11.1B 通用写入、比较与派生读取

- 只有 Date Property 接受日期对象；其他 Property 不因共享值联合类型扩大而接受对象。
  Create / Cell Update 的 Zod 输入委托同一严格 validator，服务端再按真实 Property 类型
  校验。未知字段、非法时区、非法 start/end、混合或逆序范围均拒绝。
- 现有 HTTP Record POST 增加可选 `properties` 初值，复用相同值 schema；旧只包含
  id/pageId/title/orderKey 的请求不变。初值禁止 title 副本、派生字段与未知 Property；
  title 继续由 Page.title 投影，Relation 按现有引用 fence 校验。Page/Record 与 Database
  版本在原事务内一致创建，非法 Date 或 Property 初值不得留下 Page 或部分 Record。
- **统一排序键**：`getDatabaseDateStartInstant` 从 normalized start 生成 canonical UTC
  字符串；date-only 视作该日 `00:00:00.000Z`，datetime 保持原 UTC instant。
  例如 legacy `2026-10-13`、`{ start: '2026-10-13' }` 与 datetime
  `2026-10-13T00:00:00.000Z` 排序相等；当天中午 datetime 排在它们之后。
  timeZone 和 end 不改变排序键；空值在升/降序均最后，Record ID asc 为最终 tie-break。
- **既有日期 Filter 仍按天比较**：配置值保持 `YYYY-MM-DD`，`is` / `before` / `after`
  比较 normalized start 的 UTC 日历日（前 10 字符）；datetime 的 `is` 匹配整 UTC 日，
  `before` / `after` 严格匹配更早/更晚日，不把同日不同时间判为更早/更晚日。
  legacy 字符串行为不变。范围只看 start，不新增 overlap Filter 或 datetime Filter 配置。
- Mongo aggregation 以受控表达式从 legacy string 或对象 start 生成同一键，不比较 BSON
  日期对象本身。排序与 cursor anchor 使用同一 UTC instant 键；保留现有 scope/config/
  Database version/View version/Page version 绑定，日期更新使旧 cursor 返回 409。
  继续 filter → sort → paginate，不在客户端重排当前页；默认无 Filter/Sort 保持 ID 索引快路径。
- **Formula date 结果保持 `YYYY-MM-DD`**：合法日期对象通过
  `projectDatabaseDateToFormulaDate` 投影 normalized start 的 UTC 日历日；date-only 原日
  不变，datetime 不按浏览器、服务器或值的 timeZone 改换日历日。range end 不进入 Formula
  结果，省略 end 的单点也可读取；不引入 range Formula 类型或隐式对象字符串化。
  UTC 日粒度投影与既有日期 Filter 一致；Formula 不暴露时间精度。
- Rollup 保持原矩阵：Date 仅支持 count / count_values；合法范围或 datetime 对象各是一个
  非空值，不按 end 拆成多个值；Date min/max 与 range 聚合不在本轮。
- Property 类型转换继续既有保守矩阵：同型 Date no-op 完整保留对象；legacy Date → text
  保留原字符串，日期对象 → text 及其他未支持转换清除该 key（不隐式截 start 或
  `[object Object]`）。沿用类型变更确认、事务/CAS 和有界扫描，不批量转换现有 Date 值。

#### P11.1B Table 编辑边界

Table Date Cell 展示完整 start、显式 end 与 datetime timezone，并用完整多字段草稿编辑。
仅修改 start/end/timeZone 时保留其他字段；只有显式清除 end 才变为单点。legacy 只改 start
继续保存字符串，原对象保持对象。datetime 使用明确标识 UTC 的日期时间输入，timeZone
编辑改变显示时区元数据，不移动 instant；切换“包含时间”是用户显式模式转换。
字段间移动焦点不会保存半成品，完整保存继续沿用 generic Cell Update、Database/Record CAS、
loading、错误草稿与冲突刷新。390px 响应式 Web 继续可用；不等价于原生宿主真机验收。

P11.1B 完成后，P11.1C 接续入口是共享 normalized Date + 现有 generic records/View config；
须先读取本节、日期 helper 和 query/cursor 回归，再处理 Timeline date source / View config
与相应 lifecycle fence。本轮不提前创建 Timeline renderer、mutation 或 dependency UI。

P11.1B 验收：Domain 41/41、Contracts 24/24、SDK 23/23、Storage 7/7、真实 Mongo API
19/19、完整 Web Database 111/111（workers=1 / retries=0）；相关 typecheck / build、
diff / UTF-8 检查与独立复核通过。完整证据与边界见 [P11.1B 验收](verification/p11-1b-generic-date.md)。

## 11. 时间条移动与 Resize

Timeline item 需要三种核心 mutation：

### Move

拖动 bar 主体：

- start 和 end 同量平移；
- duration 保持不变；
- 拖动时按当前 scale 对齐合理时间刻度；
- pointer move 期间只做 ephemeral preview；
- pointer up / drop 才调用通用 Record cell mutation；
- server success 后确认；
- 409 / failure 回到服务端真实值并显示冲突反馈。

### Resize Start

拖动左边缘：

- 只修改 start；
- 不允许 start > end；
- 允许把 single-point item 拉成 range。

### Resize End

拖动右边缘：

- 只修改 end；
- 不允许 end < start。

拖动期间显示日期提示，避免用户必须只靠网格猜日期。

不得新增 `moveTimelineItem` 之类 Timeline-specific HTTP endpoint；最终仍应落到通用 Date Property mutation + CAS。

## 12. 离屏记录提示

Notion Timeline 对落在当前 viewport 左侧或右侧的项目提供方向箭头。

Eotion parity：

- Record row 在当前查询结果中，但 bar 完全位于 viewport 外时，在对应 row 左 / 右边缘显示轻量方向提示。
- 点击后横向滚动到该 Record。
- 若 Record 本身跨越 viewport，只显示能够表达缺失范围的方向提示。
- 提示是导航，不改变 Record 日期。
- 不应为尚未加载的下一页 Record 伪造箭头。

## 13. 左侧 Frozen Table

Notion Timeline 可显示 / 隐藏左侧 table。

Eotion 必须支持：

- 默认状态可按 View config 保存。
- 展开后 table 固定在左侧；Timeline 横向滚动不影响它。
- 收起后 Timeline 使用完整可用宽度。
- table 至少包含 title，并允许从当前 Database Properties 中选择额外列。
- table property visibility/order 与 Timeline bar property visibility 是两个不同 projection；不能强制完全相同。
- table column resize / reorder 若实现，应复用通用 View config 能力。
- 左右区域 row 高度、hover、selection、open record 状态同步。
- `<<` / `>>` 或 Eotion 等价 Quiet Studio affordance 必须清晰可发现。

## 14. Dependency Layer

用户截图中的 item 右侧 connector 以及当前 Notion Timeline 都要求 Dependency 进入 P11 结构标准。

### 14.1 数据模型

不得创建 TimelineDependency 实体。

优先复用 Eotion 已有 Relation Property：

- dependency 是同一 Database 的 self-relation；
- Database / View config 标识哪个 self-relation 被解释为 dependency；
- 依赖方向必须明确（blocked by / blocking），不能只保存无方向集合后在 UI 猜测。

若现有单向 Relation 不足以表达稳定反向 projection，P11.1 应扩展 generic Relation / dependency domain，而不是把逻辑塞进 renderer。

### 14.2 视觉

- 启用 dependency 后，hover bar 出现 connector handle。
- 用户可从一个 item 拖出连接到另一个 item。
- 已有 dependency 用细线 / 箭头跨 rows 绘制。
- dependency layer 与 time canvas 同步横移。
- line 不参与 bar width 计算。
- 大量依赖时要避免 O(n²) DOM/路径计算。

### 14.3 日期联动策略

目标 parity：

```text
shift_when_overlapping
shift_and_keep_gap
no_auto_shift
```

并支持：

```text
avoid_weekends: boolean
```

这些规则属于 Database / dependency domain，不属于 CSS / renderer。

自动 shift 必须：

- 在服务端事务内验证；
- 有界地处理 dependency chain；
- 检测 cycle；
- 使用 CAS / version fence；
- 失败原子回滚；
- 不产生部分记录已移动、部分失败的状态。

## 15. Property Visibility

Timeline bar 与 Frozen Table 均可以投影属性。

Bar：

- 复用 View 的 `visibleProperties` / `propertyOrder` 作为基础。
- 标题永远来自 Page.title。
- 属性在 bar 内按 compact form 呈现。

Frozen Table：

- 需要独立 table projection options，避免“为了 Timeline bar 显示一个 Status”就强制左表也出现同一列。
- View config 中新增字段必须位于 `options` 并保持 unknown future options。

## 16. Load More / New

截图底部明确存在：

```text
↓ 加载更多   ...
+ 新建
```

要求：

- 沿用 generic records cursor。
- “加载更多”增加整个 View 的 records 集合，不做按时间片单独分页。
- 加载新页后保持当前横向 scrollLeft，不把用户拉回 today / start。
- 新建 Record 继续使用现有 Database record creation flow。
- 若新建记录没有 Timeline date source，记录可以存在但进入“未排期 / 未安排”状态，不应被偷偷赋今天。
- 可以提供显式“安排到时间轴”入口，但日期必须由用户动作产生。

## 17. 未排期 Records

完整 Timeline 需要处理没有可解析 date range 的 Records。

标准：

- 不从主时间 canvas 静默丢失且完全不可发现。
- 提供“未排期 / No date”区域或可达入口。
- 用户可以从未排期区域把记录拖入某个时间位置，从而写入 start/date。
- Filter 仍在 server-side 执行。
- 未排期区域的存在不能改变分页语义。

最终呈现位置可以在 P11 Visual Design 时微调，但“无日期记录可发现、可安排”是硬要求。

## 18. Filter / Sort / Group

### Filter / Sort

完全复用 P9 generic records：

- server-side filter；
- server-side multi-sort；
- cursor / bounded result；
- renderer 不重新解释业务查询。

### Group

Notion Timeline 支持按属性分组。Eotion P11 若实现 grouping，必须做成可复用的 generic View grouping，而不是 TimelineGroup entity。

由于截图基准未展示 group，本能力可以在 P11 主 renderer 稳定后实施，但 **P11 Final Acceptance 前是否要求 full Notion grouping parity，应在 P11.1 scope freeze 时明确记录，不得默默遗漏。**

## 19. Responsive

### Desktop >= 1200

- 完整 Timeline；
- 横向 scrollbar；
- Frozen Table 可展开；
- mouse drag / resize / dependency；
- scale + prev/today/next 常驻。

### Tablet 768–1199

- 保留横向 Timeline，不降级成 List；
- Toolbar 可压缩但核心 scale / today/navigation 必须可达；
- Frozen Table 可以默认收起；
- touch drag target 放大。

### Phone < 768

Phone 不应把 Timeline 假装成普通 List。

标准：

- 仍然是横向时间轴；
- 支持触摸横向滚动；
- Today 可跳转；
- scale selector 可达；
- Record 可打开；
- 日期修改可使用更适合 touch 的 picker / sheet 作为拖拽替代或补充；
- dependency 创建可进入明确的 touch flow，不强求细小 connector 拖动；
- document 仍不得产生全页横向 overflow。

P11 Visual Acceptance 至少覆盖 1440×900、约 834px tablet、390×844 phone，Light / Dark。

## 20. Lifecycle / Concurrency

P9 的 identity fence 继续是硬边界：

- Timeline / Table / List / Board 切换不能 remount Editor / NodeView。
- 横向 scroll、scale、table visibility 等纯 View UI state 变化不能关闭 Record Drawer 或丢 title/body draft。
- semantically equal Page snapshot 不重建 Timeline component。
- in-flight Date / View config mutation 返回时必须验证当前 user/workspace/database/view/block identity。
- A → B → A 仍要防旧响应污染。
- 409 不覆盖当前新 View state。

不要为了 Timeline 重构已封板的 P9 identity fence，除非有稳定可复现 blocker。

## 21. View Config 实际契约（P11.1C 冻结）

Timeline 是现有 `DatabaseView.type = 'timeline'` 的第四种 View，复用既有
Database / Property / Record / View、View CRUD、generic records、事务与 CAS。
没有 Timeline 专属实体、API、DTO 或 Mongo 集合。实际配置位于现有
`DatabaseViewConfig.options.timeline`：

```ts
interface TimelineViewOptions {
  dateSource?:
    | { mode: 'date-property'; propertyId: string }
    | { mode: 'start-end'; startPropertyId: string; endPropertyId: string }

  scale?: 'hour' | 'day' | 'week' | 'biweek' | 'month' | 'quarter' | 'year'

  frozenTable?: {
    visible: boolean
    visibleProperties: string[] | null
    propertyOrder: string[] | null
  }

  dependency?: {
    propertyId: string
    direction: 'depends-on' | 'blocks'
    shiftMode: 'shift_when_overlapping' | 'shift_and_keep_gap' | 'no_auto_shift'
    avoidWeekends: boolean
  }
}
```

### 21.1 结构与默认值

- `options`、`options.timeline` 和其四个字段均可省略；`timeline: {}` 合法。
  `DEFAULT_DATABASE_VIEW_CONFIG` 保持原样，不要求 options，不自动选择 Date Property。
- scale 缺省的有效值为 `month`（`DEFAULT_TIMELINE_VIEW_SCALE`）；不将默认值补写入
  持久配置。七种 scale 只控制显示粒度，不改 Record 日期。
- Timeline 内层对象严格校验：拒绝未知字段、null、显式 undefined、错误类型和枚举。
  `frozenTable` 一旦出现必须有三个字段，`dependency` 一旦出现必须有四个字段。
  dateSource 必须是上述两种完整分支之一，不能混用两个分支的字段。
- `options.timeline` 是已知命名空间，出现时就进行结构验证，因此原 Create/Update
  Zod config 入口会拒绝坏结构；不新增 Timeline 专属 DTO。`config.options` 外层
  未知未来字段继续原样保存、返回，校验不会删除或改写配置。
- 需要 Properties 的引用语义仅应用于 `view.type === 'timeline'`；Table/List 不应用
  Timeline/Board 引用语义，Board grouping 继续独立校验。本轮不改变旧三种 View 的行为。

### 21.2 日期来源

- 引用稳定 Property ID，必须属于当前 Database 和 Workspace，且 `type === 'date'`。
  只接受可写入原生 Date，不接受 Formula 的 date 结果或 Rollup。
- `date-property` 使用该 Property 的 normalized start/end；end 省略仍是单点。
- `start-end` 的两个 ID 必须不同，各取对应 Property 值的 normalized start；各自
  对象中的 end 不充当该模式的边界。
- config 合法性不依赖 Record 是否已填值；未配置 dateSource 的 Timeline 合法。
  缺值的 Record 保持存在，后续 renderer 处理未排期状态，不能偷偷赋日期。
- 本轮仅冻结引用和语义，不新增 Record 的 Timeline 日期解析或写入行为。

### 21.3 Frozen Table 独立投影

- 顶层 `visibleProperties` / `propertyOrder` 继续代表 bar projection。
  frozenTable 内两个数组独立保存，不要求与 bar 相等，也不会互相覆盖。
- 数组为 null 时使用全部属性 / 默认顺序；非 null 数组遵循现有限额（最多 100）、
  稳定合法 ID 和无重复规则，所有 ID 必须属于当前 schema。
- 非 null `visibleProperties` 必须包含唯一 Title；即使 `visible === false` 也保留
  这些有效列。`propertyOrder` 沿用现有部分排序规则，不强制重复列出所有可见属性。
- 隐藏不清空已配置的列，不持久化像素/滚动位置；本轮不实现冻结表格 UI。

### 21.4 Dependency 配置

- 只引用当前 Database/Workspace 的原生 Relation，且
  `config.targetDatabaseId === 当前 Database ID`，即 self-relation。
- `depends-on` 表示当前 Record 依赖 Relation 值中列出的 Records；`blocks` 表示
  当前 Record 阻塞列出的 Records。方向必须显式保存，不从名称推断。
- 三种 shiftMode 沿用 §14.3，avoidWeekends 只保存显式 boolean。
  本轮不实现依赖图、反向 projection、连线、cycle mutation 或自动日期联动。

### 21.5 本轮边界与后续入口

同一 View ID 共享配置，不同 View ID 独立；改变 options 不复制、改写或重排 Records。
generic records 继续执行已有过滤、排序、分页及配置/版本 cursor fence。
Web 可选择已有 Timeline View，显示明确的暂未实现状态，不回退 Table；创建入口、
时间网格、时间条和 Timeline 专用设置留待后续。

以上为 P11.1C 交付时的实施边界。P11.2A 已建立 Shell/坐标，P11.2B 已接入真实 generic
records 的只读 milestone/range 与未排期行，实际阶段结果见
[P11.2B 验证](verification/p11-2b-read-only-bars.md)。Date/View 配置契约保持不变；
创建、配置 UI 与其余完整 P11 parity 不由这两个阶段自动实现。

`DatabaseService.linkInPage` 仍保持 Table-only 规则；后续 Linked Timeline 的接入点
是该方法的 View 类型门禁与对应 HTTP/Block identity 验收，本轮没有提前放宽。

**P11.1D 生命周期保护：**统一 `DatabaseViewPropertyDependency` 表达 Board grouping
（select）、Timeline dateSource（原生 Date，含 start/end）和 dependency（self-relation）
硬引用。删除或候选 Property 类型/Relation target 破坏引用时返回 409；不自动替换、清空
或猜测配置。Relation 无 Record 链接也受保护，rename 和合法 self target 更新允许。

Frozen Table 的 visibleProperties / propertyOrder 是软引用：删除 Property 时移除 ID，
保留 Title、dateSource、dependency、其他 Timeline 字段与未知 outer options；顶层
filter/sort/projection 沿用原修复规则，Table/List 不应用 Timeline 引用语义。

updateProperty / changePropertyType / deleteProperty 在 Mongo snapshot transaction 内
读当前 Views、检查硬引用并用候选 schema 验证最终配置，随后写入。所有 repair 调用
`validateDatabaseViewConfig(config, properties, view.type)`；同类型 change 保持 no-op。
Property/Database 版本冲突与 View repair CAS 失败均为 409，所有事务写入回滚。
View CRUD 与 Property mutation 共用 Database version CAS，防止并发新增硬引用与
破坏性 mutation 同时提交；实际修复的 View 版本加一，未变化的 View 保持版本。

新建/PATCH View 的非法非 self-relation 配置保持 P11.1C 的 400 输入校验契约；
修改已被 Timeline 引用的 Relation 使其不再 self-relation 返回 409 生命周期冲突。
验收与事务/并发证据见 [P11.1D 验收](verification/p11-1d-property-lifecycle-fence.md)。

`scrollLeft`、hover item、drag preview、today line x、tooltip、viewport pixel width
均为 device-local / ephemeral 状态，不属于此共享配置；Timeline 内层不接受这些字段。

## 22. 与现有 Eotion 架构的边界

继续保持：

- Database / Property / Record / View 是唯一持久领域。
- Timeline 是 `DatabaseView.type = 'timeline'` 的 renderer，不是新 Database。
- generic records 是读取基础。
- Page.title 是 Record title 唯一来源。
- Linked View 共享同一 Database；同 viewId 共享 Timeline config，不同 viewId 独立。
- Database online read/write、offline readonly。
- Page / Block local-first oplog 不接管 Database mutation。
- Date drag / dependency shift 仍经过 server authorization / transaction / CAS。
- 不创建 TimelineRecord / TimelineRow / TimelineDatabase / TimelineDate API。
- 不为了 Timeline 引入 Kafka/Redis。

## 23. P11 分阶段建议

### P11.1 Timeline Domain + Date Range Foundation

当前细分：P11.1A 日期领域基础 PASS；P11.1B 通用 Date 数据链路 PASS；
P11.1C 冻结本节 §21 的 View 配置契约；P11.1D 已补完整 Property lifecycle 防护与
事务/CAS/回滚/并发验收。A/B/C/D 完成后停止，不自动进入 P11.2。

先解决：

- `DatabaseViewType += timeline`
- Date range / datetime / legacy Date compatibility
- Timeline view options validator
- referenced Date Property dependency fence
- optional separate Start / End Properties
- dependency domain minimum contract
- generic row ordering strategy（若要达到 reorder parity）

没有这些，不进入大规模 UI。

### P11.2 Timeline Read Renderer

#### P11.2 Renderer Architecture（P11.2.0 PASS）

P11.2.0 仅冻结 renderer 架构，不代表产品实现或验收。正式设计见[Timeline Renderer Architecture](architecture/timeline-renderer.md)。文档列明基线代码证据、17 项冻结决策、统一时间坐标与时区规则、viewport/ruler/rows 状态边界、P9 identity fence、standalone Database Page blocker B1，以及风险和后续验证目标。P11.2A scale selector 只改变本实例 ephemeral zoom，不 PATCH、不请求 records；`options.timeline.scale` 仍是共享保存配置，仅未来通用 View Settings 显式保存时才走既有 CAS 和 refresh。架构阶段的 `Timeline*` 类型/文件当时为拟实施内容；P11.2A 的 Shell/坐标模块现已建立，实际验证与 B1 修复见[P11.2A 验证](verification/p11-2a-timeline-shell.md)，不代表完整 read-bars 已实施。

P11.2.0 只变更架构、产品标准摘要及任务/检索文档；不改产品代码、依赖、API/schema/sync/MCP 或版本。17 项决策已冻结，独立复核 0 个确定文档 blocker；文档范围/链接/UTF-8 无 BOM/diff 检查与 62 项给定 instant 和公式验算通过，限制见[本轮验证](architecture/timeline-renderer.md#19-p1120-验证与停止点)。未运行产品、浏览器滚动或性能验收。本阶段提交后停止；经明确启动后，P11.2A 才可按架构文档 §16 实施。

P11.2B 已从 P11.2A 最新 HEAD 接入 projection → temporal geometry/layout → 只读 Bar。
单 Date 和独立 Start/End 均复用完整 Date normalizer；point 不补 end，range 保留原日期与
显式零长度，all-day inclusive 仅为视觉右界。未排期仍占 generic 原行并有索引打开入口。
200 条起复用现有 page host 虚拟化，Record 打开/selection 复用原 Host，不改 mutation、
配置、查询、同步或持久模型。验收与 100/500 条观察见
[P11.2B 验证](verification/p11-2b-read-only-bars.md)，实现入口见
[Renderer 架构 §21](architecture/timeline-renderer.md#21-p112b-只读时间条实施)。
P11.2B 完成后停止，不自动进入 P11.2C，也不等同于下列完整 read 清单或 P11 FINAL PASS。

P11.2C Frozen Table 已按独立授权完成并 **Scope PASS**。Frozen 列通过
`options.timeline.frozenTable` 独立投影，opt-in 显示；与 Timeline 共用 row geometry/window、
page-host 纵向滚动、Host selection 和 Record opening。完整 Web、390px、100/500、Relation
cache、截图与 review 结果见[P11.2C 验证](verification/p11-2c-frozen-table.md)。本结果只覆盖
C 范围，不代表完整 Product 全绿、P11.2 read 或 P11 FINAL 完成。Dependency、mutation、offscreen
indicator/jump 等仍按后续阶段边界处理；C 完成后停止，不自动进入 P11.2D。

P11.2 Read Renderer 全量完成条件（C 只完成 Frozen Table 子范围；不能据此整体标记 P11.2 Read PASS）：

- ruler / grid
- horizontal scrolling + scrollbar
- scale
- today red line
- rows / bars
- properties
- offscreen indicators
- pagination
- unplanned records
- Table/List/Board switching

#### P11.2D 本轮授权的 Read Acceptance

2026-10-13，**P11.2D 核心 Read Acceptance PASS**；本轮只补必要测试与文档，无产品实现修复。
基线 `916de4a` 包含 P11.2C，开始时工作树干净。正式验收入口为
[P11.2D Timeline Read Acceptance](verification/p11-2d-timeline-read-acceptance.md)。

本轮核心完成范围为：Timeline shell、Coordinate engine、七种 Scale、Ruler、Grid、Today line、
Read-only bars、Frozen Table。验收同时覆盖 Date-only/Datetime/Date Range/Datetime Range/
Unscheduled/Invalid、指定 Table→Timeline→Board→Timeline 的 identity/draft、单一 scroll ownership、
Desktop/390px 与100/500缓存/行窗口观察。真实 Domain、Contracts、SDK、Mongo API 和相关 Web
测试分别记录；历史失败必须与未改动基线对照，不以独立复跑通过隐藏完整运行失败。

该核心 Read Acceptance 与上面的完整 read parity 清单区分：完全离屏 scheduled 的方向
indicator/jump 尚未实施，仍作为后续 parity 待办保留。本轮不宣称全部 Notion parity、P11 Final
或完整 Product suite 全绿。Mutation、Drag、Resize、Dependency、Calendar、Chart 均不包含。
正式版本保持 `0.0.1`，目标版本仍 `0.0.3`；P11.2D 收口后停止，不自动进入 P11.3。

最终Domain48/48、Contracts25/25、SDK23/23、真实Mongo API22/22及相关typecheck/build通过。
相关Web231项228PASS/3FAIL/0skip/0flaky；三失败完全属于fresh未改动基线230项的四失败集合，
最终独立复跑2PASS/1FAIL。所有Timeline/Frozen/指定切换/100与500检查通过，完整失败对照与
截图、样本、停止边界以正式验收页为准，不宣称完整Product或P11 Final全绿。

### P11.3 Timeline Mutation

分阶段实施；P11.3A 为 Bar 整体移动基础，P11.3B 已独立授权范围调整。完整阶段目标：

- move range
- resize start/end
- date picker fallback
- CAS / 409
- server-confirmed persistence
- snapshot/lifecycle

#### P11.3A Drag Mutation Foundation

2026-10-13 启动、2026-10-14 收口，**P11.3A 范围验收 PASS**。Temporal/CAS 基础提交
`d2daaa2`，交互/接线/Web 提交 `bd561e4`；35 logic、19 真实 Mongo API、6 新拖动 Web、
12 既有 Timeline/Date/CAS 与38 Overlay均通过，Web/API typecheck与build通过。最终独立
review 0 个剩余确定 blocker；结果只代表本轮范围，未运行完整 Product / P11 Final。

单 Date Property 的 point / range 从 Bar 主体发起 pointer drag；未排期和独立 Start/End
两列保持只读。现有 Record cell API 一次只原子修改一个 Property，本轮经确认不扩展通用
API、不以两次请求模拟原子区间移动。

`TimelineBar → Drag Controller → Timeline Mutation Adapter → existing Record cell mutation`
是唯一写入链路。pointer move 只更新当前 Bar 的临时 geometry / 日期提示；release 才发出
一次 command，保留 pointerdown 时的原值、Database / Record CAS 与作用域。Timeline 不保存
独立日期状态，不新增 endpoint、collection、offline queue 或持久化模型。

横向偏移经 `timeToX → xToTime` 计算 temporal target。date-only 在显示时区按最近有效日界
吸附，使用 Gregorian 日历日偏移平移两端；datetime 使用整数毫秒 instant offset，保留
source timezone 与精确 duration。保留 string / object、缺省 end / 显式零长 end；all-day
视觉 inclusive 右界不写回数据。

release 后允许 Bar 保留 optimistic preview，现有 Database mutation success 后刷新 generic
projection；409 清除 preview、刷新 canonical Record 并提示重新拖动，无自动重试。其他失败
恢复 confirmed 值；不确定提交结果必须刷新核对。身份和日期仍归现有 Record Host / Database，
不因拖动重建 Editor、NodeView 或 Drawer。验收入口为
[P11.3A Drag Foundation](verification/p11-3a-timeline-drag.md)。

本轮不实现 Resize、start/end handle、Dependency shift、auto scheduling、multi-select/bulk、
Undo/redo、Offline queue、Calendar、日期编辑 fallback 或 Timeline settings UI；完成后停止。

#### P11.3B Resize Range Mutation 契约

2026-10-14，**P11.3B 范围验收 PASS**。纯逻辑/API回归提交 `6cb2803`，交互/Web提交 `251c1a3`；
43 logic、7 新 resize Web、17 既有定向 Web、19 真实隔离 Mongo API 最终通过，Web/API
typecheck/build通过。独立review的两项边缘hitbox问题已修，0剩余确定blocker。
首轮两项旧回归时序失败在单测和完整复跑通过，完整Product/P11 Final未执行；详见验收页。

P11.3B 只允许 `dateSource.mode === 'date-property'`。Range 的左 handle 只改 start，
右 handle 只改 end；越过另一端时 clamp 到相等，保留显式 end，不交换端点语义。
Point 仅有右 handle，向右到有效吸附目标才创建 end。Pointermove 不改 persisted value；
release 后一次提交完整 Date cell。Legacy string point 必要时升级 `{start,end}`，已有对象
保持对象；显式相等 end 与省略 end 的 point 始终区分。

坐标统一使用 `timeToX/xToTime`，吸附集中在共享纯函数并消费 scale 的 `futureSnapUnit`：
Hour 15分钟、Day 1小时、Week/Biweek/Month/Quarter 1日、Year 1月。吸附以原目标端点为
相对锚点，最近步长、等距向前；date-only 最细为日，不能升级 datetime。日/月步长复用
calendar engine，datetime 保留原毫秒、未修改端 instant、canonical UTC wire 与原 IANA timezone。
整体 move 仍使用 P11.3A 的原精度契约。

All-day persisted end 是包含式日期：range 右 handle 的原 temporal anchor 为 end 次日日初，
吸附后的视觉 exclusive 日界转换为前一 Gregorian 日期再写 end，不能直接写 visual boundary。
Point 原 anchor 为 start 日初，右移一个日界可形成 `{start,end:start}` 的显式单日 range，
右移两个日界形成包含两日的 range；没有提前为 point 伪造 end。DST 的23/25小时不改变
日历日期语义，转换不使用固定24小时回退。显示时区跳过整日时，inverse 选择边界前最后
存在的日期（例如 Apia 2011-12-31 日界对应 inclusive 2011-12-29）；原端点落在跳过日则
保持 fail-closed，不从 resize 生成不可显示端点。

Resize 复用 `TimelineBar → useTimelineBarDrag → mutation helper → NodeView adapter →
existing Record Cell API → Database/Record CAS + transaction → canonical refresh`。
Move/resize 共用局部 transient preview、捕获作用域与版本、取消和 uncertain-state 策略。
409 清 preview、刷新 canonical 并提示，不自动重试；其他错误回退，未知结果通过 generic
refresh 核对，不保留失败 preview。Handle 事件不触发主体 drag 或 Record open；主体 click
继续复用 Record Host，handle 有 accessible label 与可见 focus，不引入 focus trap。

独立 Start/End source 只显示/打开，无可用 handles。Separate Start/End mutation requires
generic transactional multi-cell Record mutation. Before that capability exists, range move/resize
remains read-only. 不增加 resize endpoint、Timeline collection、multi-cell API 或持久队列。
本轮不含 dependency、bulk/multi-select、undo、Calendar、settings/inline editor、P11.3C polish。
验收结果与未执行项见 [P11.3B Resize](verification/p11-3b-timeline-resize.md)。完成后停止。

#### P11.3C Mutation UX + Conflict 契约

2026-10-14，**P11.3C 范围验收 PASS**。Drag 与 resize 不再各自维护状态，而是共用
`timeline/interaction.ts` 的单一 ledger：`idle → previewing → pending → idle`，每个 in-flight
completion 绑定单调递增 token；`cancelPreview()` 只清本地 preview、不失效 in-flight token，
`cancel()`（Escape / unmount）才失效。move 与 resize 共用 `TIMELINE_DRAG_THRESHOLD_PX = 4`。
view 级 busy fence 以 `recordId + propertyId` 为键，保证同一 Date Cell 至多一个在途 mutation；
既有 generic Record Cell service 已是 database-wide 串行，Timeline 不重建 queue。

Escape（previewing）清 preview、0 PATCH、focus 留在 Timeline；Escape（pending）只 detach UI
callback，不假装撤销服务端 mutation。`pointercancel`、`lostpointercapture`、window blur、
`visibilitychange=hidden`、viewport transform / scope / version 变化与组件卸载都只清本地
preview；不允许 stuck handle、残留 cursor 或悬空 session。resize handle 可 focus（不再
`pointerdown.prevent`），bar/resize 的 pointerdown 不再复用同一个嵌套 target。

pending 期间 bar 显示轻量 Quiet Studio feedback（opacity、progress cursor、`aria-busy`、
`data-saving`、`role="status"`「正在保存…」），不改变 row height / 时间宽度 / bar 位置，
不用全屏 loading、不 remount Table/Record Host。同 record 的 date handle 变 `aria-disabled` 且
不可命中。

409 只做 canonical refresh + 低打扰提示，不 retry、不覆盖他人修改、不保留 stale optimistic
position；文案不暴露 CAS / version / HTTP 409。明确 4xx 回退到 canonical。transport / 5xx
一律 refresh 后用 normalized value 核对：一致则接受 canonical，不一致则回退并保持明确
uncertain；refresh 失败沿用 `staleReadonly` 只读。offline 时 Timeline 仍显示但
`data-draggable="false"`、pointerdown 立即 fail closed；offline 发生在 active preview 时
cancel 且不提交。

身份 fence 保持 P9/P11.2 原则：interaction token、scope/version、viewport transform、NodeView
`viewIdentityEpoch`/`viewRoot`/`data-view-id`/`viewReady`/`isEditable` 与 Database/Record
version 各自核验；busy fence 的 `finally` 释放与 identity 无关，避免 stale 响应永久锁死 record。
View switcher 的 `:disabled="viewBusy"`（含 `savingCell`）使 pending 期间切 View 在 UI 层
fail closed，跨 View stale callback 由 token fence 覆盖。

TimelineBar 的 bar body 与 resize handles 现在是零尺寸 anchor 容器下的绝对定位兄弟节点，
handle 永不嵌套在 bar 内部，因此 handle 手势不会触发 Record open，bar body click 仍走既有
Record Host。键盘方向键编辑日期仍留给 P11.5。

验收证据、已知边界（含 pending 切 View fail closed、无移动 bar body 仍打开 Record、
pointer capture 下无法点击 toolbar）与 P11.3D 接续入口见
[P11.3C 验证](verification/p11-3c-mutation-ux-conflict.md)。本轮不含 multi-cell Start/End、
Dependency/auto shift、bulk、Undo/Redo、offline queue、Calendar、settings UI 或 P11.5 polish；
不新增任何 Timeline backend API。

### P11.4 Frozen Table + Dependencies

完成：

- show/hide table
- independent table projection
- row alignment
- dependency connector / lines
- dependency relation mutation
- bounded automatic date shift

### P11.5 Responsive + Visual Polish

完成：

- desktop/tablet/phone
- Light/Dark
- touch behavior
- loading/empty/error/offline
- Quiet Studio visual convergence

### P11.6 Final Acceptance

独立验收后才允许版本切到 `0.0.3`。

## 24. Final Acceptance 最低矩阵

P11 FINAL PASS 前必须覆盖：

| Area | Must pass |
| --- | --- |
| Domain | Timeline type/options、Date range、legacy Date、dependency fence |
| Generic records | filter/sort/pagination 与 Table/List/Board 一致 |
| Ruler | Hour→Year、跨月/季/年、locale |
| Today | 红色竖线、跨日更新、Today jump、timezone |
| Scroll | 原生水平滚动、底部 scrollbar、无 document overflow |
| Bar | title/property projection、range geometry、open record |
| Mutation | move、resize left/right、single→range、409 |
| Offscreen | left/right indicator + jump |
| Frozen Table | show/hide、row sync、independent projection |
| Dependency | connect、render、cycle、shift modes、rollback |
| Unplanned | 无日期可见、可安排 |
| Lifecycle | switch/snapshot/draft/Drawer/ABA |
| Responsive | Desktop/Tablet/Phone |
| Theme | Light/Dark |
| Compatibility | old Table/List/Board / P8/P9 data no migration regression |
| MCP | P10 Database MCP 不因 Timeline 破坏；P15 full adaptation 仍后置 |
| Product | full Product suite workers=1/retries=0 |

## 25. 明确禁止的“伪 Timeline”

以下实现即使“看起来像甘特图”，也不能通过 P11：

- 只画静态横条，没有真实 Date mutation。
- 没有底部水平 scrollbar，只靠缩放塞进固定宽度。
- Today 只有按钮，没有当前日期红线。
- scale selector 只是视觉按钮，坐标不真正变化。
- bar 宽度由标题长度决定。
- drag 只改 DOM，不写回 Record Date。
- 当前分页数据在客户端重新 filter/sort，导致结果不完整。
- 左 table 与 Timeline 各有自己的 row list，滚动后错位。
- dependency 只画线，不存在领域关系 / CAS / transaction。
- 为 Timeline 新建 TimelineRecord / TimelineDatabase。
- 通过 remount Editor / NodeView 简化 View 切换。
- 为复刻 Notion 放一个没有真实行为的“在日历中管理”按钮。

P11 的标准是 **真实 Database View + Notion Timeline 级交互**，而不是视觉 mock。
