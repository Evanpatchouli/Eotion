# P11.4B Dependency Editing

日期：2026-10-16（Asia/Shanghai）。基线 `1eb5e5db5c29bd97aa3a13ea4c39812c80bcd64c`，
分支 `codex/p11-4b-dependency-editing`，开始工作树干净。版本保持 0.0.1；P11 目标版本 0.0.3。
本轮仅创建/删除 Dependency，不执行日期偏移，不进入 P11.4C/D。

**Final verdict：PASS；P11.4B Dependency Editing COMPLETE，完成后停止。**
独立 review 最终0个 P1/P2 blocker。P11.4C/D、P11 Final 与0.0.3发布没有完成。
实现提交：`25ba107`（mapping/logic）、`aa77aa9`（interaction/adapter）、
`e464c2e`（action/ownership fence）、`db3c3ea`（touch/target safety）。
验收提交：`f13f3f8`（Web 27项 / API Relation追加门禁）；文档提交包含本报告，最终 SHA 以交付消息为准。

## 1. Evidence Pack 与写入边界

`DatabaseNodeView.setRelation` → `updateProductDatabaseRecordCell` → SDK 现有 generic Cell PATCH
→ `DatabaseService.updateRecordCell` → `assertRelationValues` / Record CAS / Mongo transaction。
没有新增 entity、collection、backend endpoint、Timeline-specific Relation API 或新依赖。

Relation wire 为最多 50 个 unique stable Record ID 的 `string[]`，现有 normalizer 不重排。
Web adapter append/filter 保序。服务端先 Database CAS/bump，验证当前 Relation property、同 workspace
target Database/Record 引用，再执行 Record CAS；事务失败回滚 Database bump 与 Record 更新。
generic service 同 Database 序列化保留；NodeView 在 await 前设置 `savingCell`，阻断再次使用旧版本。

服务端既有测试明确允许 self Relation 和有向环。Timeline UI 额外禁止 semantic self 与 duplicate，
不添加 DAG validator。Cycle scheduling semantics deferred to P11.4C Auto Shift Policies.

## 2. 冻结语义、原子性与 canonical source

用户从 source Bar 的 outgoing handle 拖到 target Bar，永远表达 predecessor → successor。
纯 `resolveDependencyRelationMutation` 被 create/delete 共同调用：

| direction | semantic edge | 唯一 owner Cell | create / delete 的 related ID |
| --- | --- | --- | --- |
| depends-on | B → A | A.relation | 加入 / 移除 B |
| blocks | A → B | A.relation | 加入 / 移除 B |

Create stable dedupe 后 append，Delete filter 指定 ID，保留其他 Relation 及其顺序；完整 Cell
value 一次 PATCH。重复 create 与 missing delete 为 no-op，0 PATCH；missing delete 刷新 canonical。
不写第二侧，不写 Date。最终边只来自 canonical Relation Cell → `projectTimelineDependencies`
→ shared geometry → SVG，不保存第二套永久 edge store。

## 3. Interaction、geometry 与 accessibility

可写 Bar hover/focus 显示 button connector；粗指针始终显示且扩大 hit area。anchor 复用 raw
visual end / point center，handle 的命中偏移不改变真实 anchor。拖线只更新 transient pointer /
candidate；preview 使用 P11.4A `layoutTimelineDependency`，合法 Bar 上吸附 successor anchor。
只允许当前 rendered、scheduled Bar；filtered/unloaded/unscheduled 目标没有 picker、自动加载或 GET。

透明宽 stroke hit path 选中 stable semantic edge ID；visual path 不参与 Tab，Bar/resize handle
在 hit layer 上方。单独 keyboard control 可用方向键选边、Delete/Backspace 删除，Escape 关闭。
首次点击管理只选择，不删除；删除控件 label 包含 predecessor/successor 标题。
canonical refresh 后仍存在的 edge 可保留 selection，消失则清空；scope change 必须清空。

dependency handle 不触发 Date drag/resize、Record open；Bar body/resize 继续 P11.3 行为。
active linking 与 Date interaction 互斥。提交中显示 saving status / aria-busy；未确认前不伪装为成功。
粗指针 connector 命中区为 28×20px，位于行内 y=28..48，保留 point Bar / resize 中心可触达。
linking 命中同一 rendered Bar 的 connector/resize 控件时仍按该 Bar 作为目标，不启动第二操作。
触控删除直接处理 primary Pointer Events，不依赖合成 click；首 tap 仅选择，第二 tap 删除，
随后合成 click 被抑制，避免重复激活；鼠标和键盘继续原 click/action 路径。
Escape、pointercancel、lostpointercapture、blur、hidden、unmount、scope/config/viewport change、
offline 都清 linking preview、释放 capture，取消不 PATCH。pending Escape 不能撤销已发写入。
离线仍显示 canonical lines，可选边查看；create/delete fail closed，不建立离线 mutation queue。

