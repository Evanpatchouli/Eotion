# P11.3C Timeline Mutation UX + Conflict

日期：2026-10-14（Asia/Shanghai）。**P11.3C 范围验收 PASS**（停止点为「实现 + 聚焦验收通过」）。
基线 `d992425`，分支 `codex/p11-3c-mutation-ux-conflict`，开始时工作树干净。正式版本保持
0.0.1，P11 目标 0.0.3。本轮只执行 P11.3C 的 UX/生命周期收敛，完成后停止，不进入 P11.3D。

## 1. 范围与链路

Drag / Resize 共用同一 interaction lifecycle，不新增任何 Timeline backend：

```text
pointer → InteractionLedger (idle → previewing → pending → idle)
        → useTimelineBarDrag（drag + resize 共用）
        → DatabaseTimelineView pending fence（record + property）
        → DatabaseNodeView moveTimelineRecord
        → 既有 generic Record Cell PATCH → Database/Record CAS + Mongo transaction
        → canonical refresh
```

不新增 endpoint、collection、DTO、queue 或 Timeline 专用持久状态；不改 domain/wire/API/MCP/sync。

## 2. Interaction State Machine（冻结）

新增纯模块 `apps/web/src/components/editor/timeline/interaction.ts`：

- `TimelineInteractionPhase = 'idle' | 'previewing' | 'pending'`，由
  `createTimelineInteractionLedger()` 作为**唯一 source of truth**。
- `begin()` 只在 idle 时成功并递增 token；`beginCommit()` 只在 previewing 时把当前 token 固化为
  in-flight token；`complete(token)` 只接受当前 token，返回 false 表示 stale/duplicate。
- `cancelPreview()` 只清本地 preview，**不**使 in-flight token 失效；`cancel()` 才会失效，
  用于 Escape / unmount。
- `TIMELINE_DRAG_THRESHOLD_PX = 4`：move 与 resize 共用同一 drag threshold。
- View 级 busy fence：`isTimelineDateMutationBusy` / `beginTimelineDateMutation` /
  `endTimelineDateMutation`，键为 `recordId + propertyId`，`reactive(new Set())`，供 Vue 响应式读取。

DOM 投影：`data-drag-state`（`idle|armed|dragging|saving`）保持兼容；新增
`data-interaction-phase`（`idle|previewing|pending`）、`data-saving`、`data-operation`。

## 3. Cancel 语义（冻结）

| 触发 | 结果 |
| --- | --- |
| Escape（previewing，focus 在 handle/bar 或窗口监听内） | 清 preview、0 PATCH、ledger 回 idle、focus 仍在 Timeline bar/handle |
| Escape（pending） | 只 detach UI callback；**不**假装撤销服务端 mutation，in-flight 响应仍自行清理 token |
| `pointercancel` | 清 preview、释放 pointer capture、0 PATCH |
| `lostpointercapture` | 同一语义；不会留下 stuck handle / stuck preview / 残留 cursor / 悬空 session |
| `window blur` / `visibilitychange → hidden` | 清 preview，不提交 |
| viewport transform / native scroll / scope / version / enabled 变化 | 清 preview；pending 不被误杀 |
| component unmount / View switch | preview 直接 cancel、0 PATCH；pending 请求可完成，但 UI callback 由 token 与 NodeView identity fence 共同保护 |

实现细节：Escape 在 preview 期间额外挂在 window（`AbortController` 一次性生命周期），
因此即使 focus 在 drawer 内也能取消；resize handle 不再 `pointerdown.prevent`，因此 handle 可
focus、可键盘 Escape。

## 4. Pending / Serialisation（冻结）

- pointer release 后进入明确 `pending`，bar 显示轻量 Quiet Studio feedback：`opacity: .72`、
  `cursor: progress`、`aria-busy="true"`、`data-saving="true"`、`role="status"` 文案「正在保存…」；
  不改变 row height、时间宽度或 bar 位置，不使用全屏 loading，不 remount Table/Record Host。
- 同一 `record + property` 在途时 `begin()` 立即 fail closed：不进入 preview、不产生第二个
  PATCH；handles 为 `aria-disabled` 且 `pointer-events: none`。
- NodeView `moveTimelineRecord` 用 `beginTimelineDateMutation` 二次确认，因此即使并发路径
  绕过 bar，也只会有一个 Cell PATCH。
- 既有 generic 层已是 database-wide 串行（`serializeDatabaseMutation`），Timeline **不重建
  queue**；第二个 mutation 若基于旧 Database version，由既有 CAS 拒绝而非双写。

## 5. 409 Conflict（冻结）

1. 不自动 retry；2. 不静默覆盖别人的修改；3. 不保留 stale optimistic position；
4. canonical refresh 后 bar 立即回到服务端日期；5. 低打扰 `role="alert"` 文案。

文案（不暴露 CAS / version / HTTP 409）：`日期已在其他位置被修改，已刷新到最新版本。`；
若 refresh 本身失败则回落 `日期已在其他位置被修改；刷新未完成，当前内容保持只读，请重试加载。`
并沿用既有 `staleReadonly`。

