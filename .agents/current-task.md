# 当前任务：P11.3C Timeline Mutation UX + Conflict（范围验收 PASS，完成并停止）

基线 `d992425`，工作树干净；分支 `codex/p11-3c-mutation-ux-conflict`。版本保持 0.0.1，目标 0.0.3。
只执行 C 的交互生命周期/取消/冲突/offline/identity/focus 收敛，完成后停止，不进入 P11.3D。

| 单元 | 模式 / 难度 / 角色 | 输出 | 状态 |
| --- | --- | --- | --- |
| C1 | investigate / S0 scout | temporal/adapter/handle 既有行为 Evidence Pack | 完成 |
| C2 | decide / S2 主 Agent | 统一 ledger / cancel / pending / busy fence Brief | 完成 |
| C3 | execute / S1 主 Agent | `interaction.ts` + `focus.ts` 纯逻辑 | 完成 |
| C4 | execute / S1 主 Agent | controller / bar DOM / view fence / NodeView 文案接线 | 完成 |
| C5 | execute / S1 主 Agent | logic 9 + Web 6 新回归与 harness | 完成 |
| C6 | verify / S0 主 Agent | 逻辑 52/52、Timeline Web 31/31、全量 product-database 134/139（5 失败为基线浮动）、typecheck/build、隔离 Mongo 19/19 | 完成 |
| C8 | verify / reviewer + S1 主 Agent | 独立复核 3 项（handle click / busy fence / aria-disabled）复现修复与补回归 | 完成 |
| C7 | execute / S1 主 Agent | 契约、验收、handoff 与提交 | 本文件所在提交 |

不变量（冻结）：single Date Property；drag/resize 共用 `idle→previewing→pending→idle` 与单调 token；
4px shared threshold；同 record+property 串行（既有 generic database-wide 串行 + Timeline fence）；
409 只 canonical refresh 不 retry；known failure 回退；unknown 一律 refresh 后按 normalized value
接受或保持 uncertain；offline 立即 fail closed 并取消 active preview；identity/ABA fence 不变；
handle 与 bar body 是兄弟节点；no-op 不发 PATCH；date-only/datetime wire shape 保留。

验收入口：`docs/verification/p11-3c-mutation-ux-conflict.md`。

独立复核（reviewer）发现并已修复：resize handle 的键盘/修饰键激活曾会打开 Record；
`moveTimelineRecord` 的 busy fence 只有 release 没有 acquire；bar button 在只读时错误声明 `aria-disabled`。
另修正 `captureTimelineBarFocus` 的捕获时机。补充回归见验收页「独立复核与修复」。逻辑 52/52（新 9）、Timeline Web
31/31（新 P11.3C 6）、真实隔离 Mongo 8.2.3（27717 / replicaSet p113cFinal）19/19、Web/API
typecheck+build PASS。隔离实例已优雅 shutdown，用户 27017 未触碰。

已知边界：View switcher 在 `viewBusy`（含 `savingCell`）时 disabled，因此 pending 期间切 View 在
UI 层 fail closed，Web 测试断言 disabled，跨 View stale callback 由 logic spec 覆盖；无移动的 bar
body 手势仍按既有语义打开 Record，handle 手势不打开；preview 期间 pointer capture 使 toolbar 不可
点击。仍未实现 multi-cell Start/End、Dependency/auto shift、bulk、Undo/Redo、offline queue、
Calendar、settings UI、P11.5 polish；未新增任何 Timeline backend API。未运行完整 Product/P11 Final/
native 真机/正式帧率 benchmark，不发布不改版本。

完成 C 后停止。D 接续入口：`timeline/interaction.ts`（ledger/busy fence）、`focus.ts`、
`useTimelineBarDrag.ts`、`TimelineBar.vue`、`DatabaseTimelineView.vue` 的
`pendingTimelineMutations`、`DatabaseNodeView.vue` 的 `moveTimelineRecord`；测试复用
`tests/timeline-interaction.spec.ts` 与 `product-database.spec.ts` 的 `P11.3C` grep。D 必须独立
授权，先决定是否放宽 pending 期间切 View 的 generic busy guard。