## 4. Session、CAS、conflict 与 unknown

pointerdown 捕获 user/workspace/database/view/block、scope/identity epoch/DOM root、property ID /
version、direction/完整 dependency config fingerprint、Database version、loaded records 的原始
Relation 与 Record version。depends-on 的 owner 可能是稍后命中的 successor，因此起点捕获
整个 loaded Relation 快照；release 不读取新版本。Delete 在动作开始捕获同一上下文。

提交重新验证 Editor 文档 block/View identity、root connected、可写、property/self target、
direction/config/property identity、Database/Record version 与原始 Cell。过时配置 fail closed，
不自动改选 Property；不自动刷新版本后重试 mutation。已提交请求的实例归属与可编辑性分开，
同实例临时只读仍完成 canonical reconciliation，并按 epoch/scope/root 归属释放 busy flag。
Dependency 启动/提交用 live `canEditTimelineDependency`，不缓存 Tiptap 的非响应式 `isEditable`。
人工 `setEditable` 回归只验依赖续写，不扩展为通用 toolbar 的只读切换验收。

409：清 transient，canonical loaded-window refresh，P11.4A rebuild，0 retry；提示
“依赖关系已在其他位置发生变化，已刷新到最新版本。”刷新失败保持 staleReadonly。
确定性 4xx：清 pending/preview，保留 canonical，给出可理解错误，不 retry。
网络/5xx：刷新 canonical 后比较 related ID membership；create 包含 / delete 不包含确认成功，
相反确认未应用。刷新失败、owner 不在 refreshed loaded window 或配置已不能确认语义时，
保持 staleReadonly/result uncertain，用户仅能重新读取 canonical，不重复 PATCH。

## 5. 已执行验证与证据

- Timeline logic：86/86 PASS（原 59 + 新 27）。
- Web typecheck / production build：PASS；既有 >500 kB chunk 提示保留。
- Domain：48/48 PASS；Contracts：25/25 PASS；本轮文本 UTF-8 无 BOM 检查通过。
- 隔离 Mongo Domain：16/16 PASS。
- 完整 HTTP：6/6 + sync 1/1 + file 24/24 = 31/31 PASS。
- 增补 Relation 回归后 Database HTTP：5/5 PASS。
- P11.4B Web：27/27 PASS（单 worker、retries=0）。
- 首轮完整 Database：178/180；两个非 Timeline 失败在最终源定向复跑 2/2 PASS，见下述记录。
- **最终完整 Database：180/180 PASS**（单worker、retries=0，最终生产源与清理后的验收文件）。
- P11.3 Date drag/resize/no-op/409/point及range round-trip/Start-End read-only、offline、unknown、
  identity与100/500，以及P11.4A全部8项均在最终完整批次通过，无Date mutation回归。

真实 HTTP 增补验证 ordered create、GET/Mongo persistence、delete 后其他 ID/顺序保留、
stale Database CAS 不 bump、stale Record CAS 回滚先前 Database bump。既有 Domain/HTTP
覆盖 duplicate、max50、self Relation、cycle、跨库引用与 transaction validation。
Mongo 8.0.12 使用新 TEMP dbpath、61591 随机端口、replica set `p114b7e4c42c6`，未访问27017。
实例已 admin shutdown，PID 46264 不存在，61591 无监听；不删除原始证据。

原始日志：

- `TEMP/eotion-p114b-logic-20261016-main.log`：86项 logic。
- `TEMP/eotion-p114b-build-acceptance-final-20261016.log`：最终 production build；version check保持0.0.1/build2。
- `TEMP/eotion-p114b-final-verify-6eba12d40b8d48be884f8a0c607ef3e0.log`：Domain/Contracts/
  Web typecheck/UTF-8 检查。
- `TEMP/eotion-p114b-relation-cf4017e8d342400e927f5ef012d180c0/`：Mongo、API build、Domain、
  完整 HTTP 与增补 Database HTTP 原始日志。
