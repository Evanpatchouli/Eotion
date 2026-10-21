# P11.6 Timeline Final Acceptance

## 2026-10-21 最终裁定：P11.6 HOLD

本节为最终权威结果；下方各批历史红绿证据保留。验收起始SHA为
`ff0901c7545c9bc1addad9114cc1d41492a52eb3`，分支master。最初HOLD交付时未提交；用户随后
明确授权“提交改动并推送，重新组织P11.6最终验收汇报”，本次据此保存并推送成果。
提交授权不改变验收门禁和HOLD结论；最终交付SHA以包含本报告的提交及最终汇报为准，
可用`git log -1 --format=%H -- docs/verification/p11-6-timeline-final-acceptance.md`复核。
版本保持 **0.0.1 / build 2**。P10缺失按用户明确裁定仍为Final HOLD，本阶段不扩展P10/P15。
完整Product尚有启动阻断，不能给P11 Final PASS，也不具备升级0.0.3条件。

### 已完成并提交的改动

- `98ba631`：补齐左右离屏提示/jump与最低未排期显式安排，复用现有viewport、generic CAS及
  原子batch/receipt；修复初始autofocus抢焦点和canonical刷新覆盖dirty标题，补红绿回归。
- `893e8e8`：增加只读视觉环境预检；依据逐图审查精准更新四张旧图，阈值及渲染参数不变。
- 本报告所在文档提交：保存全部分层验收、历史失败、原始证据及独立review结论。

本次提交只整理已审查成果及汇报，没有追加产品修改或重复全量测试；源码/测试/配置在提交前
逐项核对与末态验收SHA清单一致。仍需处理的三项阻断为：P10工具前提缺失、R5启动资源错误
来源未定、R1无trace白屏未归因。没有将它们改记为豁免或PASS。
证据首次stage发现生成日志/error-context本身有尾随空白；不修改原始日志。`.gitattributes`
仅对P11.6证据目录设`-text -whitespace`，避免Git换行转换破坏SHA并排除生成内容的空白检查；
源码、测试和正式文档仍按原规则检查。入库前逐文件核对stage blob与工作树原始字节一致。

### 最终完整运行 R5

所有浏览器门禁workers=1、retries=0，skip/flaky均0。Product14个原spec在同一命令完整运行，
Database另行完整执行，Visual恢复正式环境预检；没有分文件隔离来替换门禁。

| 门禁 | PASS | FAIL | SKIP |
| --- | ---: | ---: | ---: |
| 完整Product | 505 | 1 | 0 |
| 独立完整Database Web | 249 | 0 | 0 |
| 完整Visual | 13 | 0 | 0 |
| Timeline logic + theme | 92 | 0 | 0 |

Web typecheck、production build通过。后端同一末态源相关门禁242/242通过：纯Domain92、
Contracts29、SDK24、Storage7、真实Mongo API Domain16、HTTP18/Sync1/File24、现有MCP30、
Database性能1；API typecheck/build、version check通过。类别与命令详见下文后端表。
R5每个完整命令的exe/args/cwd、原始stdout/stderr、JSON/summary、失败PNG/context/trace及环境
预检均归档，92个原始文件按SHA核对：[R5清单](evidence/p11-6-resume/final-web-r5/sha256-manifest.json)。

Product唯一失败是`product-nested.spec.ts:178`的coarse tablet用例，第183行首个editor可见
断言失败，尚未进入controls检查。trace直接记录必需启动模块`/src/webRuntimePreferences.ts`
请求status=-1，同时console报`net::ERR_NO_BUFFER_SPACE`；HTML/main/App/router等已返回200。
`main.ts`静态依赖该模块，该次失败足以解释未mount和纯白截图。见
[trace提取](evidence/p11-6-resume/final-web-r5/startup-buffer-evidence/trace-extract.json)。

