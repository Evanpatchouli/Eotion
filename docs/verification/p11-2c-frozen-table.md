# P11.2C Frozen Table

状态：**P11.2C Scope PASS**（2026-10-13）。本结论只覆盖 Frozen Table 范围，不代表完整 Product suite 全绿、P11.2 Read 完成或 P11 Final PASS。完成本阶段后停止，不进入 P11.2D。

基线 `84c0758`，分支 `codex/p11-2c-frozen-table`。正式版本保持 `0.0.1`，P11 目标版本 `0.0.3`。纯逻辑列投影提交为 `0ed6d0f0a472b629acf2bc3e2f4270007a370a3b`（该提交当时包含 5 个逻辑用例）；UI、Relation window/cache/pending 修补和最终测试提交为 `2dfc8b723271d846d13a5da660e15304cbe26732`，最终 Frozen logic suite 为 6/6 PASS。

## 实现边界

- `resolveFrozenTableProperties(properties, config)` 只读取 `options.timeline.frozenTable`。只有 `visible === true` 才显示；缺省或 false 隐藏。`visibleProperties: null` 使用 schema 全列，`propertyOrder: null` 使用默认顺序；部分排序稳定去重并忽略缺失 ID，Title 始终保留。不写回默认值或改写未知 outer options。
- `projectFrozenTableDisplay` 按 record ID / property ID 投影非 Title formatter 文本。Title 使用 Timeline item 的 `title`，不重复格式化。
- Frozen 与 Timeline 接收同一 `rowGeometry` 数组、48px row、当前 row window 与 focus island；Frozen 不建第二 row model，也不重新测量行。
- `FrozenTablePane` 是 `TimelineViewport` 的水平并列 sibling。Timeline scroller 仍是唯一水平滚动容器，`.document-wrap` / page host 仍是唯一垂直滚动 owner。两侧 header 共用 `TIMELINE_HEADER_HEIGHT = 56` 和 `pinY`。
- Title button 经现有 `openRecord` / singleton Record Host 打开记录。selection 由 Host 的 `selectedPageId` 派生；hover 使用 Timeline 实例内的 record ID 临时状态。焦点可跨 Frozen/Timeline 保留；scope 变化和虚拟行移除会清理相应状态。
- Frozen 行的 `v-memo` 依赖 row item、top/height、该 record display map、selected/hovered boolean。它避免水平几何刷新或 hover 使所有 Frozen cell 重渲染。
- 根容器 700px 及以下仅显示 Title，即使 Title 在配置顺序中靠后也保留。桌面 Frozen 宽度约 32%，上限 480px / 根宽 45%；窄屏不超过 `min(120px, 40%)`，Timeline 保持可收缩并继续横滚，不创建第二套移动 renderer。
- bar 与 Frozen 可见 Relation 合并去重，使用现有 formatter/cache/budget。当前窗口优先；窗口变化补查缺失缓存；scope fence 与 pending request single-instance 去重生效。保持每轮最多 500 IDs、每批最多 50 IDs、最多 10 batches、最多 3 个并行请求；正常分页仍会触发既有强制标题刷新。本轮没有证明所有查询都减少。

不包含 column editor、Property/Date mutation、drag/resize、dependency、Timeline settings UI 或独立 Frozen View；不改 API、schema、Domain/wire、MCP、sync、依赖、版本、coordinate/projection 算法或 row model。Title 省略、重复 ID 和缺失 ID 的防御用例直接注入 mock GET 响应，不代表真实 Create/PATCH 接受非法配置；服务端仍使用原共享 validator。删除后的合法 repair 响应沿用 P11.1D，本轮未新增服务端修复逻辑。

## 十点验收结果

| # | 验收点 | 结果 |
| --- | --- | --- |
| 1 | Frozen 配置独立于 bar 配置；opt-in、null 默认、Title 保留、排序/去重/缺失 ID | Logic 6/6 PASS |
| 2 | 非 Title display map 委托 formatter，Title 复用 item.title | Logic + Web 接线 PASS |
| 3 | 两侧共用 row geometry、48px 行高、window 与 focus island | 100/500 测试 PASS；同一 rows 引用及索引/几何对齐为 true |
| 4 | 两侧 header 共用 56px 与 pinY，列宽和行对齐 | 表头高度/偏移与行位置 DOM 断言 PASS；列宽共用 cell 样式并经 1440px/390px 视检 |
| 5 | 双向 hover、Host selection、Title openRecord、跨侧焦点 | Frozen 专项与 identity 相关用例 PASS |
| 6 | 仅 Timeline 横向滚动、唯一 page host 纵向滚动、Today 线仍可见 | Frozen 专项与截图视检 PASS |
| 7 | <=700px 隐藏非 Title、Title 置前；390px 无页面横溢且 identity 稳定 | Web 断言与 390×844 截图 PASS |
| 8 | Relation 列并集去重、窗口优先、cache/budget、scope fence 与 pending 去重 | 定向 Web 检查及最终独立 review PASS；标题 DOM 与请求去重断言 PASS |
| 9 | 100/500 的窗口、DOM、cache identity 与运行样本 | 下表记录；mock HTTP 浏览器样本，不作真实服务端或帧率承诺 |
| 10 | Table/List/Board、Host/Editor identity、typecheck/build、独立 review、diff/编码检查 | 相关回归、typecheck/build、review 与范围/编码检查 PASS；完整相关 suite 仍有 3 个既有失败 |

