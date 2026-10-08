# 当前任务：Desktop Custom Title Bar 独立修复

基线：50a914d15c716576926098672b9dde53960ffd9f。实现完成；Windows 真实鼠标拖动仍待真人确认。仅修复重复标题栏，不开始 P8.5。

| Work Unit | 模式/评级 | 负责 | 验收 |
| --- | --- | --- | --- |
| Shell/runtime/theme 精确调查 | investigate/S0 | shell_scout | COMPLETE：默认 BrowserWindow chrome 与 44px Topbar 重复 |
| 官方 WCO 与安全边界决策 | decide/S2 | 主 Agent | COMPLETE：hidden + native overlay；44px、env safe area、外观 IPC |
| 窗口与拖拽样式实现 | execute/S1 | titlebar_impl、主 Agent | COMPLETE：ProductShell 与非工作区 fallback；no-drag、窄窗避让 |
| Electron/Web 回归测试 | execute/S1 | titlebar_test、主 Agent | COMPLETE：最新 titlebar 2/2 |
| tests/typecheck/build | verify/S0 | shell_scout | COMPLETE：结果如下，未隐藏失败 |
| Windows 原生 UI 检查 | verify/S0 | 主 Agent、用户 | PARTIAL：鼠标拖动待真人确认 |
| 最终独立复核与聚焦提交 | review | titlebar_review、主 Agent | 0 blocker；单一聚焦 commit |

Desktop/Web typecheck 与 build 通过。相关 desktop-storage/product-sync、product-shell、interaction、theme 回归通过。完整 Product 首轮234/239；最终2-worker238/239，linked-view列上移存在DOM detached/30s超时，隔离单worker通过；未改断言或超时阈值。Desktop node tests12/17，5项SQLite测试失败（Invalid block attributes及EPERM）；SQLite实现/测试与基线HEAD逐文件hash一致，未修改无关内容。git diff --check通过。

真实Windows Electron已检查：完整原生标题栏消失、顶部内容、普通/最大化无重叠、原生最小化/最大化/还原/关闭、顶栏双击、顶栏/侧栏按钮与SyncStatus真实DOM点击、Light/Dark。Sky拖动在本窗口及默认原生标题栏对照窗口均不移动，不能宣称真人拖动验收通过；已向用户请求真实鼠标确认。macOS/Linux未作原生验收。

禁止 frame:false、窗口按钮 IPC、第二套 UI、P8.5 功能、无关依赖/重构。正式运行契约见 docs/runbooks/desktop-production.md。