## 6. Known Failure

明确请求失败且服务端未接受时：清除 pending、回到 canonical、保留用户上下文、给出可理解反馈、
不自动 retry。bar 不允许停留在 preview 位置造成「看起来保存成功」。
4xx 文案：`日期未更新，已恢复当前记录。`（`errorMessage(cause, …)` 兜底）。

## 7. Unknown Result（冻结）

transport / 5xx 之后一律 `refreshLoadedWindow()` 重新核对 canonical，再比较 normalized value：

| 核对结果 | 行为 |
| --- | --- |
| canonical == command.value | 接受 canonical，文案 `日期已更新，提交响应暂未确认；当前记录已与目标一致。`，返回 true |
| canonical != command.value | rollback 到 canonical，文案 `提交结果暂未确认，已刷新为服务器最新日期。`，返回 false |
| refresh 失败 | `refreshError` + `staleReadonly`，保持只读并可重试加载 |

禁止：无脑 retry、timeout 再发一次 PATCH、假定失败、假定成功。

## 8. Offline / Readonly（冻结）

- Database 继续 online-only；offline 时 Timeline 仍显示，`data-draggable="false"`，
  pointerdown 立即 fail closed：不进入 preview、不创建 mutation session、0 PATCH。
- offline 发生在 active preview 时：view 的 `writable` 变 false 触发同步 watcher，preview 被
  cancel，不提交半成品。
- 与现有 Database readonly UX 一致，不新增离线队列。

## 9. Identity / Scope / ABA Fence（冻结）

沿用 P9/P11.2，每层各自核验：

- `useTimelineBarDrag`：interaction token + scope + record version + viewport transform。
- `DatabaseTimelineView`：`prepareTimelineDrag` 校验 `expectedDatabaseVersion`、
  `propertyId` 与当前 pending；`isBarViewportCurrent` 继续校验 native `scrollLeft`/width、
  origin、pxPerMs、scale、generation、displayTimeZone。
- `DatabaseNodeView.moveTimelineRecord`：`viewIdentityEpoch`、scope、DOM root identity、
  `data-view-id`/`data-view-ready`、Editor 内 node attrs、`viewReady`、`isEditable`、
  Database version、Record version、property type、原值一致性。
- View 级 busy fence 的 `finally` 释放与 identity 无关，避免 stale 响应把 record 永久锁死。
- 组件卸载时 in-flight 回调的 token 已失效，旧 A/B 响应不会污染新 scope。

## 10. Focus / Accessibility 基础

- resize handle 可 focus（移除 `pointerdown.prevent`），`focus-visible` 环可见；
  bar marker 变体的 focus ring 收在圆形 marker 上。
- Escape 见 §3；mutation 提交后按 identity 恢复 focus 到原 bar/handle，且**不会**从 drawer、
  Frozen row 或 Table 抢走 focus（`focus.ts` 只在 focus 掉到 body/丢失时恢复）。
- View switch / unmount 不产生 focus trap。
- `aria-busy`（saving）、`aria-disabled`（pending handle / 只读 bar）、`role="status"`（保存中）、
  `role="alert"`（conflict / failure）语义明确。键盘方向键编辑日期仍留给 P11.5。

## 11. Event Arbitration

- bar body pointerdown → move；start handle → resize-start；end handle → resize-end。
- bar body 与 handles 现在是**绝对定位的兄弟节点**（零尺寸 anchor 容器），handle 永不嵌套在 bar
  内部：handle 事件不会误触 move，也不会触发 Record open。
- 轻微点击 / 无意义移动（< 4px）不发 PATCH；超过 threshold 后 snap 回原值同样不发 PATCH。
- 「无移动的 bar body 手势」仍按既有语义打开 Record（click）；resize handle 的手势则被显式抑制，
  不会 fall through 到 bar click。

## 12. No-op Mutation

`normalizedValuesEqual` + NodeView 的 normalized 比较共同保证：drag/resize 结果与原 Date Value
normalized-equivalent 时不发 mutation。覆盖 legacy string、date object、explicit zero-duration range；
`normalizeDatabaseDateValue` 只在 `end` 存在时保留 `end`，所以 explicit equal end 与缺省 end 不会被
误判为相等，wire shape 语义被保留。

## 13. 验证结果

| 项目 | 结果 |
| --- | --- |
| Timeline logic | **52/52 PASS**（既有 43 + 新增 `timeline-interaction.spec.ts` 9） |
| Timeline Web 回归 | **31/31 PASS**（既有 P11.3A/B 13 + 新 P11.3C 6 + 既有 Timeline/Date/CAS 12），workers=1/retries=0 |
| 新 P11.3C Web | 6/6 PASS（见下表） |
| 真实 API/Mongo | **19/19 PASS**，0 fail/skip；隔离实例 27717 / replicaSet `p113cFinal` / 独立 dbpath，MongoDB 8.2.3；已优雅 shutdown，27717 无监听；用户 27017 未触碰 |
| Web/API typecheck + build | PASS（保留既有 `EotionEditor` chunk >500 kB 提示） |
| `git diff --check` | PASS |

