# P11.5 Responsive + Visual Polish

日期：2026-10-19（Asia/Shanghai）。基线 `a94f0cc4ee7dfd994b5073370f15bef23b49393c`。
开始分支 master，fetch 后 HEAD/origin/master 一致，工作树干净。
版本保持 **0.0.1 / build 2**。仅 P11.5；P11.6 Final Acceptance、tag/Release 未执行。

**Final Verdict：PASS（P11.5 Scope，用户接受四项已证旧视觉基线例外）。**
2026-10-19，用户在明确列出四项基线差异并询问是否允许提交推送后回复“提交”，接受该例外
并授权提交及推送origin/master。完整Database最终226/226；整体自动visual仍为9/13，
不改写四项失败，不宣称自动比图全绿。P11.6未执行。

## Responsive Implementation Brief

先读取项目/用户规范、文档地图、P11.5/§24、renderer与D最终验收，以及Quiet Studio
方向、Design System、visual acceptance、freeze summary和token audit，再检查生产组件。
按调查S0、决策S2、执行S1、验证S0和独立review拆分；不批量重写CSS。

现有单原生Timeline scroller、共享row geometry、page-host虚拟窗口、48px行/32pxBar、
coarse point44px与<=700px Frozen仅标题列继续复用。手机不改保存的frozenTable.visible，
不复制renderer、不remount Editor/NodeView。

发现与最小方案：

- Header在窗口<=420px才换行，不能适配宽窗口内的窄Timeline；改用root container query，
  保证previous/today/next/scale可达，period在紧凑宽度另占一行。
- 初始真实PNG确认Month的36px minor tick被“10月19日”等标签越界覆盖。minor day
  改为locale日号（major继续给出年月语境），标签宽度限制在自身tick内；边界、密度、
  坐标、calendar/DST与tick budget不改。初始六图单独保留用于前后审阅。
- dependency管理26px高、未排期打开32px高；在coarse输入下扩大至现有compact text-button
  规格36px。Frozen标题按钮填满共享行，disclosure至少44px；不改行高或Bar geometry。
- resize coarse10x32px（边缘紧凑16px高）、connector28x20px属于高密度编辑目标例外。
  直接扩44px会遮挡Bar主入口或相邻48px行，保留现有仲裁并定向验证point/短Bar/边缘。
- 原生横滚保留唯一所有权，补充token化原生scrollbar样式，验证真实浏览器轨道可见。
- generic Database继续持有首次loading/error/retry/offline/receipt/staleReadonly；仅补充
  保留当前内容的刷新提示，用原requestEpoch约束清理，不创建Timeline loader/service/store。
  最终提示仅在Timeline呈现，Table/List/Board不新增refresh时的布局位移；状态所有权仍generic。

不修改Domain调度/Date wire/Relation mapping/API/SDK/MCP/数据模型/同步/版本，也不修改
历史PageView标题同步问题。P11.4D的receipt三态与零重试历史证据继续保留。

## 验证计划与证据层级

功能矩阵：1440×900、1024×900、390×844、360×800的Light/Dark；手机真实Chromium
hasTouch/isMobile与pointer:coarse。检查控件布局、无document横溢出、原生scrollbar、
滚动后统一坐标、Frozen对齐和持久配置不变、主题几何不变。

触控：空白处原生横滚、Bar轻触打开、move/resize预览提交取消、connector创建、line选择
删除单次提交、point/短Bar/相邻行/边缘命中与状态清理。Bar上横向拖动维持日期move；
空白Grid和底部原生scrollbar承担水平滚动，不改变既有拖拽语义。

状态：首次loading、已有内容refresh/reconnect、空库、全未排期、混合、load error/retry、
offline保留内容并只读、Date/Dependency pending；C/D专项继续验证not_committed、uncertain、
receipt读取与canonical refresh失败，不以未知结果冒充成功或失败。

