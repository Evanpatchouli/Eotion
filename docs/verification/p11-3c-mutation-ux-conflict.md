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
  PATCH。保存期间 `DatabaseNodeView.writable=false` 传到 `DatabaseTimelineView`，使 bar 的
  `draggable=false`，resize handles 暂时卸载；bar 仍显示 pending 状态并可打开 Record。
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
| refresh 失败 | 保留 `refreshError` + `staleReadonly`，保持只读、结果仍未确认并返回 false；可沿用该错误重试加载，不以旧 records 声称已是最新 |

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

- resize handle 可 focus（controller 移除 resize `pointerdown.preventDefault`），`focus-visible` 环可见；
  bar marker 变体的 focus ring 收在圆形 marker 上。
- Escape 见 §3；mutation 提交后仅在 focus 丢失或落到 `body` 时恢复：捕获原 bar anchor DOM identity；
  原 handle 消失时只在同 anchor 找同 record 当前 control，或回退到该 bar。其他非 `body` 焦点（包括
  另一 bar、drawer、Frozen row、Table）不抢；恢复在 `nextTick` 后再核验 interaction token 与 scope。
- View switch / unmount 不产生 focus trap。
- `aria-busy`（saving）、`role="status"`（保存中）、`role="alert"`（conflict / failure）语义明确。
  `TimelineBar` 模板仍有 handle `aria-disabled` 分支，但保存期间 handles 卸载，因此不是可见 pending
  行为；只读/离线 bar 仍可打开 Record，不声明 `aria-disabled`。键盘方向键编辑日期仍留给 P11.5。

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
| 完整 `product-database.spec.ts` 全量 | **139 项：134 PASS / 5 FAIL**；5 项全部属于既有 Slash / Database dialog 基线浮动族（`database command` 行、Board view 选择器、2× slash 建库、link shared database），Timeline / Date / CAS / P11.3 路径 0 失败 |
| 基线浮动证明 | `linking a shared database …` 在基线 `d992425` 上 `--repeat-each=5` 亦为 **1 FAIL / 4 PASS**（同一断言 `数据库` dialog 5s 未出现），与 P11.2D/P11.3B 记录的基线失败家族一致，非 P11.3C 回归 |
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

### 任务书逐项覆盖对照

Logic（任务书 §20 十八项）：

| # | 场景 | 覆盖 |
| --- | --- | --- |
| 1 | idle → preview → cancel | `interaction.spec`「cancelPreview …」/「cancel from previewing …」 |
| 2 | idle → preview → pending → success | `interaction.spec`「interaction ledger …」+ Web#4 unknown-confirmed |
| 3 | pending → 409 → canonical refresh | Web#4 |
| 4 | pending → known failure → rollback | 既有 P11.3A/B failure 回归的 400 分支；Web#4 的 500 属于 unknown/transport 分支 |
| 5 | pending → unknown → verified success | Web#4（abort-after-commit） |
| 6 | pending → unknown → verified failure | Web#4（abort-without-commit） |
| 7 | Escape before commit = 0 PATCH | Web#2 |
| 8 | pointercancel = 0 PATCH | 既有 P11.3A failure 回归（真实 `pointercancel` 事件） |
| 9 | lostpointercapture cleanup | Web#2 |
| 10 | unmount during preview = 0 PATCH | Web#5（preview 期间切 View 使 bar 卸载） |
| 11 | view switch during preview = 0 PATCH | Web#5 |
| 12 | view switch during pending 的 stale scope 被忽略 | 机制由 `interaction.spec` token fence 覆盖；UI 层被 `viewBusy` fail closed（见 §14.1） |
| 13 | ABA identity fence | `interaction.spec` token/cancel 用例 + 既有 P9/P11.2D identity 套件；本轮 focus 的 scope/token 失效 guard 无独立 E2E 专项断言 |
| 14 | same Record double mutation blocked | Web#3 |
| 15 | no-op drag = 0 PATCH | Web#1 |
| 16 | no-op resize = 0 PATCH | Web#1 |
| 17 | offline pointerdown 不 preview | Web#6 |
| 18 | offline transition 取消 active preview | Web#6 |

Web（任务书 §21 十九项）：

