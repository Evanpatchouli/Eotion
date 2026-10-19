# P11.4D Dependency Final Acceptance

日期：2026-10-19（Asia/Shanghai）。基线 `2f84ef5ca560bbcd6e8afa06b14ab1d8252bb743`。
开始分支 master，HEAD 与 fetch 后 origin/master 一致，工作树干净。
版本保持 **0.0.1 / build 2**；本阶段仅 D1–D4，完成后停止，不进入 P11.5 / P11 Final / 发布。

**Final Verdict：PASS（P11.4D Dependency Scope），COMPLETE。**
不等于P11 Final或完整Product Acceptance；完成后停止。

## Evidence Pack 与决定

读取项目/用户规范、文档地图、P11 date source/View config/Final matrix、renderer §28–30、
通用 Cell mutation 架构、A/B/C 验收及 C 接续证据后，按调查、决策、执行、验证拆分。
Dependency 永久来源仍是现有 self Relation Cell；不新增模型、API、候选查询或依赖。

### D1 键盘创建 Brief

现有 connector 是可聚焦 button，但 click 被吞掉，只有 Pointer Events 能启动创建。
冻结交互：Enter/Space 从来源 connector 启动；焦点留在来源，上下/左右方向键循环选择当前
rendered scheduled 的合法目标，Home/End 选首末；Enter/Space 确认，Escape/Tab 取消。
候选排除 source、已有 semantic edge 和未渲染目标；没有合法目标时明确提示，不发请求。
复用 previewEdge/geometry 和 mutateDependency，持久 aria-live 宣告目标、快捷键和结果。
取消与确认前复核沿用 scope/config/viewport/online/writable/DOM root 等 fence；目标消失
fail closed。结果返回只恢复同实例仍由本交互占用或丢失的焦点，不抢新 View 或其他控件。

首轮真实 setEditable(false) 用例发现 active preview 未取消：Tiptap 的 isEditable 是非
响应式 getter，原 Timeline writable 未消费它。提交 liveguard 虽阻止写入，但预览仍滞留。
独立review进一步确认正式Editor会调用setEditable(...,false)，不发update/transaction，不能只
订阅这两个事件。最小修复为NodeView观察Editor view DOM的contenteditable属性，同步仅供
Timeline的reactive editable，卸载disconnect；保留capture/commit liveguard。回归保持真实
Editor silent false→true并核对DOM属性，不以props注入替代。

实现提交 `5f7f56c`，最终D1 Web **15/15 PASS**（workers1/retries0）。真实Enter/Space
创建分别覆盖depends-on单Cell和blocks active batch；候选循环/Home/End排除self/duplicate/
unscheduled/filtered，另验无候选、Escape/Tab、offline、真实silent readonly、config/scope、
目标消失、pending单次提交/成功focus、4xx失败focus、A→B→A旧完成回调隔离。
同一视觉用例循环1440×900、768×1024、390×844与Light/Dark，6张PNG已由主Agent视检，
操作文字完整换行、目标高亮和preview可见，无document横向overflow；这不是P11.5像素polish。
截图位于TEMP `eotion-p114d-keyboard-1792384907428-48192-5a20eb9f650fb/`。

D1原始产物限制：各次focused stdout/stderr只在工具调用记录中，未重定向为文件，不能提供
其完整文本日志。初始readonly红证据已由主Agent读取：TEMP
`eotion-p114d-keyboard-focused-20261019/product-database-P11-4D-ke-2c63f-ycle-change-without-writing/error-context.md`
明确Expected preview0/Received1/5000ms。首批12/14（readonly和视觉），修复批14/15（视觉
布局未稳定）；另一次readonly属性断言误查wrapper，随后改为真实ProseMirror DOM。
中间曾用viewport props注入隔离hook，不能当正式readonly证据；最终用例恢复真实silent
setEditable(false,false)，DOM只读、零写入及恢复可编辑均通过。
13项中间grep漏掉pending/stale，不计作完整D1；最终15/15的Playwright产物目录为
`eotion-p114d-keyboard-final-20261019/`。各轮目录独立保留，不补造缺失日志；最终完整
Database批次会另外保留完整stdout/stderr，包含全部D1回归。

### D2 receipt 反馈