自动视觉比图使用既有Playwright配置与阈值：Desktop Light/Dark、Tablet Light、Phone
Light/Dark、全未排期六张确定性Timeline快照。固定时间2026-10-19、zh-CN、Asia/Shanghai、
theme、reduced-motion。既有Page/Settings/Connectivity七张快照不更新。Agent逐张查看真实
PNG另列为视检，不将自动PASS等同于真实设备/辅助技术或用户视觉签字。

## 执行结果

完整Database按workers=1/retries=0整文件执行并保留原始日志，没有用定向测试拼接替代。
最终结果及前两批失败见下文；P11.4D历史221/221与P11.4C历史193/194不改写。

### 既有视觉门禁对照（未更新无关基线）

稳定服务下原有七图为3 PASS/4 FAIL。失败集中在文本边缘；没有据此直接认定环境原因。
另外创建起始提交a94f0cc的detached managed worktree，复用未变的workspace依赖，仅将
visual baseURL改为独立7174并使用独立Vite cache，原七图也为3 PASS/4 FAIL。下列四张
**实际PNG的SHA-256在修改前后完全相同**，证明这四项不是P11.5新增视觉回归：

| 原有基线 | 与保存快照的不同像素 | 起始提交与当前actual |
| --- | ---: | --- |
| page-tablet-light.png | 1,251 | SHA-256相同 |
| page-mobile-light.png | 1,175 | SHA-256相同 |
| settings-desktop-light.png | 2,006 | SHA-256相同 |
| settings-profile-mobile-light.png | 1,132 | SHA-256相同 |

完整hash、原始产物目录和配置边界见[对照证据JSON](evidence/p11-5-visual-baseline-comparison.json)。
基线日志为TEMP `eotion-p115-visual-baseline-04ac465dc6054db98a44f8294df2c8cb/`；当前稳定
七图产物为`eotion-visual-regression-existing7-stable-eb5b16e6d9d242e084dd18b718cbd226/`。
均包含原始日志与actual/diff；未改变原快照或0.001阈值。隔离worktree随后归档，7174已关闭。

仅用于诊断的baseline launch `--disable-lcd-text`实验达到6/7，Mobile仍差524像素；另试
font-subpixel/GPU选项仍未消除。未把这些选项加进正式配置，不以改变渲染方式来伪装全绿。
此前多批Playwright自管7173发生服务结束竞态，出现Connection Refused的批次单独保留，
不能当产品缺陷；随后改由主Agent持有稳定Vite，已证四图结果均来自稳定服务。

中间完整13项为9 PASS/4 FAIL（新增Timeline6/6、旧图3/7）；生产/截图末态复核见下文。
整体自动visual仍未全过；在用户接受例外前保持HOLD，不能仅以已证基线为由自行豁免。
用户随后明确接受四项差异并授权提交，P11.5按该例外Scope PASS，自动比图仍不是13/13。

### 工具环境恢复

清理baseline worktree时，node_modules junction连带清理了主checkout共享依赖及四个被链接
workspace package目录。已从未改动的HEAD精确恢复contracts/domain/sdk/storage源码，核对
这些目录git diff为空；再按原lockfile恢复依赖并重建被清理的ignored产物。未修改版本、
依赖声明或lockfile。这是本轮工具操作失误，恢复后的最终验证单独执行，早前结果不替代它。
完整install两次被Electron目录EPERM阻断；Web过滤安装205项成功。另从npm获取同版本
Electron44.4.5 wrapper，其SHA-512与lockfile完全一致；已有binary cache zip的SHA-256与该
wrapper checksums一致。安装器遇default_app.asar句柄占用后，按zip逐文件核验，跳过63个
相同文件、只恢复10个缺少或不一致文件，再验证每个恢复文件SHA-256。
`pnpm --filter @eotion/desktop exec electron --version`返回v44.4.5；没有更改ACL或终止用户进程。
三个shared包build通过，packages/版本文件/lockfile的最终diff为空。

## Responsive / Theme / Touch 矩阵

