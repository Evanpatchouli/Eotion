# P11.6 启动故障专项诊断

状态：**本轮取证完成；底层来源仍未知，P11.6 HOLD 不变**。版本仍为 **0.0.1 / build 2**。

2026-10-21 开始，2026-10-22 按用户指令恢复。起始及恢复时 fetch 后 `master`、HEAD、
`origin/master` 均为 `d71a5bf680061a4ab06e2e38323be840cdccebe2`。本轮不修改生产代码、
正式 Product spec、业务断言、timeout、retry、Chromium flags、P10 或版本，不发布。
原 P11.6 验收报告的历史结果保持原样。

## 已有证据与环境

- 历史 R5 的 92 项归档全部存在且 SHA 匹配；失败 trace 明确记录必需模块
  `webRuntimePreferences.ts` 的 `net::ERR_NO_BUFFER_SPACE`。这足以解释该次未挂载，
  不证明端口、内存、句柄耗尽或 Vite 缺陷。
- 历史 R1 原始 Product 为 495 PASS / 1 FAIL，第 480 项在首次导航后的空态断言失败；
  原始日志、JSON、PNG、error-context 存在，**原始 trace 缺失**。后续 current/baseline
  单例及整份 sync 的成功 trace 不替代原失败 trace。
- `test:product` 确为 14 个 spec 文件；正式配置没有显式 `projects`。实际收集按文件名
  排序，而非 CLI 参数排列：attachments → blocks → content-rules → database → editor
  → flow → nested → overlay → p75-acceptance → pages → settings → slash-context → sync → table。
  当前 HEAD 的 `--list` 为 511 项；历史 R5 为 506 项、历史 R1 为 496 项。累计前缀按历史
  实际文件顺序运行当前原测试，不声称测试集合与历史基线逐字节相同；本轮未新建历史 worktree。
- 使用仓库 Playwright 1.63.0、Vite 8.3.0、Chrome channel（实测 156.0.8078.47）、
  workers=1、retries=0。用户已有 Vite 7173/PID58068 保留；本轮用原 Vite 配置的
  `VITE_PORT=7179` 启动自有服务并相应映射 baseURL，包括原测试硬编码端口的持久化上下文。
  因而属于隔离端口的诊断环境，不声称完全复刻原服务生命周期或缓存状态。

证据根为 [p11-6-startup-forensics-20261021](evidence/p11-6-startup-forensics-20261021/)。
原证据复核见 [historical-evidence.json](evidence/p11-6-startup-forensics-20261021/historical-evidence.json)，
配置、命令、HEAD、时间和实际顺序见各 run 的 command/results/test-order。

## 当前实验结果

| 实验 | 结果 | 边界 |
| --- | --- | --- |
| A：R5 目标，3 个新 runner | 3 次各 1/1 PASS | trace 保留；不证明历史问题已修 |
| A：R1 目标，新 runner | 1/1 PASS | trace 保留；旧白屏未复现 |
| B：脚本列出的前 5 文件 | 111/111 PASS | 不是历史真实前缀；早期持久化上下文服务端观测不全 |
| B：历史实际前 7 文件，至 nested | 363 PASS / 2 FAIL | 第 94 项新启动 buffer 白屏；另一项菜单定位冲突；R5 原目标通过 |
| B：历史实际前 13 文件，至 sync | 496 PASS / 1 FAIL | 菜单定位冲突；R1、R5 原目标均通过 |
| C：flow、pages 各自新 runner | 10/10、25/25 PASS | 不替代完整 Product |
| C：editor 首次独立运行 | 用户中断 | 24 testBegin、23 testEnd（均 PASS），没有完整结果，不能算整文件通过 |
| C：恢复后 editor 至 settings | 12 个独立 runner 已结束 | Database 252/254，其余文件均通过；无启动 buffer 错误 |
| D：前 94 项有限截断复验 | 94/94 PASS，worker0 | 预检与实际执行标题顺序均逐项一致；未复现，不再扩大复跑 |

2026-10-21 用户要求立刻停止时已终止本轮自有进程并保留现场；随后用户明确继续。
旧批中断记录见 [user-stop.json](evidence/p11-6-startup-forensics-20261021/user-stop.json)；
恢复实验使用新 raw 目录与 [resume-20261022](evidence/p11-6-startup-forensics-20261021/resume-20261022/)。
没有把中断批次补成完整通过，也没有重跑完整 P11.6、完整 Product 门禁或 Visual 门禁。

14 个 spec 的逐文件独立结果如下。每行均为一个完整的新 runner，workers=1、retries=0、
skip/flaky=0；前两行在旧批，其余在恢复批。恢复批新建 Vite，自有 Vite 在各批内部复用。
这些行**不拼接成完整 Product 门禁**。

