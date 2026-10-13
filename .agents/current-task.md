# 当前任务：P11.2C Frozen Table（Scope PASS，已完成并停止）

基线 `84c0758`，开始时 master 工作树干净；分支 `codex/p11-2c-frozen-table`。
仅完成 P11.2C，版本保持 0.0.1，P11 目标 0.0.3；完成后停止，不进入 P11.2D。

## 工作单元

| 单元 | 认知模式 / 评级 / 角色 | 验收输出 | 状态 |
| --- | --- | --- | --- |
| C1 | investigate / S0 scout | 现有 display/Host 与 Timeline layout/scroll/test Evidence Pack | 完成，两份不重叠 Evidence Pack |
| C2 | decide / S2 主 Agent | 最小 Implementation Brief：列投影、共享 rows、header、响应式与 cache 边界 | 完成，后续执行已降级 |
| C3 | execute / S1 fast_worker | Frozen 列/display 投影与 Relation 窗口 cache 接线及逻辑用例 | 完成；最终逻辑 6/6 PASS |
| C4 | execute / S1 fast_worker | FrozenPane 与共享 rowGeometry/window，hover、selection、scroll ownership、窄屏 | 完成；UI 行为由最终 Web 定向 suite 验收 |
| C5 | execute / S1 fast_worker | 补充 product-database Web fixtures/assertions | 完成；未改无关断言 |
| C6 | verify / S0 scout | 运行逻辑与 product-database 定向 suite、typecheck/build、100/500 取样 | 完成；147 项 144 PASS / 3 FAIL，范围内检查通过 |
| C7 | review / reviewer | 独立复核 blocker 与已修正项 | 完成；最终 0 blocker |
| C8 | execute / S1 fast_worker | 验收文档、检索入口、current-task 与 handoff 回填 | 完成；见 P11.2C 验收页 |

## 不变量与禁止事项

- Frozen Table 只是 Timeline 左侧只读投影，不创建新的 Table View/loader/store/row model。
- 两侧消费同一个 `layoutTimelineItems` 结果、rowIndex/top/height 与 page-host row window；不重复测量行。
- 独立读取 `options.timeline.frozenTable`，null 默认全列/默认顺序；稳定 ID、去重、忽略缺失 ID、Title 始终保留；不写回/改坏未知字段。
- 复用 Database 现有 formatter/Relation title cache；bar 与 Frozen 列可见 Relation 去重。
- TimelineViewport 唯一 horizontal scroll owner；现有 page host 唯一 vertical scroll owner。
- Header 共用 56px/同一 pinY；selection 来自 Record Host pageId，hover 用 recordId 临时状态。
- 不实现 column editor、property/date mutation、drag/resize、dependency、Timeline settings UI、Frozen 独立 View。
- 不重新设计 projection/coordinate/row layout，不改公共 API、schema、sync、MCP、版本或依赖。

## 验收结论

- 纯逻辑 28/28 PASS；完整相关 Playwright suite 147 项为 144 PASS / 3 FAIL / 0 skip / 0 flaky。三项失败是数据库 dialog 时序问题，不属于 Frozen 行为，未修改断言；逐条复跑 2 PASS / 1 FAIL，详见[验收页](../docs/verification/p11-2c-frozen-table.md)。
- Web typecheck/build、390px/desktop Light/Dark 视检、100/500 cache/window samples 与独立最终 review 完成；review 最终 0 blocker。
- 本阶段结论仅为 P11.2C Scope PASS。最终样本、失败与限制见[验收页](../docs/verification/p11-2c-frozen-table.md)。完成后停止，不进入 P11.2D。

## 已冻结 Implementation Brief

- 缺省或 `frozenTable.visible !== true` 隐藏；显示时只使用嵌套列配置。列 resolver 保留 schema 顺序/部分排序，去重忽略缺失 ID，Title 无条件保留；不 PATCH 或补写默认值。
- `frozenTable.ts` 只提供列选择与 recordId→propertyId→displayText map，不建立第二行列表；Title 直接用 Timeline item.title。
- parent `frozenColumns` / `frozenDisplayMap` computed 独立于 scroll/hover/zoom；两侧组件都消费同一 `rowGeometry`、window、bodyHeight。
- `FrozenTablePane` 并列于 `TimelineViewport`，header 共用 56px/pinY；cell 仅读 displayText，Title 点开共享 Record Host。
- Timeline 实例只新增 recordId 临时 hover；focus island 跨左右保留，selection 始终由 Host pageId 派生。
- Frozen 宽度限制在整体 45% 与约 480px 内；窄容器隐藏非 Title，Title 即使配置顺序靠后仍存在，Timeline min-width:0 继续横滚。
- NodeView 对 bar/Frozen 可见 Relation 取并集，仍使用原缓存、epoch、500 IDs/50 条批次与 10 batches 预算。
- 并行编辑边界：C3 仅 NodeView/frozenTable.ts/logic spec；C4 仅 Timeline UI/layout 常量；C5 仅 product-database.spec.ts。

## 实现、验收与停止状态（2026-10-13）

- 纯逻辑列投影提交 `0ed6d0f0a472b629acf2bc3e2f4270007a370a3b`（当时 5 个逻辑用例）；UI、Relation window/cache/pending 修补与最终测试提交 `2dfc8b723271d846d13a5da660e15304cbe26732`（最终 logic 6/6 PASS）。
- Frozen 配置 opt-in、共享 rows/window、56px/pinY、Host selection/open、recordID hover、单 page-host scroll 与 <=700px Title-only 规则已写入组件；`visibleRecords(scope, recordIds)` 以当前 `rowGeometry` 窗口通知 Relation cache。
- Relation pending request single-instance 去重、窗口优先/缺失缓存补取与 scope fence 已纳入最终验收。当前正式证据见[P11.2C Frozen Table](../docs/verification/p11-2c-frozen-table.md)。本阶段完成后停止，不进入 P11.2D；后续需新授权与具体范围定义。