| Viewport | Light / Dark功能 | 自动视觉比图 | 实际输入 |
| --- | --- | --- | --- |
| 1440×900 | 均PASS | Light、Dark均PASS | Chromium fine pointer；原P11.3/4专项继续保护交互 |
| 1024×900 | 均PASS | Light PASS；Dark未建新基线 | Chromium fine pointer |
| 390×844 | 均PASS | Light、Dark均PASS | 真实hasTouch/isMobile、pointer:coarse；CDP手势在Light执行 |
| 360×800 | 均PASS | 未建基线 | 真实hasTouch/isMobile、pointer:coarse；Light手势/控件回归 |

四viewport功能聚合验证Header布局/可达性、唯一scroller、无document横向溢出、Frozen行顶
对齐、theme切换不改几何，0 PATCH。触控聚合验证轻触Bar打开、Grid空白横滚、原生轨道
点击、目标尺寸；日期聚合验证short range move/preview/commit/cancel、point resize与边缘
可见handle取消。既有Dependency真touch create/delete、合成click单次提交与D键盘路径由
完整Database再次执行，不能用新视觉快照替代功能结果。

另以同一个确定性mock helper执行独立Playwright Chromium动作矩阵，**8/8组合PASS**：四
viewport×Light/Dark，390/360均真实hasTouch/isMobile并验证coarse；逐一实际点击（手机tap）
next/previous/today，week→month切换，检查4个控件不互相覆盖、无全页溢出、配置scale仍month、
records GET从1保持1、Database写请求0。不是新增8个Playwright test计数。原始脚本
TEMP `eotion-p115-header-matrix.mjs`，results.json/stdout/stderr及8张真实PNG为
`eotion-p115-header-final-7c43056544884e959e51e9d340dad9c6/`。主Agent另视检Tablet Dark和
360 Light/Dark三图，补充上述六张自动基线未涵盖的viewport/theme；无新的截图比较基线。

命中例外逐项记录：

| 目标 | 实际尺寸 / 约束 | 本轮证据 |
| --- | --- | --- |
| Range Bar | 高32px，宽由真实Date geometry决定 | 轻触打开及真实touch move |
| Point body | coarse44×44px | 与resize/connector分开的主入口；point resize/cancel |
| Date handle | coarse10×32px；边缘紧凑10×16px | 保留主入口和相邻48px行，short/point/edge真实touch预览、提交与取消 |
| Dependency connector | coarse28×20px，视觉箭头更小 | 保留P11.4B目标仲裁；既有真touch连接/删除与D键盘替代路径 |
| Frozen title | 48px行内可用内容高47px（1px边框） | 按钮>=44px，位于同步行边界内 |
| Today / scale / dependency管理 / 未排期打开 | 36px compact text-control规格；prev/next44px | 沿用已批准共享紧凑规格，不把44px指标机械覆盖到所有控件 |
| 未排期disclosure / footer link | >=44px | 窄屏、展开后按钮与轻触路径 |
| 原生横滚轨道 | 高12px、thumb最小24px宽，视觉thumb高6px | 浏览器真实offsetHeight-clientHeight>0、可见PNG、空白touch swipe与native轨道点击 |

Agent视检不等于真实手指/设备人工验收；精细编辑目标与12px原生轨道的真机可用性仍未运行。
未增加新gesture flow，也没有把Bar上横拖改成滚动；空白Grid/原生轨道继续承担横滚。

## 状态与定向测试

首次loading阻止未就绪Timeline显示；已有内容refresh保留相同Bar DOM且只读；load error/
retry、空库、全未排期、混合、offline只读保留内容与reconnect均由新聚合测试验证。
refresh失败保留内容/错误，显式retry恢复。receipt的committed/not_committed/uncertain/
读取失败、canonical refresh失败和scope fence不改，继续由C/D专项执行。

- 五个新P11.5产品用例加一个新增locale label逻辑用例：**6/6 PASS**，workers1/retries0，
  最终日志TEMP `eotion-p115-final-25997df46c9649058d35a0a5ebbd899c.log`，产物
  `eotion-p115-final-output-25997df46c9649058d35a0a5ebbd899c/`。
  收窄Timeline刷新呈现并补充逐Bar主题几何/phase/saving/selected比较后，六项再次全部通过，
  最后日志`eotion-p115-final-verify-88a52f638dae46b296c4cd9e1ef4dab1.log`。