| Spec | PASS / FAIL | 备注 |
| --- | --- | --- |
| product-flow | 10 / 0 | 旧批完整结果 |
| product-pages | 25 / 0 | 旧批完整结果 |
| product-editor | 45 / 0 | 恢复后整文件新运行，旧中断另保留 |
| product-blocks | 14 / 0 | 无启动 buffer 错误 |
| product-nested | 17 / 0 | R5 目标通过、trace 保留 |
| product-table | 14 / 0 | 包括原持久化上下文 |
| product-database | 252 / 2 | Frozen Table 内容断言及属性菜单定位冲突，均已挂载，无启动网络错误 |
| product-overlay | 38 / 0 | 无启动 buffer 错误 |
| product-slash-context | 3 / 0 | 无启动 buffer 错误 |
| product-content-rules | 2 / 0 | 无启动 buffer 错误 |
| product-p75-acceptance | 3 / 0 | 包括原持久化上下文 |
| product-sync | 42 / 0 | R1 目标通过、trace 保留 |
| product-attachments | 23 / 0 | 无启动 buffer 错误 |
| product-settings | 21 / 0 | 无启动 buffer 错误 |

Database 的 Frozen 内容失败在第 58 项（`product-database.spec.ts:4667`）；main、theme、
runtime preferences、Router/App 正常加载，`#app-child` 和 `.tiptap` 出现，没有 pageerror
或网络失败。保留其 trace/DOM，不扩展修复或把它当成启动故障。

## R5：失败阶段进一步定位，底层资源来源仍未知

第一轮真实前缀的第 94 项 `product-database.spec.ts:4071` 在首次导航后白屏。
11:16:25.446Z（北京时间 19:16:25.446）CDP 记录 `main.ts` 静态发起 `/src/theme.ts`；
11:16:25.465Z Playwright requestfailed 与 console 报 `net::ERR_NO_BUFFER_SPACE`，CDP
loadingFailed 为 canceled=false。该次 main/App/router/webRuntimePreferences 均返回 200。
DOM 留在有 `#app`、无挂载子节点的状态，首次 Timeline 断言失败。

同一时段 `/src/theme.ts` **未到达自有 Vite 的第一个 middleware 观测点**，相邻启动模块
均有 request/finish 200。theme 在此前 11:16:13.754Z 及随后 11:16:35.574Z 均正常返回 200。
因此该次失败不是 theme 持续无法提供；证据将失败边界缩小到请求进入该服务端观测点之前，
尚不能区分 Chromium 网络层、进程级 OS 资源或系统瞬时资源问题。

原 R5 失败模块为 runtime preferences，本轮新失败模块为 theme；这说明同一类可观察错误
并不限于一个文件，不能由此直接证明两次的底层根因相同，更不能将 R1 并案。

失败前后采样约有 5.3 GB 可用物理内存、自有进程约 3.0 GB Private Bytes；主批共 300 次
有效采样，实际间隔约 8.25–20.15 秒、平均 10.84 秒。计数器分步读取，时间为采样完成时刻，
不能视为原子快照，无法排除毫秒级峰值。后加 commit/pool 观测不覆盖该次失败瞬间。
物理内存与 TCP 计数均不能证明或排除系统 commit、socket buffer、非分页池等具体限制。

第二轮真实前缀的**相同前 94 项**在 worker0 全部通过，titlePath 顺序逐项相同。
尚未找到稳定最小失败前缀；首次失败前 93 项通过，随后两个失败使 worker 更换。
单 worker 配置不等于整个 runner 始终复用同一 browser。
最终一次有限截断复验同样 94/94、worker0，通过实际 testBegin 顺序核对。它使用新 runner
与新 Vite，不能消除跨日系统负载和服务缓存差异；**没有证明任何最小因果前缀**。
见 [执行对照](evidence/p11-6-startup-forensics-20261021/prefix94/execution-comparison.json)。

| 假设 | 当前证据边界 |
| --- | --- |
| 单个必需模块持续缺失或持续转换失败 | 不符合本轮 theme 失败前后均 200、失败请求未到 middleware 的事实；不等于排除一切 Vite 问题 |
| 物理内存、commit、句柄、线程、端口或内核缓冲区耗尽 | 没有直接耗尽证据；采样粒度和指标覆盖不足，均未排除 |
| Chromium 上下文/网络资源累积 | 累计时出现过一次，新 runner 多次通过；缺稳定触发和因果对照，未证实 |
| 测试共享状态或生命周期泄漏 | 独立 context、多个 worker 生命周期已记录；没有确定泄漏对象或共享状态，未证实 |
| R1 与 R5 共同根因 | 原 R1 trace 缺失，本轮 R1 正常启动，无直接关联证据 |

故障阶段置信度高；具体资源来源置信度不足，不能归入某一已证实的资源耗尽类别。

直接现场：[first-live-buffer-failure-analysis.json](evidence/p11-6-startup-forensics-20261021/first-live-buffer-failure-analysis.json)、
[资源窗口](evidence/p11-6-startup-forensics-20261021/first-live-buffer-failure.json)、
[相同前94项对照](evidence/p11-6-startup-forensics-20261021/prefix94-observed-replay.json)。
失败 trace、截图和 DOM 在 b-actual-prefix-07/artifacts，完整原始请求事件归档于 events.jsonl.gz。
Vite/进程/系统指标日志另以同名 `.jsonl.gz` 逐字节可逆保存；`archival-packing.json`
记录原始字节数/SHA、压缩 SHA 及原文件的保留路径。