- `TEMP/eotion-p114b-suite-final-ed7873d087d04a98887eee93335ef6ed.log`：27项 B、性能与截图路径。
- `TEMP/eotion-product-database-full-2415ac9d02f74880a9b56dbb13bf5d5c.log` 及同 ID output：
  首轮完整180项，178 PASS/2 FAIL；Board draft title 期望新草稿、实际旧标题，List 空标题按钮未找到。
- `TEMP/eotion-database-failure-repro-1a423cbb41a645b19ae823bd7f74e613.log`：上述两项定向2/2 PASS。
  不将单项通过解释为基线已证实，也不隐藏原始批次失败。
- `TEMP/eotion-product-database-final2-bc13e7869a4d45e29f540989a8d45cb8.log` 及同 basename output：
  **最终180/180 PASS**。首轮两项在定向与最终完整批次都通过，记录为首轮不稳定，不称基线缺陷。

### 100/500、N+1 与视觉

| loaded Records | projected edges | generic loaded-window GET | 额外 Record 请求 | 无关 path DOM / Bar Vue updates | preview layer Vue updates |
| --- | ---: | ---: | ---: | --- | ---: |
| 100 | 10 | 4 | 0 | 0 / 0 | 4 |
| 500 | 50 | 20 | 0 | 0 / 0 | 4 |

真实 pointermove 期间 projectedItems/temporalMap/dependencyEdges 与 geometry/window edges 引用稳定，
无关 Bar/Path 节点身份保持；500 行仍使用共享有界 row window。pointermove 0 PATCH；selection
不重投影 records/edges。仅展示 Title/Date，隔离既有 Relation title resolver；不声称其他显示列
永远不请求标题。以上为固定样本 DOM/Vue 更新观察，不是 FPS benchmark。

主 Agent 已视检 Desktop 1440×900 Light/Dark 与390×844 Light/Dark、linking preview、selected /
delete action；Frozen/Today/Bar/edge 层级可辨，无 document 横向 overflow。截图位于
`TEMP/eotion-p114b-web-1792089294525-38892-0737e71ef587c8/`（主Agent视检），最终完整批次同样产物在
`TEMP/eotion-p114b-web-1792089895551-37380-9a230826790f3/`。后两张文件名虽含 light，实际沿用
theme loop 最后的 Dark；报告按真实 Dark 判读，不将文件名当模式证据。未做 P11.5 像素级 polish。

390 粗指针使用独立 hasTouch/isMobile Chrome context 与原生 CDP touch events，确认
`pointerType=touch`、coarse media、Bar/resize center 与 connector overlap 命中；创建/选择/删除
恰好2次 Relation PATCH、0次 Date PATCH、pageerror=0。依赖目标包含 Bar 自身的扩展控件区域，
仍须同 row/record/canvas/rendered，未以 unresolved picker 绕过命中门禁。

### 发现与修复

独立 review 与实际浏览器门禁修复了：首次管理 click 误删、pending 临时只读跳过 reconciliation /
busy 释放、非响应式 editability 缓存、coarse connector 遮挡 point、touch 不合成 click、
non-primary touch 污染 armed，以及非 Element 全局事件 target。最终同一 reviewer 复核无 P1/P2 blocker。
Vue fixed Date.now 下的 invoker 时间戳问题通过只在 linking active 时注册 capture guard 避免；
最终 tests 保留原固定时间，没有 +1秒 workaround。初轮目标日期在 viewport 外、空 graph 没有
delete control、row-window/scroll、SVG 取样等 harness 错误的日志留在 TEMP，各次使用唯一名称。

未运行：完整 Product 的其他13文件、Web连真实API全链E2E、Electron/Lynx真机、正式FPS、
独立截图baseline diff、P11.4C/D/P11.5/P11 Final/发布。真实HTTP/Mongo与Web mock分别陈述，不混为一条全链证据。

## 6. P11.4C 精确接续入口

本轮完成后停止。P11.4C 先读取本报告、`docs/p11-timeline.md` 与 renderer 架构，再从
`TimelineDependencyOptions.shiftMode/avoidWeekends`、`timeline/dependency.ts` 的 canonical graph、
`dependencyMutation.ts` 的 semantic mapping、NodeView generic Cell adapter 进入独立策略设计。
先冻结 cycle/DAG、重叠与间隔、周末、跨 loaded window、多 Cell 原子性和 unknown-result 契约，
再决定实现；single Relation Cell 的 PASS 不授权 sequential Date PATCH 或自动级联移动。
本轮没有 settings UI、unresolved picker、unscheduled linking、Undo/Redo、bulk/multi-select，
这些均不作为 B 的 blocker。