- 九个Timeline logic文件+theme.spec：**92/92 PASS**（89 logic+3 theme）。最终Web
  typecheck与version:check通过，日志`eotion-p115-gate-2ac6eba4e6254bedadfe6761ed9ae573/`。
- 首个production build发现`@supports ... and not selector(...)`缺少组合括号，LightningCSS
  minify失败。最小修为`and (not selector(...))`，仅纠正Firefox fallback条件语法；Chrome分支
  不变。修后既有ThemeProduction config内嵌Web build成功，**2/2 production主题测试PASS**，
  日志`eotion-p115-themeprod-final-42339c049a9c4cbb99c63e3b71956878/`。
  最后收窄呈现后再次用同一config重建，Web build与production theme2/2通过；日志
  `eotion-p115-themeprod-last-6f483938bce346d794633c5348aa8c99/`。
- build保留既有>500kB chunk提示；NO_COLOR/FORCE_COLOR、mock代理7137连接拒绝等日志
  不隐藏，不把mock Web测试写成真实API全链。

开发中多轮红测分别涉及新增fixture/selector/route/等待或预期：Frozen属性定位、真实Today
节点与Y中心、refresh拦截/table、loading请求门控、未排期展开、point单日range预期、47px
内容区与行边框、Record page预置时序、native滑动后Bar离屏。均修正测试以符合已有行为，
不称为产品缺陷，不削弱receipt/几何/只读断言；各轮原始日志保留TEMP `eotion-p115-test-*`。

## 新增截图与视检

以下六张来自真实Timeline DOM，目录`apps/web/tests/timeline-visual.spec.ts-snapshots/`：

| 文件 | 场景 | Agent视检结论 |
| --- | --- | --- |
| timeline-desktop-light.png | Desktop Light | 日号可读，表/Bar/point/依赖/Today/底部thumb可见 |
| timeline-desktop-dark.png | Desktop Dark | 同geometry、Quiet Studio语义色和可见thumb |
| timeline-tablet-light.png | Tablet Light | 表/时间轴可用、日号与底部thumb可见 |
| timeline-mobile-light.png | Phone Light touch | Header不重叠、精细控件可见、未排期入口和thumb可见 |
| timeline-mobile-dark.png | Phone Dark touch | 同布局、Today和连接器可辨识、thumb可见 |
| timeline-all-unscheduled-desktop-light.png | 全未排期 | 保留5条原行与未排期入口，不误显示空数据库 |

初始六图保留TEMP `eotion-timeline-visual-initial-66f563422c9d43d7a2a52960884aa36e/`；
变化仅为本轮预期的容器Header、紧凑日号、命中区域和可见原生滚动条。仅新的Timeline spec
取消headless默认`--hide-scrollbars`，原七图配置/基线保持。
曾出现Tablet参考PNG在0.001阈值内未被changed-update重写，尽管测试PASS但仍无thumb。
主Agent逐张视检发现后另存真实Tablet actual核对，确认本次有意变化，只强制更新Tablet
单项，其他五图不动；截图前新增真实scrollbar占用高度等待。此后六图compare **6/6 PASS**。
Tablet actual为TEMP `eotion-timeline-tablet-real-screenshot-f4af42ee2b82461a903b6bdbb3b24b96/`，
六图compare产物`eotion-timeline-six-final-compare-2a34dafb052a42a093847428c31f40ba/`。

**最终完整test:visual：9/13 PASS、4 FAIL，exit1。** 六张Timeline+三张旧图通过，四项旧图
差异见前述字节一致基线对照。最终原始stdout/stderr/summary为TEMP
`eotion-visual-final-all13-86eb3b0355244e8e801bb1131440d21d/`。自动比图、Agent视检和功能验证
分开记录，不声明整体visual PASS或最终用户视觉签字。
收窄刷新呈现后的最后一次完整13项仍为9 PASS/4 FAIL，未update，日志为
`eotion-visual-final-all13-post-nodeview-b0a34a6545ca4ab18468cd5c1b71f3bf/`。