## 验证结果

命令（Windows / Playwright，`workers=1`、`retries=0`）：

```powershell
pnpm --filter @eotion/web exec playwright test tests/timeline-coordinate.spec.ts tests/timeline-projection.spec.ts tests/timeline-layout.spec.ts tests/timeline-frozen-table.spec.ts tests/product-database.spec.ts --workers=1 --retries=0 --output=test-results/p112c-full-final
pnpm --filter @eotion/web typecheck
pnpm --filter @eotion/web build
```

| 检查 | 实际结果 |
| --- | --- |
| 坐标 / projection / layout / Frozen logic | **28/28 PASS**：14 coordinate + 3 projection + 5 layout + 6 Frozen |
| 完整相关 Playwright suite | **147 项：144 PASS / 3 FAIL / 0 skip / 0 flaky**；Database 116/119。所有 Timeline Shell、generic/Frozen 专项、100/500、viewport、standalone/identity、Table/List/Board 相关检查通过 |
| 完整运行失败 | 见下表；未改写或削弱断言，也未扩展到这些旧流程 |
| 三项独立复跑 | **2 PASS / 1 FAIL**；`slash creates...` 保持失败，另两项复跑通过 |
| Web typecheck / build | **PASS**：`vue-tsc`、Vite、Service Worker generation。已有大 chunk 提示：`EotionEditor` 677.89kB（gzip 208.50kB），没有在本轮处理 |
| 独立 review / 最终 diff | reviewer 最终 0 blocker；root 完成最终视检，diff、UTF-8 无 BOM、CRLF 与范围检查 PASS |

三项完整运行失败都是数据库 dialog 未出现：

| 用例 | 完整运行 | 单独复跑 | 结论 |
| --- | --- | --- | --- |
| `database command separates back from cancel and keeps create and link choices on one row` | FAIL | PASS | 本次复跑未复现；原因未定性 |
| `slash creates a database table and preserves the reference ID after reload` | FAIL | FAIL | 稳定失败；P11.2A/B 的历史 `7b93617` 也有同名失败证据 |
| `linking a shared database adds only a reference and new records create pages` | FAIL | PASS | 本次复跑未复现；原因未定性 |

历史 A/B 证据不是本轮 fresh baseline。上述失败不属于 Frozen Table 行为，本轮没有借由此范围修复或重新定义它们；因此只声明 **P11.2C Scope PASS**，不声明完整 Product suite 全绿。

## 100 / 500 records 浏览器样本

样本通过既有 generic records HTTP seam 的 mock response 加载。耗时包括 Playwright 分页、UI 操作和 Relation 标题解析；浏览器资源采样为空。它们不是帧率、单帧耗时或真实 API benchmark。

| 项目 | 100 records | 500 records |
| --- | ---: | ---: |
| 已加载 records | 100 | 500 |
| temporal entries | 100 | 499（1 条未排期） |
| Frozen / Timeline DOM rows | 100 / 100 | 17 / 17 |
| display map entries | 100 | 500 |
| row reference / index rect alignment | true | true |
| row window | `[0,100)` | `[483,500)` |
| window height / total height | 4,800 / 4,800px | 816 / 24,000px |
| projection / temporal cache identity | true | true |
| Frozen map identity | true | true |
| generic GET pages | 4 | 20 |
| Relation POST batches（整个分页与操作累计） | 14 | 140 |
| 累计操作耗时 | 1,568ms | 4,233ms |

Relation POST 的 payload 仍遵守每批 50 IDs、每轮最多 500 IDs、10 batches 与 3 并行请求限制。`14 / 140` 是整个分页和操作期间累计批次，不表示每帧或每次 scroll 的请求量；强制标题刷新仍存在。`resolvedRelationTitleCount` 观测值为 null，因此不报告标题缓存总数。DOM 中的关系标题与 payload 去重断言通过。没有运行 5,000 条样本、native 真机、真实 Mongo/API/MCP 或全量 Product suite。

## 截图与后续边界

主 Agent 已视检四张 Light/Dark、1440×900 与 390×844 图：Title 即使配置在后仍在窄屏显示；两侧 header/rows 对齐；Today 线可见；页面无横向 overflow。PNG 与两个样本 JSON：

`C:/Users/31250/.codex/visualizations/2026/10/13/01a1347c-af29-7990-b6ef-31100182ff7d/timeline-frozen-table/`

Playwright 输出在 `apps/web/test-results/p112c-full-final/`；runner 临时日志为 `C:/Users/31250/AppData/Local/Temp/eotion-p112c-validation-a923687d0ce34b73ba728ae06bc8a276/` 下的 `full-playwright.stdout.log/json`、`failure-recheck.stdout.log/json` 与 `web-build-final.stdout.log`。完整运行约 4.2 分钟（252,227ms），独立复跑 17.23 秒。

P11.2C 完成后停止，后续 **P11.2D 需要新的明确授权**，范围尚未定义，不预设目标。获授权后从 `DatabaseTimelineView.vue`、`timeline/FrozenTablePane.vue`、`timeline/frozenTable.ts`、`layout.ts`、`useTimelineViewport.ts`、既有 Record Host 与 generic records/cache 接口阅读接续。drag/resize、Date edit、dependency、Timeline settings、column editor、独立 Frozen View 均未实现；offscreen indicator/jump 也仍在后续 read parity 边界内。