| # | 场景 | 覆盖 |
| --- | --- | --- |
| 1 | Drag → Escape | Web#2 |
| 2 | Resize → Escape | Web#2 |
| 3 | pointer cancel cleanup | Web#2（lostpointercapture）+ 既有 A failure |
| 4 | save pending visual state | Web#3 |
| 5 | same bar pending 再次 drag blocked | Web#3 |
| 6 | 409 → canonical geometry refresh | Web#4 |
| 7 | known 4xx failure → preview rollback | 既有 P11.3A/B failure 回归的 400 分支；Web#4 的 500 按 unknown 处理 |
| 8 | unknown result → canonical verification | Web#4 |
| 9 | Table Date Cell 与 canonical 同步 | Web#4、Web#5 |
| 10 | View switch during preview | Web#5 |
| 11 | View switch during pending | Web#5（断言 switcher disabled 的 fail-closed 行为） |
| 12 | A → B → A stale response | token fence + 既有 P9 identity 套件（见 §14.1） |
| 13 | Drawer open + title/body draft 保持 | Web#5 |
| 14 | handle focus / Escape | Web#2、Web#3 |
| 15 | offline readonly | Web#6 |
| 16 | click bar 不触发 accidental mutation | Web#1 |
| 17 | tiny pointer movement under threshold 不 PATCH | Web#1 |
| 18 | Start/End source 继续 read-only | 既有 P11.3A/B 回归 |
| 19 | 390px feedback 不产生 document 横向溢出 | Web#3、Web#5 |

Web 编号（`tests/product-database.spec.ts`，grep `P11.3C`）：#1 equal/sub-threshold 手势、#2 Escape/pointercancel/lostpointercapture、#3 pending 视觉与忙锁、#4 conflict/network/unknown、#5 view switch 与 drawer draft、#6 offline。

### 独立复核与修复（2026-10-14，历史验收记录）

独立 reviewer 复核 `d992425..HEAD` 后发现 2 个必须处理的缺陷与 1 个 a11y 回归；主 Agent 逐条复现后全部修复并补回归：

| 级别 | 问题 | 修复 |
| --- | --- | --- |
| blocker | resize handle 复用 bar 的 click 处理，键盘 Enter/Space 或 Ctrl/Cmd/Shift/Alt+click 时 handle 激活会 fall through 到 `emit('click')` → 打开 Record，违反「handle 交互不得触发 Record open」 | 新增 `handleControlClick`：handle 一律 `preventDefault` + `stopPropagation` + `drag.click`，**永不** emit；bar body 保留 `handleClick`（旧实现即如此，本轮重构时被合并成同一个处理函数） |
| 缺陷 | `moveTimelineRecord` 只有 `endTimelineDateMutation`、从未 `beginTimelineDateMutation`（调试插桩清理时与插桩行一起被删除），导致 busy fence 恒空、`isTimelineDateMutationBusy` 恒 false，声明的作用域锁实际不存在 | 在 `savingCell = true` 之前 `beginTimelineDateMutation(dateMutationKey)`，失败即提前 return；`finally` 释放（该调用必然持锁，提前 return 的路径不进 `finally`） |
| a11y | bar button 在 `draggable=false`（只读/离线）时带 `aria-disabled="true"`，但它仍会打开 Record，读屏用户可能无法触达唯一主操作 | 移除 bar 的 `aria-disabled`。后续浏览器复核确认保存期间 handles 因 `writable=false` 而卸载，模板的 handle `aria-disabled` 分支不是可见 pending 行为 |

同时修正一处「声明有效但实际 no-op」的实现：`captureTimelineBarFocus` 原本在 pointerdown 处理器内读
`document.activeElement`（浏览器在处理器返回后才聚焦按钮），改为使用 pointerdown 的 `currentTarget`，
使 mutation 之后的 focus 恢复真正生效，同时保留「不抢 Drawer / Frozen row / Table 焦点」的判定。

补充回归（均并入 `P11.3C` grep）：handle 键盘 Enter/Space 与 Ctrl/Meta+click 不打开 Record；
bar 不声明 `aria-disabled`；pending 期间 bar 不 disabled 且焦点不落到 body；
**适配器忙锁集成用例**（页面内 `beginTimelineDateMutation` 预占 `recordId+propertyId` 后拖动 → 0 PATCH，
释放后再拖动 → 1 PATCH）；preview 期间切 View（bar 卸载）0 PATCH 且 interaction phase 回 idle。