## 完整Database与失败边界

每批均是整个product-database.spec.ts一次执行，workers=1/retries=0，不用定向拼接替代。
本轮增加5项，原D的221项变为226项；历史D221/221、C193/194不改写。

| 批次 | 结果 | 原始stdout/stderr/summary/artifacts（TEMP） |
| --- | --- | --- |
| 第一完整 | 224/226 PASS，2 FAIL，exit1，10.0min | eotion-p115-full-database-5337865ff23f4d4fa6fdf0c1b417f6c6/ |
| 第二完整 | 225/226 PASS，1 FAIL，exit1，8.4min | eotion-p115-final-database-a3186fd181a8461f9b996b4a3132f7b2/ |
| 最终完整（收窄提示后，coarse字形末修前） | 226/226 PASS，0 FAIL/SKIP，exit0，7.8min | eotion-p115-sealed-database-31a77cdd5ed04139af6edd2983578d9e/ |

第一批失败：旧Board create case点击View selector后未找到“新建看板视图”；旧uncertain
inline creation case第二次Slash输入后未找到“数据库”option。第二批两项均通过，不称已修复。
第二批唯一失败为旧Board grouping case首次填充Record标题后仍读到`Move me`。
这两批P11.3/4专项及五项P11.5均通过，不把它拼成完整Database全绿。

定向调查没有改旧测试或PageView/标题/Slash代码：

- Board create case当前与a94普通archive副本各repeat3，均2 PASS/1 FAIL，但两边失败在
  更早的titleDraft首次输入回显，未复现第一批的selector菜单缺失；故不能据此把菜单缺失
  直接认作基线。详见[调查JSON](evidence/p11-5-board-create-investigation.json)。
- Board grouping case在a94 repeat3也为2 PASS/1 FAIL，期望同一draft却仍读到`Move me`；
  基线失败发生在第二次keyboard grouping后的标题保持断言（6676），第二完整失败发生
  在首次fill后的回显（6661）。同case存在已证基线标题保持问题，但不能把不同断言时点
  宣称为精确相同的基线复现。基线原始产物为TEMP
  `eotion-p115-selector-baseline-6e6703cf068241b4bd99d43933b68eed/board-group-repeat3-c5c749d82e9d4d5982c717e3c8a82baf/`。
- 新增refresh提示经review收窄到Timeline，以减小未要求的legacy布局影响；没有证据证明
  它导致前述旧测试失败，也不声称这项收窄修复了标题/菜单/Slash问题。

最后完整批次在所有其他测试/build完成后单独运行，**226/226 PASS、0 FAIL/0 SKIP、exit0，
7.8min**。未使用Playwright自动重试、分片或定向拼接。前两次完整失败结果仍完整保留；
旧case最后通过不等于标题/菜单/Slash问题已修复。临时基线7176已关闭，全部副本链接均不
指向主checkout。

最终完整专项计数：P11.3A6/B7/C10/D2合25；P11.4A8/B27/C14/D27；P11.5五项全部通过。
原D221项加本轮5项为226，不能把独立Header8组合或logic89再加到226中。

## 独立Review与末修

原独立review指出hour fold suffix被全tick限宽裁掉，已将限宽收窄到day/minor；并发现新增
测试的父子selector、/table gate、summary展开与真实Today定位问题，已修。整体production
build又检出supports组合括号错误，已修后重建通过。新增refresh提示经review仅在Timeline
呈现，保留generic状态所有权，避免无要求的Table/List/Board布局变化。

原reviewer收口时模型capacity不可用，按项目回退规则改用独立GPT-6.1 Sol High只读复核，
复用既有Evidence Pack。末态复核发现真实P2：coarse日号top32写在TimelineViewport的scoped
CSS，不能命中TimelineRuler子组件，实际top28，与36px管理控件遮到文字上缘。
最小修复将同一media规则移入TimelineRuler自身；header仍56px、row仍48px、Bar/gesture/
状态/数据流不变。新增回归直接核对DOM Range日号文字上缘不低于control.bottom，避免只
看CSS声明。独立真实390/360 coarse确认computed top32、Range top402/control bottom402，
无正面积文字重叠；**新增P1/P2未解决项为0**。