这是**已定位该次启动阻断阶段、资源错误来源未定**，不证明产品无资源泄漏，也未证明端口耗尽。
[Chromium固定Windows错误映射](https://chromium.googlesource.com/chromium/src/+/be46c60078d52078152906df781aea0728978390/net/base/net_errors_win.cc)
和[WinSock错误说明](https://learn.microsoft.com/en-us/windows/win32/winsock/windows-sockets-error-codes-2)
仅支持缓冲区/队列资源错误机制，不代表已证明当前平台峰值或具体根因。R1无trace的白屏仍
独立unknown，不能追认同因。保留原Product FAIL，不改系统、flags、timeout、retry或浏览器
生命周期来宣布绿色；未执行所讨论的14-project隔离实验。

### 四项旧视觉的最终逐项裁定

逐项实际查看expected/actual/diff及差异区域，证据和完整处理过程见本报告下文。C为已证
环境子像素方向差异，B为经历史代码及内容核对的旧快照；没有A类缺陷被快照覆盖。

| 快照 | P11.5原差异像素 | 裁定 | 具体差异 | 最终 |
| --- | ---: | --- | --- | --- |
| page-tablet-light | 1,251 | C | RGB/BGR字形边缘，RAM诊断严格残差0 | 审查后仅此图更新，PASS |
| page-mobile-light | 1,175 | C+B | 字形方向；另156像素为P7 toolbar演变 | 审查后仅此图更新，PASS |
| settings-desktop-light | 2,006 | C+B | 字形方向；另444像素为MCP/About导航演变 | 审查后仅此图更新，PASS |
| settings-profile-mobile-light | 1,132 | C | RGB/BGR字形边缘，RAM诊断严格残差0 | 审查后仅此图更新，PASS |

四图均用未经变换的实际PNG更新并逐张重比，重复运行稳定；R5这四图通过，完整Visual13/13。
其他9图未更新；原阈值和渲染参数保留。Chrome后续155→156仅在独立图审后更新环境manifest。
P11.5历史仍为9/13，不改写为全绿，Agent图审不等同用户视觉签字。

### 最终 §24 矩阵

PASS限所列证据范围；历史阶段通过、mock浏览器与真实Mongo/HTTP不混同。

| §24 Area | 最终状态 | 证据及边界 |
| --- | --- | --- |
| Domain | PASS | Domain92/Contracts29/SDK24及真实Mongo Date/fence/HTTP回归 |
| Generic records | PASS | 完整Database249、generic filter/sort/cursor/page identity及既有视图 |
| Ruler | PASS | 七scale、跨月季年/locale与共享坐标logic及浏览器动态行为 |
| Today | PASS | timezone、跨日刷新、红线/跳转logic与浏览器回归 |
| Scroll | PASS | 原生scroll/rebase/resize/底部scrollbar、无document overflow |
| Bar | PASS | point/range/标题属性投影、Record导航及命中回归 |
| Mutation | PASS | 七scale move/resize/零PATCH/CAS/恢复及真实事务回归 |
| Offscreen | PASS | 新左右提示/jump，复用viewport；分页/Frozen/焦点/旧节点/触控边界 |
| Frozen Table | PASS | 独立配置、共享48px行/窗口、hover/selection/Drawer/响应式 |
| Dependency | PASS | A/B/C/D完整Database、Domain planner、真实HTTP原子cascade/rollback/receipt |
| Unplanned | PASS（最低矩阵） | 显式安排/取消10项与真实HTTP空值级联；§17拖入未实施，Separate手动边界不变 |
| Lifecycle | HOLD | Timeline/Host/ABA/焦点/dirty草稿回归通过；两次启动失败中仍有未归因风险 |
| Responsive | PASS（Web） | 四尺寸/coarse上下文及六Timeline图；没有原生设备签字 |
| Theme | PASS（Web） | Light/Dark、logic/theme92、正式Visual13及实际图审 |
| Compatibility | HOLD | Database249与后端通过；完整Product启动阻断仍不允许全产品兼容结论 |
| MCP | HOLD | 现有六个Workspace/Page工具30/30；P10 Database/View/Record工具不存在 |
| Product | HOLD | 原配置完整505/506；不以Database/Visual或定向全绿替代 |

对应用户F1–F11：**F1 PASS；F2 HOLD（全产品兼容）；F3 PASS；F4 PASS；F5 PASS；F6 PASS；
F7 PASS；F8 HOLD；F9 PASS（Web）；F10 HOLD；F11 HOLD。** grouping/持久行重排按用户裁定
后置，不影响§24其余门禁。

未执行原生手机/平板/Electron宿主真机、真实手指/原生IME、屏幕阅读器及辅助技术、用户视觉
签字和整条Web→真实API/Mongo Timeline E2E；真实Mongo/HTTP与mock浏览器分层报告，不相互冒充。
临时Mongo已admin shutdown；末态核对自有Vite进程及runner均退出，7173/7176/55479/54463/4175
无监听，用户Mongo未触碰，见[关闭证据](evidence/p11-6-resume/final-state/final-service-check.json)。
最终独立reviewer已核实原始R5 JSON/config、四图裁定、156正式预检、产品修复及未削弱的测试
断言、服务关闭、Git/编码审计，正式认可 **P11.6 HOLD**；未发现新增未修的确定代码P1/P2
或报告blocker。P10缺失、R5资源错误来源未定与R1白屏未归因均须保留，不认可Final PASS。

最初HOLD交付时`git fetch origin --no-tags`成功，HEAD与`origin/master`均为起始SHA，
当时按提交门禁保留dirty工作树。用户随后明确授权提交推送；本次fetch核对远端没有新增提交，
按实现、视觉及文档三个逻辑单元提交，使用普通fast-forward push，不覆盖远端历史。
最终本地/远端一致性和干净工作树在推送后核对，并在最终汇报给出完整交付SHA。
`git diff --check` exit0、version check exit0（9包一致），无依赖
声明/lockfile变更；28份修改/新增源码与文档严格UTF-8无BOM，R5归档92文件SHA全部匹配。
见[验收时审计](evidence/p11-6-resume/final-state/final-audit.json)，其中未提交/dirty字段是当时
的真实状态，不篡改为提交后状态。本阶段提交交付后停止，版本未变，未创建tag/Release、
未部署；后续须用户明确指示。下方过程仍保留原有时态。

## 2026-10-21 续推过程记录（历史时态保留）

版本仍为0.0.1/build2，HEAD仍ff0901c；本轮没有commit/push/tag/Release。
用户已明确P10缺失仍须Final HOLD，不扩展P10/P15；一次未归因首屏white也保留风险。
本节为当时过程状态，最终结论见顶部；下方20日各批红结果和旧HOLD按历史原样保留。

### 已落地的兼容性修复与红绿证据

R2发现的Record初始focus竞态已修产品：PageView一次可撤销意图、Overlay同步初始focus scope
（含native showModal）、Editor可取消单RAF+活实例/root检查和同步合法selection/focus。
标题保存、sync和Timeline mutation均未修改。原identity动作/断言没有增加等待。

新增7项在旧代码为**2 PASS / 5 FAIL**：正常Desktop/Phone均通过，用户标题焦点被抢、caret
从8归0、关闭后旧callback访问已销毁Editor抛错、无标题rename后丢焦点均建立真实RED。
修复后相同7项**7/7 PASS**，原identity及native-scroll各repeat3合**6/6 PASS**，相关
Editor4/Overlay7/Title2合**13/13 PASS**，Web typecheck通过。
[完整红绿与控制边界](evidence/p11-6-resume/autofocus/copy-manifest.json)保留全部raw及失败trace；
初次fixture缺Database/View/Property的setup失败单列，未计作产品RED。
PagePersistence.load门控与故意执行已取消RAF是浏览器回归控制，不是实际HTTP/Mongo端到端。

coarse原生横滚的过期屏幕坐标以trial actionability后重取修复；R2另一个coarse失败是在准备
阶段Escape不关闭已focus编辑器，已按既有契约改用“关闭记录”按钮tap。原五次move、滚动增加、
五秒及零mutation断言保留，没有修改产品Escape、native scroll或viewport逻辑。

### R3中断及新浏览器环境审查

R3完成typecheck/build/logic92；Product实际启动503项、记录18项通过后停止，进程恢复时已不在，
没有最终summary。**中断原因未知、不计完整Product结果**；原始部分归档
[R3 interrupted](evidence/p11-6-resume/final-web-r3-interrupted/interrupted.json)。
恢复时7173/7176/55479无监听，未终止未知服务；新自有Vite7173以独立PID/日志启动。

实际Chrome现为156.0.8078.47，与先前批准155.0.8059.85不同，其余OS/SPI/Avalon/字体SHA/PW
字段一致。原正式preflight正确阻断；本机无旧155可执行物。先在TEMP中仅省环境preflight做
调查，13原比较repeat2为26PASS，原threshold/ratio/flags/expected不变并另存两次rawactual；
**诊断不计正式Visual门禁**，也未把PASS误称为像素相同。

逐项复核结果：四张已更新旧图与155golden逐字节一致；全未排期图也相同；另外五张Timeline
对留存155实际图各仅1个RGBA像素变化（Desktop947,462；Tablet718,444；Phone238,490），
原threshold0.2/maxDiff0均无严格差异。Phone对P11.5golden的方向按钮/connector差异早在155
已存在且已经实际审查，不归为156新变化。Connectivity与Page Desktop L/D的原golden仍有
RGB/BGR字形边缘因子，RAM-only反转后严格残差0；缺这三张直接155 actual，不声称完全相同或
能断定其改变时间。没有任何变换PNG写回。

主Agent逐张查看13actual及有严格差异的5组expected/actual/diff，独立review复核数值、
prior155图及区域后，认可**仅更新manifest.browserVersion为实际156**。所有13 PNG、ratio、
threshold与flags均未再改变。旧manifest、首次不匹配、raw图/hash/严格diff和批准后预检均保存。
正式R4已重新启用原globalSetup并完整运行；结果和后续R5见下，不拼接R3部分结果。

### R4完整结果与后续最小修复

R4真实完整门禁：Product **499/503、4 FAIL**，独立Database **245/246、1 FAIL**，Visual
**13/13 PASS**；Web typecheck/build及logic/theme92/92通过，全部worker1/retries0、skip/flaky0。
共5条失败记录、4个唯一case，原始失败截图/trace/stdout/stderr与JSON全存
[R4证据](evidence/p11-6-resume/final-web-r4/failure-extract.json)。

| 唯一case | 精确失败阶段 | 有证据的处理 |
| --- | --- | --- |
| Icons | phone→desktop过渡时sort按钮集合6→3，先保存nth5 locator，SVG检查后该索引消失，textContent超时 | 等目标presentation已切换、唯一active group、1row及3控件，再枚举；原SVG/文字/2px几何断言不改 |
| Board | title填入并确认后，第二次Board操作之前被旧canonical标题覆盖；不是此次AF问题 | 修PageView标题reconcile的同值对象替换/dirty保护，见下 |
| datetime resize（两批同一行） | zero marker打开Record后Escape未关闭；后续clamp尚未执行，正文已focus | 现有Overlay忽略contenteditable Escape；只用现有关闭记录按钮，七scale/timezone/millis/零PATCH断言不改 |
| IME expiry | block.upsert抢先401，metadata保存按钮仍在等稳定就导航登录；metadata题意未实际执行 | test-local one-shot门控真实page.upsert，composition仍active先metadata，结束composition并确保存储后再释放metadata401 |

Board的真实产品缺陷是旧`watch(() => [page.id,page.title])`每次返回新数组，pages对象刷新即使
id/title相同也会触发回调覆盖未保存草稿；R4 trace中覆盖早于picker focus和第二Board PATCH，
没有标题写请求。可能的本地保存→revision→pages.refresh链路有源码支持，但具体哪次revision
触发只属推断。Vue最小复现及真实页面控制刷新分别确认：页面对象已重建、标题仍focus，
dirty值却回到旧标题。

修复仅改PageView为多scalar源watch并跟踪上一canonical标题baseline：sameidentity dirty保留、
clean接受新title，实际workspace/page identity变更初始化，saving不覆盖，page暂缺不当新身份。
不修改保存、AF、Board CAS、Store或同步。新增3项旧源码**2 PASS / 1 FAIL**，新源码**3/3 PASS**；
包括dirty focused刷新后保留再blur确保存、clean canonical刷新、直接修改mounted组件identity
prop的受控切换验证。最后一项是浏览器集成控制，不冒称完整真实Host导航E2E。

首次定向命令实际12项为**11 PASS / 1 FAIL**（Date grep未选中），另补Date exact为**2/2 PASS**；
两条命令仅合计13/14，**不是一批14项**，更不替代完整门禁。新Board失败是标题blur提交后
records刷新使原picker disabled，EotionPopover按既有busy防线关闭；同aria-controls证明未重挂，
无第二Board PATCH。测试仅在原picker.focus之后等同card canonical标题更新且picker enabled，
再执行原Enter/选择。最新同一批7case repeat2为**14/14 PASS**，原全部DOM/title/版本/linked
Table/List断言保留。[新旧回归JSON及trace](evidence/p11-6-resume/r4-fixes/targeted-ready-results.json)。

IME修正保留原登录恢复、Changed title、remote blocks0与正文所有断言，并增加pending精确
seq1page/seq2block及唯一metadata401来源核对；compositionend计数从compositionstart前安装，
门控one-shot且finally释放。它是合成composition的Web控制，不冒称原生IME或真实Mongo。

所有本轮源码/测试再次冻结，R5以独立新目录重新完整6gate，正常156预检匹配；不覆盖任何
先前红结果。R5最终数字和§24裁定见顶部；未知首屏white和P10缺失仍是独立HOLD原因。

## 2026-10-20 续推过程（历史红绿及原始证据保留）

用户授权优先解决四项视觉差异和完整Product/Database失败，再补未排期安排；P10范围单列，
不扩展实现。版本0.0.1/build2及“全部强制门禁+独立review认可前不提交/推送/发布”不变。
用户随后明确裁定：**P10缺失仍须列Final HOLD**；即使本次其余门禁全绿，也不能据此
宣布P11 Final PASS或具备升级0.0.3条件。本轮只验现有MCP，不实施P10/P15。
本次证据根：`C:/Users/31250/AppData/Local/Temp/eotion-p116-resume-dfbb4269eb4c4a6794279c34f3d9ba5d`。

修改前Evidence Pack及最小决定：

- 四图现已证明具体RGB/BGR子像素方向差异，而非灰度/LCD猜测。Playwright自身comparator
  threshold0.2、maxDiff0：仅内存交换actual的R/B（从未写PNG）后，1251/1175/2006/1132
  变为0/156/444/0。Mobile剩156像素全部在toolbar；Desktop剩444全部在MCP/About导航；
  区域外差异为0。选中字形的前景、背景、占位mask与bounds完全一致。
- 实际SPI GET返回ClearType2、orientation0，Avalon PixelStructure2，均指向BGR；
  旧PNG呈相反RGB彩边。历史改变时间未知，不能伪称有历史registry记录。具体机制依据
  [Microsoft GET API](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-systemparametersinfow)
  与[固定Chromium渲染参数源码](https://chromium.googlesource.com/chromium/src/+/4173dee249c410079ba874d335e1ac2c735c622c/ui/gfx/font_render_params_win.cc)。
- 决定：加入小型只读visual环境预检/manifest，记录实际启动Chrome版本、SPI/Avalon、
  OS build与字体SHA；不匹配时明确阻断比较、要求审查，不自动改系统或golden。仅四张
  已审查旧PNG允许从未变换的正式current截图逐项更新，原其他基线/阈值/launch flags不改。
  Chrome磁盘已从.79更新为155.0.8059.85，新的运行记录不得沿用旧版本号。
- About失败为旧测试把beta发行记录硬套当前版本：releaseInfo唯一key为0.0.1-beta，
  `bd9e070`切0.0.1/build2未新增发行记录。UI按exact version返回“暂无记录”符合现有契约。
  不编造0.0.1发行日期或改版本；测试改为核对当前精确版本的记录或完整明确空态。
- mobileMove/Board在setViewportSize后立即读取几何；原失败截图本身已呈现正确收缩/堆叠。
  决定保留原像素界限，等待布局条件成立；Board两列在同一个DOM任务内原子测量，避免混用
  resize前后几何。不增加test retry/固定sleep或放宽断言，定向验证尚待执行。
- 编辑相关失败继续做DOM/PM选区与input/transaction探针，未确定前不把它们统称持久化缺陷。
  此后未排期安排必须复用generic CAS与active policy/batch receipt，不绕过现有边界。

### 续推编辑诊断与定向红绿

DOM/PM探针已证明：P75的Intro/Callout/Table均已入LocalStore，唯一错误是新增Sibling在Intro
后成为root；Grandchild点击后DOM光标已移到该处，但PM anchor仍41（预期204）。附件失败
则是整个editor中心点落在非editable上传widget，前几个中文只有beforeinput、没有input/
doc transaction，随后caret入正文才正常；不存在已接收正文被sync覆盖的证据。
按已安装PM源码，keydown的forceFlush不保证处理尚未送达的selectionchange。新增只读
`waitForEditorSelection`等待native anchor/focus映射与PM anchor/head一致且editor focused，
不写PM选区、不主动flush、不sleep。附件改为真实正文p点击；P75/Table/Bubble在原编辑动作
前等待其光标/选区就绪。正文、LocalStore、结构、父子关系、重启和网络次数断言全部保留。

TEMP诊断各七类原失败保留业务断言至少2次通过；正式12唯一失败repeat2先22PASS/2FAIL，
剩余仅uncertain Slash。复用已就绪菜单helper后证明光标到旧/database可重新触发建议，Enter
会接受旧命令而非建空段落。helper现在于最终caret处Escape再Enter，原uncertain fence/POST
次数断言2/2通过。其余P11.4C offline恢复动作在draggable恢复前不再发手势；不放宽断言。
上述均为定向证据，不拼接替代最后完整门禁。

### 未排期安排 Implementation Brief（S2冻结 → S1）

- 只对当前单原生Date source且原Cell确为null/undefined的未排期记录提供“安排”；不覆盖
  非空坏值，不自动选今天，不开放Separate Start/End手动双写。footer未排期索引展开后可
  显式选date-only日期并保存/取消，键盘和触控可用；row高度、顺序和Frozen配置不变。
- 打开安排时捕获完整现有scope/epoch/root、record/property IDs、DB/Record/View版本、
  dateSource和dependency配置指纹。私有Schedule command以originalValue=null表示空Cell，
  提交时重新检查仍为空及所有fence；不得提交前重新取新版本或自动重试。
- 复用现有Date adapter的generic单Cell CAS或active-policy原子batch/context/receipt分支；
  不新增HTTP/SDK/MCP/API。允许抽取捕获逻辑供move/schedule共用，禁止重写已冻调度/receipt。
  Domain已有rootProperties可将空root变point，旧root缺失时keep-gap取0是原规则，不改planner。
- 表单日期为空、不合法、offline、stale/pending时不写；取消0请求。保存期间用同一busy
  fence，scope/root变化清UI且旧响应不抢焦点；已确认成功后依canonical投影定位原行/Bar。
  409/4xx/unknown与active三态继续现有反馈/只读恢复，不用visible root推测整批结果。
- 回归：空值→point保存/Table/reload一致；取消/无值0PATCH；active policy仅一次batch及
  downstream canonical级联；CAS冲突/unknown receipt/refresh失败；scope/配置/记录变化及
  offline拒绝；Separate/invalid值不可安排；390/360触控与focus/无overflow。补真实HTTP
  empty-root→point/cascade/CAS rollback证据，不用mock冒充Mongo。

### 四项视觉续推裁定（取代下方前次HOLD结论，保留旧证据）

| 图 | 旧差异像素 | 根因及逐项裁定 | 正式处理 |
| --- | ---: | --- | --- |
| page-tablet-light | 1,251 | C：RGB/BGR子像素方向；相同字形位置、范围、前景/背景，诊断反转后比较差异0 | 在已记录BGR环境重复两次actual完全稳定，只更新此图 |
| page-mobile-light | 1,175 | C+B：上述方向差异；余156像素只在x199–389/y808–824工具栏，对应P7缩进/反缩进按钮历史变化 | 实际工具栏正确，审查原expected/actual/diff及fresh actual，只更新此图 |
| settings-desktop-light | 2,006 | C+B：上述方向差异；余444像素只在x28–223/y414–560导航，对应MCP交付及About/软件说明入口 | 实际导航符合已交付功能，逐区审查后只更新此图 |
| settings-profile-mobile-light | 1,132 | C：RGB/BGR子像素方向；相同字形占位，诊断反转后比较差异0 | 重复actual稳定，逐图审查后只更新此图 |

字形探针及机制证据：[独立调查](evidence/p11-6-resume/visual-subpixel/evidence-brief.md)、
[原始数值](evidence/p11-6-resume/visual-subpixel/glyph-evidence.json)。诊断R/B交换仅在内存中，
没有编辑任何PNG；新的四张golden逐字节等于正式未变换actual。没有加容差、特殊渲染参数、
跳过测试或重建另外九张图。旧环境registry改变时间无法追溯，不伪称已证明历史设置值。

只读环境预检固定已审查OS build、SPI/Avalon、字体SHA、实际Chrome版本及Playwright版本，
不匹配直接阻断而非自动接受。Chrome155.0.8059.85下正式更新前四图repeat2为0/8（稳定旧差异），
定向更新4/4后完整自动visual为**13/13 PASS**；[完整日志](evidence/p11-6-resume/compare-all13/stdout.log)。
P11.5的9/13和本轮前次9/13保持历史原样；此处是经新证据审查后的新结果。

### 续推实现与审查进度

安排10例定向全部通过：[合并原始日志](evidence/p11-6-resume/unscheduled-r5.log)。它们包括
显式空日期/取消零写入、连续安排两记录以验证busy释放、canonical Bar焦点、Table/reload、
active单batch级联、409/uncertain/refresh失败、过期record/offline、config/scope/Separate边界
及390/360 Chromium coarse context。早期focus实现曾误把v-for ref当单元素，已在正式完整门禁前
修为root内查询并受捕获身份及当前focus归属约束。没有把Chromium触控称为真实手机验证。

真实HTTP新增missing/null两组empty-root安排，保留事务内第二次CAS失败回滚、DB仅+1、每条Record
+1、GET持久结果与committed/not_committed receipt断言。初次新增测试把合法字符串Date误期望成
对象；另两次null fixture错误把clear当作显式stored null，实际clear按既有契约unset。全部红日志保留；最终复用既有合法DatabaseService.createRecord建立真实Mongo显式null（fixture setup含service调用），安排、GET、receipt及事务回滚仍经过真实HTTP。只修测试前提，再完整重跑HTTP，不修改Date wire或planner。

独立review已完成源码及四图第一轮审查，未确认新未修P1/P2；最终完整门禁及报告复核仍进行中。
所有新证据按[复制清单](evidence/p11-6-resume/copy-manifest.json)保存；诊断合并stdout/stderr
明确标注，不伪称早期未落盘的console输出为原始分离日志。

### 续推完整后端门禁

| 类别 | 完整命令（pnpm） | 通过 / 失败 / 跳过 |
| --- | --- | --- |
| 纯Domain | `--filter @eotion/domain test` | 92 / 0 / 0 |
| Contracts | `--filter @eotion/contracts test` | 29 / 0 / 0 |
| SDK | `--filter @eotion/sdk test` | 24 / 0 / 0 |
| Storage包 | `--filter @eotion/storage test` | 7 / 0 / 0 |
| API真实Mongo domain | `--filter @eotion/api test:domain` | 16 / 0 / 0 |
| HTTP / Sync HTTP / File HTTP | `--filter @eotion/api test:http`（最终http-rerun3） | 18 + 1 + 24 / 0 / 0 |
| 现有MCP合约/工具 | `--filter @eotion/api test:mcp` | 30 / 0 / 0 |
| Database性能回归 | `--filter @eotion/api test:database:performance` | 1 / 0 / 0 |

合计242/242，未跳过。`pnpm --filter @eotion/api typecheck`、`build`及`pnpm version:check`
均exit0。原11门禁中的HTTP红run及两次修fixture前的完整红重跑均保留，最终通过没有抹去它们；
[最终汇总](evidence/p11-6-resume/backend/final-summary.json)及目录内各command/stdout/stderr
可逐项核对。新增断言写在原HTTP testcase内，不冒称新增顶层测试数。

全部真实事务使用独立127.0.0.1:55479 / replica set `p116_dfbb4269`及TEMP dbpath，
没有访问用户27017或修改.env。已admin shutdown，PID59276退出、55479无监听；完整Mongo日志
无损gzip保存并核对解压SHA，数据目录未归档。证明范围是纯Domain/包测试与真实API/Mongo，
不冒充Web连接真实API/Mongo的Timeline整链E2E；MCP30通过也不弥补P10工具缺失。

### 续推正式完整Web门禁（第一批，保留红结果）

同一最终源码下，Web typecheck/production build通过，Web逻辑+theme为92/92。
完整Product14 spec实际496项：**495 PASS / 1 FAIL / 0 SKIP / 0 flaky**；独立完整Database
实际239项：**238 PASS / 1 FAIL / 0 SKIP / 0 flaky**；完整Visual **13/13 PASS**。
均workers=1/retries=0，不将Product里的Database子集替代独立Database门禁。
原command/config/stdout/stderr/results/失败截图已按SHA清单保存在
[本批证据](evidence/p11-6-resume/final-web/sha256-manifest.json)。

- Product新失败在`product-sync.spec.ts:494`首次空态断言；截图整张空白，尚未创建页面或
  第二客户端，不能写成远程删除逻辑失败。原JSON和source的中文UTF-8/码点一致，显示乱码
  只来自一次输出解码，不修改源码编码。首屏模块/挂载/路由原因尚待观察性trace复现。
- Database新失败在`product-database.spec.ts:11987`，390px原生CDP touch swipe后native
  scrollLeft仍8074（期望>8074）。未进入360px及scrollbar click；该case在Product批次通过，
  仍不能因此认定同根因或豁免独立红结果。准备命中/事件/native与viewport state只读探针。

原先12类失败在本批未再失败；上述两项是新观察结果，暂不归因产品缺陷、历史问题或环境。
不增timeout/retry、不删除断言；调查进行中，不能仅凭visual13/13宣布其他强制门禁通过。

### 首屏与触控新失败的独立调查

首屏：current原单用例1/1、完整sync42/42；ff0901c原单用例1/1、完整sync42/42均通过。
固定原5秒断言、worker1/retries0，记录pageerror、console、requestfailed、模块/API时间线、
DOM和trace；目标页面加载约342–463ms，没有页面执行错误或requestfailed，只有两边均有的
mock未覆盖database-navigation404。基线16项入口/配置/测试与git show ff经LF归一相同；
使用archive自身包源码/dist，不重建，PW/Vite CLI依赖版本一致。**原全白原因仍未确定，
不称已修复、不据两边通过就认历史问题。** [结论与源核对](evidence/p11-6-resume/sync-startup-probe/conclusion.json)。
全部原始日志/汇总及四轮目标trace已归档，其余全通过trace/events保留TEMP且列出SHA/路径。
pnpm engine版本误解析和grep未匹配两次启动失败未启动浏览器，不计Product用例失败。

触控：原case独立再现8074不增；最小观测repeat3为2PASS/1FAIL。失败内部native/state/
width/generation/origin未变，但屏幕位置**确有变化**：before.top422、固定y634，之后外层
document-wrap滚动68px，scroller.top变354，实际touchstart不再命中canvas；成功样本top354、
y566且actual target为canvas，均产生原生scroll。故不支持“viewport先滚后回写”或“CDP过快”
（三串手势时长132/205/207ms，均超过一帧）。未证实失败目标就是summary，报告不作此推断。

前置截图/较重geometry探针均通过，存在观察效应；baseline原case1/1+geometry5/5也仅说明
该次没有复现，不能按相似文本归因。上述红绿及[全部coarse证据清单](evidence/p11-6-resume/coarse/copy-manifest.json)保留。
最小修复只在手势坐标读取前增加Playwright `scroller.tap({trial:true})`，等待可见、稳定、
可接收事件并完成必要scrollIntoView，再读取原坐标。没有真实额外tap、没有设置scrollLeft、
没有改产品scroll/viewport、5次move、>before.left判据、5秒及零mutation断言均保留。

正式原用例repeat5为**5/5 PASS**；最小init事件观测repeat3为**3/3 PASS**，390/360实际target
均为canvas，before/event rect稳定，native均增加；touchstart总数分别2（初始Bar+CDP）及3
（加第二宽度CDP），trial没有额外touch事件。独立review认可此actionability前置修复，无新P1/P2。
对应完整Web门禁正在以新目录final-web-r2重跑，并增加失败时保留trace；不覆盖第一批红结果。

### R2 完整Product的新增发现（源码冻结，修复候选准备中）

R2 Web typecheck/build及logic/theme92通过；完整Product为494/496（2FAIL、skip/flaky0）。
原白屏本批通过，但原因仍未闭合。两项新红必须按trace的实际失败阶段分别记录：

1. P11.3A identity用例在8606标题提交前提失败，尚未drag。fill开始于562225ms，after快照
   562266ms标题仍Identity row、正文却已是Edited record titleIdentity body且ProseMirror-focused。
   没有标题PATCH/page.upsert；唯一写入是误插正文block.upsert，后续snapshot也一致。
   已确认输入去了正文，不能称标题持久化丢失。PageView命名Record触发Editor初始autofocus，
   Editor外层RAF再调用Tiptap focus内部RAF，无执行时焦点归属保护，存在用户选择标题后抢焦点窗口。
2. coarse同标题用例在11936准备步骤失败：Bar tap已打开Record，Escape后surface count一直1。
   尚未trial/五次move；first assertion五秒后失败，finally browser.close随后未完成才汇总30秒timeout。
   Overlay原有规则忽略contenteditable内Escape，trace中正文已focused。这不是原8074失败或trial
   回归；仅将setup改用已有“关闭记录”按钮tap并保留count0，不更改产品Escape或超时。

独立review认可第二项最小测试修复，精确trace/派生动作/待应用patch在
[coarse R2证据](evidence/p11-6-resume/coarse-r2-setup/implementation-brief.md)。
第一项按S2冻结产品修复Brief：PageView持有可撤销一次初始focus意图（实际page identity才重置）；
捕获用户focus/输入撤销，Overlay同步初始focus scope覆盖showModal和其后focus以保留正常行为；
Editor以可取消单RAF重查prop/实例/root，合法Selection.atStart+同步view.focus，已focus不改caret。
不改标题保存、sync、Timeline drag；不以新增测试等待规避产品竞态。

候选暂存在TEMP/autofocus-candidate，尚未改变R2冻结源码。7项新浏览器回归覆盖Desktop/Phone
正常body初始focus及延迟body时用户title优先、无标题rename后焦点归属、已有caret、关闭后的
过期回调。后两项必须证明Editor initialized及pending RAF存在并执行捕获的取消回调，防止空转。
将先在旧代码运行建立RED，再应用候选验证GREEN，最后完整门禁与独立审查。

## 前次验收结果（2026-10-19～20）

状态：**P11.6 HOLD；未具备 P11 Final PASS 或升级0.0.3条件**。
日期：2026-10-19～20（Asia/Shanghai）。起始 master / HEAD / fetch 后 origin/master：
`ff0901c7545c9bc1addad9114cc1d41492a52eb3`。开始工作树干净；版本冻结 **0.0.1 / build 2**。
本轮不升级版本、不创建 tag/Release、不发布或进入其他阶段；仅全部门禁满足且独立 reviewer
认可后才提交推送。

## Evidence Pack（实施前）

- 已读用户/项目 Agent 规范、文档地图、context 入口、P11 产品标准（含 §21/§24）、完整
  renderer 架构及 P11 各阶段记录。历史记录用于选择回归，不冒充本轮运行结果。
- 数据链路继续使用 Domain Date normalizer、generic records、既有 Cell/transaction/receipt；
  DatabaseNodeView 持有加载和 identity fence。Timeline 仅持有临时 viewport/projection/interaction。
- `layoutTimelineItem` 已计算 `offscreen`、raw/clipped geometry；Viewport 当前通过
  `!row.geometry.offscreen` 排除完全离屏 Bar，没有方向按钮或横向跳转，是 §24 明确缺口。
  可复用 `centerViewport`、`useTimelineViewport.revealRow`、同一 temporal map/row window，
  无需新坐标、领域模型或 API。
- 未排期已有原行、原因、footer 索引与 Record 打开入口；需另证实际安排路径，不能将打开
  Record 等同于支持未排期拖入。Separate Start/End 手动编辑继续冻结为只读。
- 四项旧 visual 原日志、actual/expected/diff 都仍存在，已由主 Agent 逐项查看三图。Tablet/
  Page Mobile/Profile Mobile 的主要可见差异是文字边缘；Settings Desktop 同时包含明确
  内容演变：旧图仍有“MCP 即将推出”、没有“关于/软件说明”，当前图已反映功能交付。
  后者由 `2474fae` / `4ad82a7` 的导航变化支持，不能用它解释其余三项字形差异。
- 历史 Chrome 精确版本、字体 fallback/系统字体平滑环境未留档；当前 Chrome
  155.0.8059.79、Playwright 1.63.0。不重复此前无结论的 GPU/字体参数实验，不改阈值。
  未证实根因的项保持 HOLD，不更新其快照，不将 P11.5 例外延伸到 Final。

预计修改：必要的 Timeline offscreen 导航组件/viewport 接线及针对性测试；正式验收报告、
P11 状态、current-task/handoff。快照仅在逐项审查证据充分后允许最小更新。
不改版本、依赖、lockfile、Date wire、Relation/调度语义、MCP/API/schema/sync。

顺序：四旧 visual 调查及重复稳定性 → 冻结最小实现 Brief → S1 实现/定向回归 → 完整门禁
（Product 与 Database 各自完整 workers=1/retries=0；完整 visual）→ 真实隔离 Mongo/HTTP/MCP
与 Domain/Contracts/SDK/Storage、typecheck/build/version/diff → 独立 reviewer → 文档/Git 收口。

本轮证据根：`C:/Users/31250/AppData/Local/Temp/eotion-p116-c91e3284da1d43a4a12362d3f2d4e690`。
历史 PNG 根：`C:/Users/31250/AppData/Local/Temp/eotion-visual-regression-existing7-stable-eb5b16e6d9d242e084dd18b718cbd226`。

2026-10-19 用户明确范围裁定：**“后置；本轮按 §24 最低矩阵验收”**。Timeline grouping 与
持久行重排不进入本轮实现，不据此宣称完整 Notion parity；该裁定不豁免 §24 Unplanned 或视觉门禁。

## 初始缺口矩阵（不是最终运行结论）

| 用户矩阵 | 已有基础 | 本轮待验 |
| --- | --- | --- |
| F1 Domain/Date | Domain/Contracts/SDK、Property fence | 本轮纯逻辑与真实事务回归 |
| F2 Generic/Views | generic loader、P9 identity、Frozen 投影 | 完整 Database/Product、安排路径 |
| F3 Ruler/Today | 七 Scale、统一 transform、日历/timer | logic + browser 坐标/跨日/scroll/rebase |
| F4 Bar/Date edit | P11.3 mutation/恢复 | 完整 Database、真实 HTTP/CAS |
| F5 Offscreen | geometry 有方向，无 UI/jump | 必须最小实现及回归 |
| F6 Frozen | 共享 48px/window、独立列配置 | 完整 Database/响应式/虚拟化 |
| F7 Dependency | P11.4A–D、atomic cascade/receipt | 完整 Database + Domain + Mongo/HTTP |
| F8 Lifecycle | scope/epoch/root/ABA fences | 完整 Database/Product |
| F9 Responsive/Theme/Touch | P11.5 六图和四尺寸交互 | 完整 visual/Database、逐图审查 |
| F10 MCP/Compatibility | 既有 MCP contracts/permissions；P10尚未实施 | 现有MCP/HTTP回归；P10 Database工具缺口HOLD，不实施P15 |
| F11 完整 Product | 现有 scripts/config | 全部完整门禁与原日志；未执行前 HOLD |

## 前次四项旧视觉裁定（续推前HOLD，历史保留）

P11.5 历史结果保留 **9/13 PASS，4 FAIL**，差异数量是 Playwright 阈值化像素，
不等同于原始 RGB 不同像素数。actual 在 a94 与当前相同只证明非 P11.5 新增。

| 快照 | 旧差异像素 | 逐项观察 | 当前裁定 |
| --- | ---: | --- | --- |
| page-tablet-light.png | 1,251 | sidebar/标题/正文/状态字形边缘；未见布局移位 | C 候选，根因未定，HOLD |
| page-mobile-light.png | 1,175 | 顶栏/标题/正文字形边缘；toolbar 后来加入缩进/反缩进 | toolbar B 已证，其余 C 未定，整项 HOLD |
| settings-desktop-light.png | 2,006 | 字形边缘及 MCP/软件说明导航内容 | 内容部分 B 已证；其余 C 未定，整项 HOLD |
| settings-profile-mobile-light.png | 1,132 | 标题/说明/label/按钮字形；表单边界一致 | C 候选，根因未定，HOLD |

未增加容差、关闭检查或更新任何快照。四项均保持整项HOLD，没有永久豁免。

### 可复核原图（主 Agent 已逐项查看 expected / actual / diff）

| 场景 | expected | actual | diff |
| --- | --- | --- | --- |
| Tablet Page | [expected](evidence/p11-6-visual/page-tablet-light-expected.png) | [actual](evidence/p11-6-visual/page-tablet-light-actual.png) | [diff](evidence/p11-6-visual/page-tablet-light-diff.png) |
| Mobile Page | [expected](evidence/p11-6-visual/page-mobile-light-expected.png) | [actual](evidence/p11-6-visual/page-mobile-light-actual.png) | [diff](evidence/p11-6-visual/page-mobile-light-diff.png) |
| Desktop Settings | [expected](evidence/p11-6-visual/settings-desktop-light-expected.png) | [actual](evidence/p11-6-visual/settings-desktop-light-actual.png) | [diff](evidence/p11-6-visual/settings-desktop-light-diff.png) |
| Mobile Profile | [expected](evidence/p11-6-visual/settings-profile-mobile-light-expected.png) | [actual](evidence/p11-6-visual/settings-profile-mobile-light-actual.png) | [diff](evidence/p11-6-visual/settings-profile-mobile-light-diff.png) |

Tablet 差异位置：侧栏品牌/用户/导航文字、主标题、副标题与正文、右上同步状态和左下操作；
Mobile Page：顶栏、标题/正文、底部 toolbar；Desktop Settings：侧栏、新增 About 与 MCP 状态、
标题、label/帮助文字/输入内容；Mobile Profile：顶栏、标题、label/帮助文字和按钮字形。
主 Agent 视检未见这些表单边框、行折或正文布局出现明确裁切/错位；这不证明渲染根因或替代
用户视觉签字。两项旧内容有直接历史依据：

- `5724b8a`（P7.3）加入 touch toolbar 缩进/反缩进；旧图来自更早 `1142a66`。
  当前 9 个按钮、44px 目标及 toolbar 横向 overflow 有 product-editor 回归，nested 的390px
  touch 回归覆盖缩进/反缩进。图片/附件仍在 toolbar 横滚内容中；未运行真机手指横滑验收。
- `2474fae` 增加 About/软件说明；`4ad82a7` 增加 MCP 管理。旧 Settings Desktop 未随之更新。

四项各 repeat-each=2 的正式配置复现：**0 PASS / 8 FAIL**，workers=1/retries=0。
每项两次 actual hash 完全一致，且逐一等于 P11.5 对照 JSON 的 hash。原始 stdout/stderr、
exit code、每次 PNG/hash 与环境信息位于本轮证据根的 `visual-repeat/`；未加入渲染参数。
命令：`pnpm exec playwright test --config=playwright.visual.config.ts --grep '(Page tablet light|Page mobile light|Settings desktop light|Settings profile detail mobile light)' --repeat-each=2 --workers=1 --retries=0 --reporter=list --output=<证据根>/visual-repeat/playwright-output`。
稳定重复只证明当前渲染可重复，不证明与旧环境相同。没有历史精确 Chrome、Windows build、
字体 fallback/平滑参数，无法恢复或证明旧环境。因此四项的最终根因门禁仍未满足。

### 未排期缺口

`DatabaseTimelineView` 未排期索引和 `TimelineViewport` 原行均只有打开入口。Record Host
不提供 Date 属性编辑；现有 Table Date editor 可以安排日期，但不等同 §17 的 Timeline
未排期拖入。`prepareTimelineBarDrag`/`moveTimelineRecord` 要求非空有效原 Date，因此不能
直接复用来填空日期；Table saveCell 又不带 active auto-shift 的 Timeline context。
若实现，需要明确的空 Cell 调度交互、私有 command/capture 与既有 batch/receipt adapter
接线及针对性回归；不能直接绕过该边界调用 Table 单 Cell 写入。该项列 HOLD，不宣称已满足。

### P10 MCP 兼容性前提缺口

实际 `apps/api/src/modules/mcp/mcp.service.ts:createServer` 只注册六个工具：list_workspaces、
list_pages、search_pages、get_page、create_page、update_page（均带 `eotion_` 前缀）。
`mcp-read.contract.ts` 对 Database Block 仅投影 databaseId/viewId 稳定引用；没有 Database/
View/Record MCP CRUD 或 generic records 工具。context 与 roadmap 的 P10未实施记录与代码
吻合。因此30/30真实MCP回归可证明现有工具/Token/权限/文档写事务不回归，**不能证明任务F10
所列尚不存在的P10 Database工具兼容性**。该部分保持HOLD，不为形式补测而虚构P10能力，
也不在Final Acceptance中提前实施P15或扩大MCP surface。

## Offscreen Implementation Brief（S2 决策 → S1 执行）

- 仅当前已加载 scheduled row：完全离屏只显示对应方向；部分裁切 range 按 clippedLeft/
  clippedRight 显示缺失端方向，point/零宽 marker 使用现有 offscreen 判定。
- 按钮位于时间 viewport 对应行边缘，绝对定位跟随同一 scrollLeft/width 和 48px row，
  使用现有 Quiet Studio token、可见焦点、可访问名称；不伪造 Bar，不修改日期或 View 配置。
- 点击左方向将现有 temporal.startMs 居中，右方向将 visualEndMs（point 为 startMs）居中。
  全部调用现有 centerViewport/syncNativeScroll/tick 更新，不能另算像素或解析 raw Date。
- 父层按 record ID 重查当前 projection/temporal/rowIndex；旧 scope/root/目标已失效直接拒绝。
  同一 viewport controller 增加有限合法 instant 的横向 reveal，并复用 revealRow 聚焦原行。
  异步期间 scope/epoch/root 与目标 identity 再核验，禁止旧跳转污染新 View；不请求下一页。
- Frozen 与 bars 保持同一 rowGeometry/window/focus island；空、未排期、无效目标无提示/无跳转。
  跳转是只读导航，offline 仍可用；当前交互/pending 时不得触发并发日期/依赖操作。
- 针对性回归：左右 point/range、部分跨屏、极端日期/大跳 rebase、无记录/未排期、500行窗口/
  Frozen 对齐、View 切换/旧节点、无效目标、0 PATCH/0额外 records GET。视觉六图若因新增
  正式功能变化而失败，必须逐张查看实际结果后最小更新，不能批量重建。

## 本轮验证结果（持续记录，各层分别计数）

证据根下 `backend/summary.json` 保存命令、起止时间、exit code、stdout/stderr 路径。
以下均是本轮实际执行，全部 0 FAIL / 0 SKIP，未用历史结果替代：

| 层 | 命令 | PASS |
| --- | --- | ---: |
| 纯 Domain | `pnpm --filter @eotion/domain test` | 92 |
| Contracts | `pnpm --filter @eotion/contracts test` | 29 |
| SDK | `pnpm --filter @eotion/sdk test` | 24 |
| Storage 包 | `pnpm --filter @eotion/storage test` | 7 |
| 真实 Mongo Domain | `pnpm --filter @eotion/api test:domain` | 16 |
| 真实 HTTP / Database / Cell mutation | `pnpm --filter @eotion/api test:http`（第一子进程） | 18 |
| 真实 sync HTTP | 同一完整 `test:http` 第二子进程 | 1 |
| File HTTP（fake object server） | 同一完整 `test:http` 第三子进程 | 24 |
| 真实 MCP / contract / tools | `pnpm --filter @eotion/api test:mcp` | 30 |
| 真实 Database performance | `pnpm --filter @eotion/api test:database:performance` | 1 |

API typecheck/build、`pnpm version:check` 均 exit 0。version check 确认九 workspace 包
**0.0.1 / build 2** 一致。File 测试的对象服务是 fake，不能称真实 OSS；Web mock 和真实
HTTP/Mongo 是不同证据层，没有将它们合称 Web→真实 API 的端到端测试。

Mongo 为新建 TEMP dbpath / 随机测试库的独立 MongoDB 8.2.3 单节点 replica set，端口
54463、replicaSet `p116_c91e3284`、PID 58520；仅测试进程设置 P4_TEST_MONGODB_URI，
未访问27017、未修改.env。启动/关闭记录以 `backend/mongo-*.json` 和 logs 为准。

Offscreen 最后整批定向 **3/3 PASS**，之后补充箭头四角命中断言，coarse 单项再次 **1/1 PASS**，
Web typecheck/diff check PASS，所有原始红绿日志在 `offscreen/`。
覆盖左右point、双侧裁切range、9999年末边界、空/未排期、Frozen/window一致、NaN拒绝；
500记录使用25条×20次合法cursor分页加载，焦点行滚出可视窗后仍保留，Frozen与canvas一致；
真实Timeline→Board→Timeline后旧detached按钮不能污染新viewport；右端长range键盘跳转聚焦Bar。
这些是mock HTTP下的真实浏览器交互，不是Web→真实Mongo全链。首版mock limit=600和仅改
dataset的测试不足已由review指出并替换，首轮产物保留，不用其证明最终分页/ABA。

正式完整 Product 已结束：**476 PASS / 10 FAIL / 0 SKIP / 0 FLAKY，486项，19.3分钟，exit1**。
`full-suite/final-product-restored/summary.json` 的config确认workers1、retries0；完整stdout/stderr、
JSON和十项失败截图保留，已复制到仓库 `evidence/p11-6-product/`。独立完整Database/visual
最终结果见下文，未用Product里的228/229数据库子集替代独立完整Database。

| Product 文件 | PASS / 总数 | FAIL |
| --- | --- | ---: |
| attachments | 22/23 | 1 |
| blocks | 14/14 | 0 |
| content-rules | 2/2 | 0 |
| database | 228/229 | 1 |
| editor | 44/45 | 1 |
| flow | 10/10 | 0 |
| nested | 17/17 | 0 |
| overlay | 38/38 | 0 |
| p75-acceptance | 2/3 | 1 |
| pages | 24/25 | 1 |
| settings | 20/21 | 1 |
| slash-context | 3/3 | 0 |
| sync | 42/42 | 0 |
| table | 10/14 | 4 |

十项失败精确摘要（后续当前/基线独立对照见下文，不将源码相同当作同根因）：

| 用例位置 | 完整批次失败断言 |
| --- | --- |
| attachments:686（断言697） | 正文预期“正文仍然可编辑”，实际仅“仍然可编辑”，上传状态另有相似文案；后续持久化/请求数/reload断言未执行 |
| database:6965（等待6994） | uncertain创建后A→B→A输入/database，未出现数据库Slash option；后续fence/POST数断言未执行 |
| editor:1012 | 选区格式toolbar期望可见，元素未找到 |
| p75:427 | offline restart/reconnect阶段poll预期true，得到false |
| pages:745 | mobile对话框布局边界expected<=348，actual544 |
| settings:755 | about发布日期expected2026-10-11，actual暂无记录 |
| table:177 | Tab后保存行数expected4，actual3 |
| table:245 | 粘贴持久化poll expectedtrue，actualfalse |
| table:306 | toggle内Table期望Bmoved，actualB |
| table:357 | 保存结构期望bold，实际没有bold mark |

最初无效8worker批次的overlay动效失败在正式完整Product中通过；这不抹除无效批次或证明其
根因。十项都有原始error-context/PNG，仍需分别按准确断言比较；完整Product本轮门禁已失败，
任何后续定向转绿都不会将本批改写为全绿。

正式完整Product命令（仓库根执行；`<wrapper>`/`<output>`为本轮TEMP路径）：

```text
pnpm --filter @eotion/web exec playwright test tests/product-flow.spec.ts tests/product-pages.spec.ts tests/product-editor.spec.ts tests/product-blocks.spec.ts tests/product-nested.spec.ts tests/product-table.spec.ts tests/product-database.spec.ts tests/product-overlay.spec.ts tests/product-slash-context.spec.ts tests/product-content-rules.spec.ts tests/product-p75-acceptance.spec.ts tests/product-sync.spec.ts tests/product-attachments.spec.ts tests/product-settings.spec.ts --config=<wrapper> --workers=1 --retries=0 --output=<output>
```

wrapper在证据根 `full-suite/playwright.full.config.mjs`，导入原 `playwright.config.ts`，只
明确testDir/webServer.cwd、加入失败截图和list+JSON reporter；不改变原Chrome、viewport、
baseURL、测试集合/断言。命令直接exec，不再经package script追加字面`--`。
本轮完整Database使用同wrapper并只指定整个 `tests/product-database.spec.ts`；完整visual
使用原 `playwright.visual.config.ts`，均显式workers1/retries0与独立output。

Timeline logic/theme命令为直接Playwright执行以下9个纯逻辑文件与theme.spec.ts：
`timeline-atomic-capture`、`timeline-coordinate`、`timeline-dependency-mutation`、
`timeline-dependency`、`timeline-frozen-table`、`timeline-interaction`、`timeline-layout`、
`timeline-mutation`、`timeline-projection`（均在tests/，后缀.spec.ts）。该批误多带
`theme-production.spec.ts`，实际为**92 PASS / 2 SKIP / 0 FAIL**（94 collected / 1 worker），
其中89 Timeline logic + 3 theme通过，2个缺production asset的skip不能冒充正式生产主题门禁。
正式生产主题已单独使用 `playwright.theme-production.config.ts` 重建并执行，2/2通过。

### 无效的首次 Product 启动（不计门禁）

`full-suite/product.stdout.log` 的实际启动行是 **485 tests / 8 workers**。S0 runner 把
字面 `--` 追加在 package script 后，导致后续 config/workers/output 参数未被 Playwright
解析。独立 reviewer 检出后受控 Ctrl+C 停止自有 runner，保留到387/485的部分原始日志；
没有完整 summary/exit code，也未生成要求的失败 PNG，不能冒充完整 Product 验收。
该批的 overlay transition 失败不用于基线或回归裁定。修复后的完整门禁必须用直接 exec
Playwright、显式14个原始Product文件、核对启动行1 worker与retries0重新执行。

### 第二次 Product 部分运行：本轮测试编辑错误

正确命令启动行为486项/1 worker/retries0，但原P11.2D坐标验收报
`ReferenceError: scroller is not defined`。主Agent检查diff确认：worker清理新增coarse用例
中的同名未使用变量时，补丁文本匹配过宽，误删了旧P11.2D第3953行的scroller声明。
这是本轮测试修改缺陷，不是产品回归或历史失败。主Agent精确恢复原行，并核对测试diff
只剩新增3个P11.6用例、没有旧test变更。完整旧用例不削弱断言。

该批在142/486受控停止，原始日志、失败PNG/error-context及其他已产生附件位于
`full-suite/final-product/`；没有完整summary，不作为完整门禁。恢复后先独立验证原case，
再重新从头执行完整Product，使用新目录 `full-suite/final-product-restored/`，不覆盖红证据。

### 独立 review 发现与修复

- P2：右端长 range jump 后 `revealRow` 取首个button，可能聚焦仍裁切的左箭头，下一次
  Enter反向跳转；应让scheduled jump聚焦当前Bar，保留未排期原行导航行为。
- P2：新箭头没有将focus同步focusedRowIndex，500行纵向滚动可卸载键盘焦点行；应复用
  原focus island，并补真实滚动回归。
- 500行测试应改为合法分页；旧scope dataset测试不代表实际View切换，需加强。

以上两项焦点P2及测试证据缺口均已修复，独立review复核认可。随后发现第三项P2：390px
coarse右箭头与dependency connector重叠19×14px，箭头右下角实际命中connector；先横向
分离connector后，360px short Bar中心仍被方形箭头覆盖。最终仅对部分裁切箭头采用行顶20px
高布局，保留28/36px宽、完全离屏方形按钮、原Bar/handle geometry。右侧connector在同一
viewport像素下预留箭头空间，不改变永久dependency anchors。20px是密集行内目标例外，
保留键盘路径；不能冒充44px目标或真机可用性签字。

独立review最终390/360 DOM probe：箭头中心、左右内缘与下角内2px均命中箭头，connector
中心/左右内缘命中connector；Bar中心和resizeStart中心分别命中自身。360 short真实tap
分别证实Bar打开Record、箭头改变viewport、connector命中且不跳转、resize不跳转。
独立probe的connector动作仅证实pointerdown/click命中且不跳转；进入/取消link由worker新增
coarse Playwright的CDP touchStart/touchEnd及 `dependency.active` 断言证明，二者分开归属。
原始机器证据在TEMP根 `probe-offscreen-hit-{before,separated-390,separated-360,final-390,final-360}.json`
及 `probe-offscreen-actions-final-{360,390}.json`。390 short未裁切，不存在箭头；探针中该动作
的等待超时不作为功能失败或通过证据，390引用integration的有效DOM probe。
reviewer对实现增量已确认**无新增未修P1/P2**，Final仍受Unplanned、四旧visual和完整门禁约束。

## 最后完整门禁与失败对照

| 门禁 | PASS | FAIL | SKIP | 条件 / 证据 |
| --- | ---: | ---: | ---: | --- |
| 完整Product | 476 | 10 | 0 | 486项、workers1/retries0、19.3分钟；evidence/p11-6-product |
| 独立完整Database Web | 226 | 3 | 0 | 229项、workers1/retries0、8.8分钟；evidence/p11-6-gates/database-full |
| 完整test:visual | 9 | 4 | 0 | 13项、workers1/retries0；原四旧项失败、Timeline六项通过，未改快照/阈值 |
| 正式production theme | 2 | 0 | 0 | 原playwright.theme-production.config.ts，内嵌production build通过 |
| 12个唯一失败当前独立复现 | 4 | 8 | 0 | 单worker零retry、1.3分钟，仅定向对照，不替代完整门禁 |
| 相同12项ff0901c基线 | 5 | 7 | 0 | 普通archive、独立7176/cache/依赖、单worker零retry、1.3分钟 |

独立Database三失败为：P11.4C offline/changed-config第二次gesture未进入dragging（5352），
Board phone布局second.y=853而expected>=1136（6376），uncertain创建后的Slash option超时（6994）。
它们均有原始PNG/context和日志。新增P11.6三用例在两个完整批次中均通过；不能由此把整批改写PASS。

失败对照逐项结果如下。基线“失败”只表示同用例在该基线运行也失败；下面明确同一断言或
本次未复现，**没有仅凭报错或源码hash相似宣布统一根因**，根因未证实项仍HOLD。
完整机器结果、两边errors/location和原始日志见 `evidence/p11-6-gates/failure-comparison.json`。

| 唯一失败项 | 当前定向 | ff基线定向 | 裁定 |
| --- | --- | --- | --- |
| 附件离线正文 | FAIL | PASS | 当前再次丢失预期正文片段，基线未复现；归因未定HOLD |
| P11.4C offline/config gesture | PASS | PASS | 两边本次未复现；完整Database失败保留，不能称已修 |
| Board phone布局 | PASS | PASS | 两边本次未复现；完整Database失败保留 |
| uncertain创建Slash | PASS | PASS | 两边本次未复现；两个完整批次的失败保留 |
| 选区bubble | FAIL | FAIL | 同toolbar可见性断言重现；根因未定 |
| P7.5离线混合文档 | FAIL | FAIL | 同本地内容持久化poll断言重现；根因未定 |
| mobile move对话框 | FAIL | FAIL | 同height<=348断言重现；根因未定 |
| About发布日期 | FAIL | FAIL | 同expected2026-10-11/actual暂无记录断言重现；不通过版本升级规避 |
| Table末cell Tab加行 | PASS | PASS | 两边本次未复现；完整Product失败保留 |
| Table粘贴 | FAIL | FAIL | 定向两边在258行E应消失/count=0断言失败；完整Product失败在后续保存poll，不宣称同一失败时点或同根因 |
| Toggle内Table编辑 | FAIL | FAIL | 同Bmoved/actualB断言重现；根因未定 |
| Table marks保存 | FAIL | FAIL | 同bold持久化断言重现；根因未定 |

基线初次安装只filter web，未为workspace依赖安装工具，首次build被tsc缺失/错误上级zod解析
阻断；这些工具错误不当作基线产品失败。改用同lock的离线 `--filter @eotion/web...` 安装全部
依赖后，四包按既有脚本build成功，才执行上述有效基线。未更改主checkout依赖/lockfile。

正式visual的四项actual与历史PNG仍可逐项对照。最终六张真实Timeline实际图另存
`evidence/p11-6-gates/review-six/`，主Agent逐张查看了Desktop L/D、Tablet L、Phone L/D、
全未排期：Header/日号/共享行/Today/Scrollbar/新方向提示可见，没有据自动PASS跳过图像审查。
所有原始snapshot保持不变；小于既有阈值的方向控件变化由独立实际图与hit/交互测试补充，
不将六张旧参考PNG误写成已经包含全部新按钮。

## 前次 §24 最低矩阵（续推前HOLD，历史保留）

| §24 Area | 状态 | 本轮证据 / 缺口 |
| --- | --- | --- |
| Domain | PASS | Domain92/Contracts29/SDK24、真实Mongo Domain16与HTTP Date/config/fence回归 |
| Generic records | HOLD | HTTP generic/filter/sort/cursor通过；完整Database有Board/Slash及gesture失败，不能宣称全兼容 |
| Ruler | PASS | Timeline logic89及正式完整批次P11.2D七scale/坐标/缓存/请求静默通过 |
| Today | PASS | logic与正式完整批次的跨日、display zone、Today jump用例通过 |
| Scroll | PASS | 原生scroll/rebase/无document overflow、offscreen与P11.5相关用例通过 |
| Bar | PASS | point/range/未排期投影、属性/title、Record导航和新增命中用例通过 |
| Mutation | HOLD | 真实事务/CAS/receipt及大部分Date交互通过；offline/config prepared gesture完整Database失败仍未解释 |
| Offscreen | PASS | 3项定向、真实分页/Frozen/焦点/旧节点/边界；独立360/390 DOM/touch复核 |
| Frozen Table | PASS | 配置/列/共享窗口/hover/selection/scroll及500行focus island用例通过 |
| Dependency | HOLD | Domain planner/真实HTTP事务/多数Web通过；offline/config gesture失败，不能给全依赖交互PASS |
| Unplanned | HOLD | 可发现/打开；缺Timeline内安排，不能将Table Date editor当作完成 |
| Lifecycle | HOLD | Timeline/Host/ABA专项通过；完整Product离线正文/混合文档/Table持久化失败阻断跨系统结论 |
| Responsive | PASS（Timeline Web） | P11.5四尺寸功能、新360/390coarse probe与六图通过；不包括原生设备 |
| Theme | PASS（Timeline Web） | theme3/3、正式production theme2/2、Timeline六图及实际L/D审查 |
| Compatibility | HOLD | 既有API/MCP通过，但完整Product10FAIL与Database3FAIL，不以定向结果抹除 |
| MCP | HOLD | 现有六工具30/30PASS；P10 Database/View/Record工具未实施，要求的兼容前提缺失 |
| Product | HOLD | 正式完整476/486、独立Database226/229、visual9/13，强制门禁未全满足 |

对应用户F1–F11：F1 PASS；F2 HOLD；F3 PASS；F4 HOLD；F5 PASS；F6 PASS；F7 HOLD；
F8 HOLD；F9 Timeline浏览器范围PASS（整体视觉门禁仍HOLD）；F10 HOLD；F11 HOLD。

## 验证边界

未执行：原生手机/平板/Electron宿主真机、真实手指与辅助技术/屏幕阅读器、用户视觉签字、
正式FPS测量、Web连真实API/Mongo的整条Timeline端到端链。Chromium hasTouch/isMobile/CDP
是浏览器触控证据；截图视检是Agent审查；二者不能替代上述未执行项。
现有Storage包与真实HTTP sync/File测试不等同原生宿主验收。没有lint脚本，不记虚构lint通过。

## 前次独立终审、Git 与停止点（历史保留）

原独立reviewer对12张旧视觉三联图逐张查看并核对历史提交，认可四项保持HOLD；实现中
三个新增focus/touch P2均已修复，有独立真实DOM/tap探针和回归。其后原reviewer及验证Agent
遇到套餐额度不可用，按项目回退规则由独立GPT-6.1 Sol High接续报告/代码/日志核对；主Agent
接续完成真实门禁，没有反复重试不可用模型。回退reviewer已完成独立终审，逐项核对正式gate
JSON、失败对照errors/location、源码diff与Git/清理记录，明确认可 **P11.6 HOLD**，无新的
确定代码P1/P2或剩余报告blocker；该结论不代表强制门禁通过。

Git最终已fetch --no-tags核对：master，HEAD与origin/master均为
`ff0901c7545c9bc1addad9114cc1d41492a52eb3`，起始与最终已提交SHA相同。
**没有本轮提交、推送或tag/Release**。用户明确要求所有强制门禁与review满足后才允许提交，
当前HOLD不具备该条件，所以保留本轮源码/测试/文档/证据的未提交改动，工作树**不干净**；
没有通过丢弃改动或违规提交来伪造干净交付。Git/编码检查见 `evidence/p11-6-gates/git-final.json`，
版本仍0.0.1/build2，依赖声明和lockfile无diff。文本UTF-8 strict/无BOM及git diff --check通过。

隔离Mongo54463/PID58520已admin shutdown；10-20续跑自有Vite7173/PID43836已结束，
7173/7176/4175/54463均无监听，未终止未知进程或清理junction。证据为
`evidence/p11-6-backend/mongo-shutdown.json` 与 `evidence/p11-6-gates/service-cleanup.json`。
普通archive基线的安装目录/原始日志留存，不递归删除依赖链接。

**Final Verdict：P11.6 HOLD。** 阻断项为四旧视觉未逐项闭合、Timeline未排期安排缺失、
P10 Database MCP兼容前提缺失、完整Product/Database/visual未全通过，以及附件当前失败/
基线未复现等未解决归因。不能升级0.0.3，不接受永久豁免。完成本轮验收记录后立即停止，
不自动实施P10/P15、升级版本、tag或发布。