## R1：未复现，继续独立 unknown

`product-sync.spec.ts:491` 先安装 mock API，再首次导航，第 494 行断言“还没有页面”。
尚未创建页面或第二客户端，不能按测试名称归因远程删除。第二客户端在首次空态成功后才创建。

本轮单例与真实前 13 spec 的累计运行均通过。累计运行目标位于第 495 项、worker1，
此前菜单定位失败已更换 worker，故不等同于无重启的历史 browser 累积上下文。
trace 中两个客户端的启动模块均返回 200；首客户端 html/#app/#app-child/空态依次出现，
没有启动模块 requestfailed 或 pageerror。测试 mock 的 database-navigation 返回 404，
对应 console error 已记录，不能描述成“无任何 console error”，也不构成本轮白屏。

原历史失败没有 trace；本轮没有复现它，也没有相同失败模块、网络错误或一致资源变化的证据。
**R1 未修复、未归因，与 R5 继续作为两个独立问题。**

见 [r1-live-startup-analysis.json](evidence/p11-6-startup-forensics-20261021/r1-live-startup-analysis.json)
及 b-r1-actual-prefix-13/artifacts 中的完整目标 trace。

## 观测与结论限制

诊断副本仅替换 Playwright import，原文件动作、断言、timeout、顺序不变。自动 fixture
记录请求开始/结束、响应/失败、CDP initiator、console/pageerror、导航/DOMContentLoaded/load/
visibility、首次 DOM；服务端 middleware/transform 观测及独立 Windows 采样均不修改产品。
全部实际观测变更和缺口记录于
[instrumentation-change.json](evidence/p11-6-startup-forensics-20261021/instrumentation-change.json)。

早期 A 的独立 DOM 导出因 detached file input 赋值失败，完整 Playwright trace 仍保留；
B5 成功 trace 按 retain-on-failure 删除，不能声称它有完整 trace。后续累计使用 trace on。
早期首次 DOM 标记在 DOMContentLoaded 才安装 observer，后改为立即观察 Document；这些时间
是首次观测时间，不保证 parser 的精确创建瞬间。显式关闭的第二 context 可能无法在 teardown
导出 storage/最终 DOM，但其运行事件与 Playwright trace 保留。观测会增加开销，本轮属于
instrumented reproduction，不据此量化无观测时的故障概率。

端口变化也改变 origin 与 IndexedDB/localStorage 分区；隔离上下文本身无持久状态互用，
仍不能将这一差异省略。2026-10-22 恢复时可用物理内存与系统 commit 已明显不同于旧批，
跨日独立实验不是完全等负载对照；不检查或结束未知后台进程来强行对齐环境。

恢复批原采样器只按父 PID 发现后代，误采集了早于本轮启动的 `fastctx.exe`（PID2424）
132 次观测；它不是已证本轮进程，也不是产品泄漏证据。原始记录原样保留，最终派生统计
按 root/parent 出生时间和已验证 PID+birth 闭包重算，排除该身份；新采样器增加出生顺序检查，
但未为此重跑测试。无法证明父链的短生命周期进程也会保守排除，因此计数是已证明采样范围，
不是整机或所有瞬时子进程的完整清单。TCP 仍标注原采样 scope，不用于耗尽归因。
该未知进程未被本轮结束；用户停止时实际结束的进程清单另行保留。

初次诊断服务的 Windows ESM 路径导入失败保存在 preflight-01-no-browser，尚未启动浏览器，
不算 Product 用例失败。生成副本已经校验 SHA 后清理，正式 14 文件在无诊断环境变量下
`--list` 仍为 511 项。归档使用短路径和原始相对路径/SHA 映射，避免 Windows 默认 Git 漏列。

## 后续边界

**失败阶段已定位，底层资源错误来源仍未知。** 本轮没有证据足够证明生产代码缺陷，
没有可据此批准的最小生产修复方案；不建议通过动态导入、跳过模块、延长 timeout、retry
或更改 flags 规避故障。

若后续另行继续，只需限定次数的定点取证，优先在再次 buffer 错误的同一时段比较 Node、
原 Chrome 新 context、新 Chrome 对同一 URL 的请求，并保留系统 commit/内核池与进程、
socket 时间窗。本轮 probe 在首次错误发生之后才实现，后续没有再次触发，**无三路对照结果，
该错误分支未得到实际执行验证**，不能用工具能力描述代替实测证据。

全部计划内测试结束后自有 Vite、runner 和采样器均已退出，7179 无监听；原用户 7173 服务
未操作，最终检查时 7173 也无监听。原源码与正式 spec/config、版本、历史验收报告的基线审计
以及最终独立 review/SHA 核验在证据目录记录。独立 review 已闭合生成副本/Windows 长路径两项
提交前 P2，未发现新的 P1/P2 blocker；见 [审查记录](evidence/p11-6-startup-forensics-20261021/independent-review.json)。
按用户授权仅提交诊断工具、报告与证据；不创建 tag、Release 或部署，
完成后停止。P11.6 仍为 HOLD，R1 与 R5 均不记为修复或豁免。