确认 active Date 与 dependency create 两处 not_committed 分支，仅在 canonical refresh
失败时设置 mutationError；成功刷新清空 staleReadonly，导致用户只见撤销而无结果说明。
修复边界：确认未提交后明确提示；committed 不报失败，uncertain/receipt 读取失败继续未知
及只读；保留 refresh/scope guards，不重试 mutation，不依据单个 root 值推断整批结果。

实现提交 `a1c2f4f`。D2 Web 12/12 PASS（workers=1/retries=0），两种操作分别验证
committed/not_committed/uncertain/receipt-read-failure、canonical refresh 失败和 scope 变化。
修前缺提示失败保留于 TEMP `eotion-p114d-baseline-5644299ea86145f6957d231a63ea43b8.log`；
该批次也包含测试 alert selector 歧义，修正为针对 mutationError/stale 状态后验证，不能把所有
初轮失败都称为产品缺陷。最终日志 `eotion-p114d-green-final-19ea54da527d470f9c71fc68c7bbcff8.log`。

### D3 Separate Start/End 精度

确认 Date 的同精度规则只约束同一 Cell，Start/End source 的两个 Property 不存在跨 Cell
同精度要求；因此支持合法混合 Cell，删除 planner 的额外拒绝。finish 由 End kind 决定，
date-only 为 UTC 次日边界，datetime 为精确 instant。混合移动量按独立精度量化，保持每 Cell
内部范围、wire、timezone 与毫秒；明确规则见 [renderer §31](../architecture/timeline-renderer.md#31-p114d-dependency-final-acceptance)。
现有 renderer mixed 未排期诊断和手动 Start/End 只读保持，不声称混合 Bar 可视化支持。

Domain 92/92 PASS（此前86项，本轮新增6项）；测试包括两种 Start/End 精度方向、End 日包含
边界、反向范围、各 Cell 内部 range、Tokyo/LA 时区、毫秒、春秋 DST/周末、0000 年与9999
溢出。纯旧 planner 加新 scheduling tests 的红测39/44，五个混合精度用例因 invalid-date
失败；另一次脚手架把已有 range 的结束边界算错，已修 fixture，未削弱产品断言。
红日志在 TEMP `eotion-domain-d3-red-8222308c285c40a3b69f7d03bb0d6003/domain-red.log`，
最终全包绿日志 `eotion-domain-d3-green-313cabc9eb374e2cabb19ecd964df55c.log`。

实现提交 `965fa0e`。真实 HTTP Separate source 用 Relation-create root+context 触发，验证
两个 mixed successor 方向各自的精确 wire 持久化/重读、committed receipt、DB整批+1、
每 changed Record +1；invalid range/overflow为400、not_committed，Relation和Date/版本
全部不变。它是一个聚合测试，不把多个断言虚报为独立测试。三HTTP文件总18/18通过。

## 分层验收矩阵

纯 Domain 证明算法/契约；Web mock transport 证明交互/状态；真实隔离 Mongo/HTTP 证明
持久化/CAS/事务/receipt。三者分别陈述，不拼成未运行的 Web→API→Mongo 全链。

| 领域 | 证据入口 | 本轮结果 |
| --- | --- | --- |
| Projection / geometry / direction / fail closed | timeline-dependency、projection/layout logic；A Web | logic PASS，A 8/8 |
| Create/delete / Relation order / self/duplicate | dependency-mutation logic；B Web；真实 HTTP | logic/HTTP PASS，B 27/27 |
| Keyboard / focus / live feedback / cancel | D1 Web | 15/15 PASS |
| Pointer/touch / Date arbitration | B Web、P11.3 | B 27/27、P11.3 25/25 |
| Three policies / chain / diamond / incoming | scheduling Domain；C Web；HTTP policy matrix | Domain/HTTP PASS，C 14/14 |
| Date semantics / mixed precision / DST / weekend / wire | Domain 与真实 HTTP | PASS |
| Graph safety / limits / unscheduled / cycle | scheduling Domain、真实 HTTP | PASS；每项按实际证据层说明 |
| Atomicity / CAS / rollback / versions | 真实 Mongo/HTTP | PASS |
| Unknown result / refresh / scope | C/D2 Web；真实 receipt | D2 12/12、HTTP PASS |
| Lifecycle / offline / ABA / pending | P11.3、B/C/D Web | P11.3 25/25、B27/C14/D27全通过 |
| Desktop/Tablet/Phone、Light/Dark、旧 Views | 完整 Database Web 与 D 视觉证据 | D视觉PASS，完整Database 221/221 |

执行命令与结果：

| 命令 | 结果 / 层 |
| --- | --- |
| `pnpm --filter @eotion/domain test` | 92 PASS / 0 FAIL / 0 SKIP，纯 Domain |
| `pnpm --filter @eotion/contracts test` | 29/29 PASS |
| `pnpm --filter @eotion/sdk test` | 24/24 PASS |
| `pnpm --filter @eotion/web exec playwright test` 加九个 `tests/timeline-*.spec.ts` 显式路径、`--workers=1 --retries=0` | 88/88 PASS，Web logic |
| `pnpm --filter @eotion/web exec playwright test tests/product-database.spec.ts --grep 'P11.4D' --workers=1 --retries=0`（D2完成时源） | D2 12/12 PASS，mock HTTP seam |
| 同一文件grep D1 keyboard/disappearing test names，`--workers=1 --retries=0` | D1 15/15 PASS，mock HTTP seam |
| `pnpm --filter @eotion/web exec playwright test tests/product-database.spec.ts --workers=1 --retries=0 --reporter=list --output=<独立TEMP>` | 最终221/221 PASS、0fail/skip、exit0，7.6分钟；首批220/221见下文 |
| `pnpm --filter @eotion/api test:domain` | 真实 Mongo 16/16 PASS，0 SKIP |
| `node --test dist/modules/server-domain/database-performance.test.js`（apps/api） | 真实 Mongo 1/1 PASS，5k/10k 固定样本 |
| `node --test dist/modules/http-api/http-api.test.js dist/modules/http-api/database-http.test.js dist/modules/http-api/database-cell-mutation-http.test.js`（apps/api） | 真实 HTTP/Mongo 18/18 PASS，0 SKIP，含政策矩阵父测试+8子测试 |
| `pnpm --filter @eotion/web typecheck` / `build` | 最终aria-live修复源PASS；production build 保留既有>500kB chunk提示，最大736.85kB |
| `pnpm --filter @eotion/api typecheck` / `build` | PASS；build由本轮test:domain脚本实际执行，不重复计算为第二次build |
| `pnpm version:check` / `git diff --check` | PASS，9 workspace packages 0.0.1/build2一致 |

P8.6性能回归的本机Mongo固定样本（非调度器或生产负载保证）：

| Records | 默认第一页 | Filter | 两级Sort | 默认查询examined Records |
| --- | ---: | ---: | ---: | ---: |
| 5,000 | 39.16ms | 546.74ms | 1,102.12ms | 101 |
| 10,000 | 18.87ms | 1,044.46ms | 2,175.85ms | 101 |

全部operation/profiler原数据在Mongo证据目录的logs/api-performance-mongo.log；查询缓存、
本机时序和固定fixture影响耗时，不据此宣称生产延迟/FPS或任意图密度性能。

## 完整 Database Web 与已知基线

C 最终完整 Database 为 **193/194**。唯一失败为已证 PageView dirty-title refresh 覆盖，
证据见 [C 接续 JSON](evidence/p11-4c-resume-20261019.json)。本轮不改 PageView/标题同步。
本轮完整批次必须单 worker、零重试，保留原始日志；出现其他失败独立调查。
D Scope PASS 也不等于完整 Product Acceptance 全绿。

首个完整批次为 **220/221 PASS、1 FAIL、0 SKIP（exit1）**，P11.4D27/27、A8/8、
C14/14全部通过，B26/27。唯一失败为P11.4B pending Relation write的原有
`getByRole('status').toHaveText('正在保存依赖关系…')`严格定位：新增常驻live region也有
role=status，与既有pending status形成两个匹配。这是本轮引入的回归，不能归入标题基线。
最小修复仅移除新region冗余role，保留aria-live=polite/aria-atomic及所有反馈；旧pending
role与原测试断言不变。修后重新定向和完整验收，不能用单项通过拼成完整全绿。
首批原始stdout/stderr、error-context和summary位于TEMP
`eotion-p114d-final-web-72fee8da9f9b44469edbf38fa2b58562/`；7173/PID8172已退出。
这次既有dirty-title case通过，不称旧PageView问题已修复，历史C193/194仍保留。

修复提交`1e30603`，定向 **13/13 PASS**（B pending +12个keyboard名称匹配用例），0skip、
workers1/retries0，证据TEMP `eotion-p114d-fix-focused-a8f4a34f13f2437581127840df9ff10e/`。
该计数不替代原D1十五项，也不替代第二次完整221项。

**最终第二完整批次：221/221 PASS、0 FAIL、0 SKIP，exit0，7.6分钟。** 单worker、
retries0、整文件一次运行，无分片。P11.3 A6/B7/C10/D2合计25/25；P11.4A8/8、B27/27、
C14/14、D27/27。旧pending case已通过；标题基线本轮未复现，未修改PageView/标题同步。
原始stdout/stderr、Playwright输出及summary保留在TEMP
`eotion-p114d-final-web-postfix-ac615d88fe4146798513466eb6b7ecd3/`。
stderr保留NO_COLOR/FORCE_COLOR、ResizeObserver loop及mock seam代理7137连接拒绝输出，
相关用例通过；不把这些输出隐去，也不称Web已连接真实API。

## 独立审查、环境与关闭

独立reviewer已完成基线至最终生产/测试审查：D1真实键盘/焦点/取消/候选/fence、D2回执三态、
D3与P11.1 Date契约的一致性及真实HTTP证据均通过，**当前0个未修P1/P2 blocker**。
review中进一步识别正式silent setEditable路径，避免只监听update的不足；最终DOM观察修复
及冗余status role补丁均复核通过。最终完整221/221通过，独立审查同意P11.4D Scope PASS。

实现提交：`a1c2f4f`（D2）、`965fa0e`（D3）、`5f7f56c`（D1）、`1e30603`（终验status
语义回归修复）。最终文档提交为包含本报告的提交，最终SHA见交付消息与Git history。

基础环境：PowerShell 7.6.6、Node24.22.0、pnpm10.34.2、Chrome channel；workspace links
解析到当前 checkout 的 packages。Mongo8.2.3 使用独立实例，用户既有27017未连接或修改。
基础测试原始日志位于 TEMP `eotion-p114d-verify-4dc04c9b6a3e4394b8917090b0dd0058/`：
01-domain-test（修改前86/86）、02-contracts-test（29/29）、03-sdk-test（24/24）、
04-timeline-logic（九文件88/88，workers1/retries0）。Domain最终结果以上述92/92为准。

真实 Mongo 原始证据为 TEMP `eotion-p114d-mongo-a438d89a5b564cc78733c6116a0a6e13/`，
metadata.json 和每步日志记录测试命令/退出码。Mongo8.2.3 随机端口61930、唯一rs
`eotion_p114d_f3612cb55d4b`、新TEMP dbpath、PID5360；已admin shutdown，进程退出、
listenerCount=0，runner exit0。用户27017仍由既有PID4812监听且未连接或修改。

两轮完整及修复focused的Vite都已退出。最终服务父/子PID6452/45628/50120全部退出，7173
listener=0；最终Web summary.json包含关闭核验。HTTP测试进程exit0、各Test app均在finally关闭。
未提交临时数据库、日志、截图或个人环境路径；原始产物保留于TEMP供本机复核。

build/typecheck/version/编码日志位于 TEMP `Eotion-build-gate-20261019-pnpm10/`；文本严格
UTF-8无BOM。首轮 PATH 命中 pnpm11.25.0，被仓库 engine 限制拒绝（脚本未执行），日志保留
在 `Eotion-build-gate-20261019/`；改用本机既有 pnpm10.34.2 后全部门禁通过，未修改依赖或版本。
silent readonly修复后Web typecheck/build/diff重新执行，最终日志独立保存在
`Eotion-build-gate-20261019-final-nodeview/`，包含9个改动文本的UTF-8无BOM审计。
去除冗余status role后的最终Web typecheck/build/diff与文本审计再次通过，日志为
`Eotion-build-gate-20261019-final-aria-live/`。

未声称运行：Web连接真实API全链、Electron/Lynx真机、正式FPS/生产负载、真实Mongo提交未知
标签注入、scheduler batch与Property生命周期的定向并发race。图算法上限由Domain验证，
不把它写成每个上限都在真实HTTP撞限；真实HTTP仍验证batch输入bounds/CAS/事务rollback。

## 停止边界

只完成 P11.4D；不启动 P11.5、P11 Final、版本发布或无关重构。