新增 logic（`tests/timeline-interaction.spec.ts`，9）：ledger 唯一所有权、stale/duplicate token
fence、`cancelPreview` 不失效 in-flight token、`cancel` 失效并重置、preview cancel 推进 token、
shared drag threshold、同 record+property busy 串行、跨 record/property 独立与释放、未知 cleanup 幂等。

新增 Web（`tests/product-database.spec.ts`，6）：equal/sub-threshold 手势（0 PATCH、0 Record open
除既有 click 语义）、Escape/pointercancel/lostpointercapture 取消（0 PATCH、focus 保留）、
pending 视觉 + 同 record 阻断 + 其它 record 串行 + offline 切换 + 390px 无横溢、409/known failure/
unknown-confirmed/unknown-unconfirmed 的 canonical 核对与文案、pending View switch fail-closed +
canonical Table 同步 + Drawer draft 保留、offline fail closed 与 active preview 取消。

测试口径：不把 mock 通过当作真实 Mongo 证据；局部 DOM 观察不等于帧率 benchmark。

## 14. 已知边界与发现（重要，勿误读）

1. **View switcher 在 pending 时是 disabled**：`DatabaseNodeView` 的 `切换视图` 按钮
   `:disabled="viewBusy"`，而 `viewBusy` 含 `savingCell`。因此「pending 时切 View」在 UI 层
   **fail closed**，无法用真实点击复现切换。Web 测试据此断言 disabled；跨 View stale callback
   的不变量由 logic spec 的 token fence 覆盖。P11.3D 若要允许 pending 期间切 View，需先明确
   是否放宽 generic busy guard。
2. **无移动的 bar body 手势会打开 Record**（既有 click 语义），包括 drag 后 snap 回原值的往返。
   测试按该语义断言（必要时关闭 drawer），并额外断言 handle 手势不会打开 Record。
3. **preview 期间无法用鼠标点击 toolbar**：bar 持有 pointer capture，视角切换只能在 pending 或
   非拖动态进行；这是浏览器 pointer capture 的固有约束，不是缺陷。
4. 未实现（明确延期）：独立 Start/End multi-cell、Dependency / auto shift、bulk/multi-select、
   Undo/Redo、offline queue、Calendar、Timeline settings UI、P11.5 视觉/标签密度 polish。
5. 未运行：完整 Product 全量、P11 Final、native 真机、正式 FPS benchmark、真实截图对比基线。
6. 本轮无 API / model / Mongo / MCP / sync / version 改动；`abortCellUpdatesWithoutCommit` 只是
   测试 harness 的新 mock 开关，用于构造「transport 失败且服务端未落库」的 unknown 分支。

## 15. 文件与入口

| 变更 | 文件 |
| --- | --- |
| interaction lifecycle + busy fence | `apps/web/src/components/editor/timeline/interaction.ts`（新） |
| focus 捕获/恢复 | `apps/web/src/components/editor/timeline/focus.ts`（新） |
| drag/resize controller | `apps/web/src/components/editor/timeline/useTimelineBarDrag.ts` |
| bar/handle DOM 与 pending 反馈 | `apps/web/src/components/editor/timeline/TimelineBar.vue` |
| busy map 透传 | `apps/web/src/components/editor/timeline/TimelineViewport.vue` |
| pending fence + adapter | `apps/web/src/components/editor/DatabaseTimelineView.vue` |
| Cell PATCH / conflict / unknown 文案 | `apps/web/src/components/editor/DatabaseNodeView.vue` |
| logic 回归 | `apps/web/tests/timeline-interaction.spec.ts`（新） |
| Web 回归 + harness | `apps/web/tests/product-database.spec.ts` |

## 16. 提交与停止

见 `.agents/handoff.md` 的 P11.3C 小节与最终报告中的 commit SHA。

**P11.3C 范围验收 PASS 不代表：** P11.3 Final Acceptance、Dependency 完成、Timeline P11 Final 完成。
P11.3D 仍需独立授权与独立 Mutation Acceptance。

Separate Start/End mutation requires generic transactional multi-cell Record mutation. Before that
capability exists, range move/resize remains read-only.

## 17. P11.3D 精确接续入口

- 决策入口：是否允许 pending 期间切 View（当前被 `viewBusy` fail closed）；multi-cell
  Start/End 的 generic 契约；Undo 的跨 mutation 语义。
- 代码入口：`timeline/interaction.ts`（ledger / busy fence）、`timeline/useTimelineBarDrag.ts`、
  `timeline/TimelineBar.vue`（handles/focus/pending）、`DatabaseTimelineView.vue` 的
  `pendingTimelineMutations`、`DatabaseNodeView.vue` 的 `moveTimelineRecord`。
- 测试入口：`tests/timeline-interaction.spec.ts`、`tests/product-database.spec.ts` 的
  `P11.3C` grep；helpers `dragTimelineBar`、`closeTimelineDrawer`、`p113bResize`。
- 不变量：single Date Property、共享 ledger token、409 no-retry、unknown canonical 核对、
  offline fail closed、identity/ABA fence、`normalizeDatabaseDateValue` 的 wire shape 保留。