### 2026-10-15 审阅修复（完成；不代表 P11.3 Final 验收）

本节记录 2026-10-14 历史验收后的审阅修复与本轮最终定向结果。上方统计仅代表 2026-10-14 历史验收；本轮数字见下文，不回写或覆盖历史结果。

- **Lost capture click 抑制**：`abortPreview()` 在清 active / 释放 capture 前设置 click 抑制，并让标记存活到后续 click 被消费。真实 lostcapture 定向用例 **1/1 PASS**；已提交 `53c98b5`。
- **Focus identity 与 resize focus**：focus helper 捕获原 bar anchor DOM identity。原 handle 已消失时，只在同 anchor 查找同 record 当前 control，找不到则回退到该 bar；任何其他非 `body` 焦点（含另一个 bar、drawer、Frozen row、Table）都不抢。controller 在 `nextTick` 后恢复前重新核验 token 与 scope；移除 resize controller 的 `pointerdown.preventDefault`。焦点定向 **4/4 PASS**；已提交 `c784b40`。scope/token 失效时的 focus 保护由实现 guard 保证，并复用既有 lifecycle 覆盖；本轮没有独立 E2E 专门断言这条 focus 分支。
- **Unknown refresh 失败**：refresh 失败后保留 `staleReadonly` / `refreshError`，当前 mutation 结果维持未确认并返回 `false`；只读与 retry 沿用该错误状态，不以旧 records 声称最新。参数化定向 **2/2 PASS**；已提交 `832cf28`。
- **Pending handles 实际状态**：保存期间 `writable=false` 经 `DatabaseTimelineView` 使 `draggable=false`，resize handles 卸载；浏览器观察到 `handleCount=0`。bar 仍显示 pending 状态且可打开 Record。模板里的 handle `aria-disabled` 分支通常不可达。只读/离线 bar 同样可打开 Record，不能标为 `aria-disabled`。

### 最终验证（2026-10-15，代码冻结后）

| 检查 | 结果 |
| --- | --- |
| Timeline 6 个 logic specs | **52/52 PASS** |
| `product-database.spec.ts` Timeline/Date/P11 定向 grep | **35/35 PASS**，`--workers=1 --retries=0`；P11.3C 当前 10 项（原 6 + 新 4），并增强原 2 项 |
| Web typecheck | **PASS** |
| Web production build | **PASS**；无 Vite chunk warning，仅有 `NO_COLOR` / `FORCE_COLOR` 环境提示 |
| Independent review | **无新增 blocker** |
| `git diff --check` | **PASS** |

复现输出目录：`%TEMP%\eotion-p113c-final-logic`、`%TEMP%\eotion-p113c-final-web`。未运行真实 API/Mongo、完整 Product 全量、native 真机或正式 benchmark；不沿用 2026-10-14 对这些项的历史数字。

命令：

```powershell
pnpm --filter @eotion/web exec playwright test tests/timeline-coordinate.spec.ts tests/timeline-projection.spec.ts tests/timeline-layout.spec.ts tests/timeline-mutation.spec.ts tests/timeline-interaction.spec.ts tests/timeline-frozen-table.spec.ts
pnpm --filter @eotion/web exec playwright test tests/product-database.spec.ts --grep "Timeline|timeline|P11\.3[ABC]|P11\.1B formats|409 refreshes the latest record version" --workers=1 --retries=0
pnpm --filter @eotion/web typecheck
pnpm --filter @eotion/web build
git diff --check
```

### 提交

| 提交 | 修复 |
| --- | --- |
| `53c98b5` | lostpointercapture 后 click 抑制；定向 1/1 |
| `c784b40` | focus identity / resize focus；定向 4/4 + typecheck |
| `832cf28` | unknown refresh 失败状态；参数化定向 2/2 |

### 覆盖口径更正

任务书 Logic 矩阵第 4 项的 500 响应属于 unknown/transport 结果，不能标为 known failure。确定性 4xx known-failure 由既有 P11.3A/B failure 回归中的 400 分支覆盖；Web#4 的 500 用例按 unknown 分支统计。

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