该4px字形末修发生在上述226/226完整批次之后；不把完整批次虚报为随后每个像素变更都
运行过整文件。经独立review认可，以末态8项定向（五P11.5、新label、既有B真touch、D
keyboard视觉）、六图/完整visual与production build/theme验证，属于最小充分验证，不另
做第四次完整Database。末态target **8/8 PASS**，日志
`eotion-p115-final-touch-57d89207d3554a35a0dc38cd9f6f5500.log`，产物同ID的
`eotion-p115-final-touch-output-57d89207d3554a35a0dc38cd9f6f5500/`；最终production build与
theme **2/2 PASS**，日志`eotion-p115-themeprod-release-c70d646043d44b2eb0dd0f931b8698c5/`。
Phone Light/Dark两张新参考图已按实际4px文字变化最小更新，旧七图继续保留。主Agent先
查看独立live actual和positions.json，确认两主题coarse、top32、textRange.top402等于control
bottom402、原生轨道占高12px，再仅两Phone项force update；其他四张新图不动。
actual产物为TEMP `eotion-timeline-phone-position-capture-ed0ee633617448d0a46e821546ce44b7/`，
Phone更新日志`eotion-timeline-phone-final-update-09ededb475b84b97ae23887082bd6f5f/`。
**末态最后完整visual：9/13 PASS、4 FAIL、0 SKIP，exit1。** 六Timeline通过、四旧图仍失败；
原始stdout/stderr/summary为`eotion-visual-final-all13-mobile-labels-b7163eb2f46d4e76beff62ae279d318a/`。
独立review已只读复核修正后的Phone L/D与末态测试，确认**0个未解决新增P1/P2**；完整视觉
自动visual门禁仍未全过；工程review不替代用户接受例外。用户随后回复“提交”，明确接受
上文四项已证旧视觉差异的提交例外；未授权扩大实现范围或更新旧七图。

## 提交、版本与环境

用户确认前未提交推送；确认后重新fetch，HEAD/origin/master均为基线
`a94f0cc4ee7dfd994b5073370f15bef23b49393c`，没有覆盖远端变化。按独立逻辑单元交付：

- `363ac66cb84bf74aee22e045bce3b623f34bd10f`：响应式/触控/状态生产修正与产品、label回归。
- `721e139081b21bc7307e300c9bd919687a4cb6ba`：确定性视觉夹具、六张新基线及visual入口。
- 文档收口：包含本报告的后续`docs(timeline)`提交；最终完整SHA可由
  `git log -1 --format=%H -- docs/verification/p11-5-responsive-visual-polish.md`取得，
  交付消息另记录与origin/master一致、工作树干净的最终核对结果。

旧七图及0.001阈值保持；用户接受的仅为四项已证旧视觉差异。最后通过的Database不消除
前两轮旧测试不稳定的证据，也不追认标题/菜单/Slash问题已修复。

版本仍0.0.1/build2；packages、依赖声明、lockfile及旧七图无diff。文本已按严格UTF-8无BOM
审计，git diff --check通过。独立review源码/测试/截图差异收口完成。主Agent已停止持有的
Vite（PID48952退出），7173/7174/7176/4175的listener均为0；没有后台测试任务。
开发服务工具输出另保留ResizeObserver/7137 proxy警告，以及早期clock teardown时来自
未改动EotionEditor的commands-null输出；本轮未给这些输出补造根因或声称已修复。

## 未执行与停止边界

本轮不运行真实Mongo（前端范围）、Web连接真实API全链、Electron/Lynx原生设备、iOS/
Android实机、原生Selection Menu/软键盘/安全区、屏幕阅读器及正式FPS/生产负载验证。
这些项目不写为PASS。P11.5完成后立即停止；P11.6须独立开始，不切0.0.3、不创建tag/Release。
