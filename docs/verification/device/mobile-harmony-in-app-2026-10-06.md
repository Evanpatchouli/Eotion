# HarmonyOS 应用内补充验收 — 2026-10-06

> 后续专项复测见 [HarmonyOS H2 识别与长正文 caret 避让复测](mobile-harmony-editor-retest-2026-10-06.md)：同一 nova 14 上 H2 识别与连续长正文 caret 避让均通过。本文保留首次验收时的 FAIL 作为历史记录；专项通过不代表完整 Mobile Real-device Acceptance 通过。

结论：**不能判定 Mobile Real-device Acceptance PASS**。Workspace/Page 和基本输入操作通过；长正文输入时 caret 被 Touch Toolbar 遮挡，原清单要求的 H1 未满足。附件上传由用户接手手测；Session、离线两次 kill/restart、恢复同步与第二客户端闭环不在本轮 Agent 实测范围。

## 范围与版本

用户先要求只测 Android，随后明确要求覆盖安装指定 Harmony HAP，在 nova 14 补测应用内项目；用户表示“鸿蒙真机断网重连等我已经手动测试过”。本轮不重新登录、不主动断网、不执行 force-stop / kill。用户手测概述不能替代各硬 Gate 的独立证据。附件测试过程中用户又明确“文件和图片让我自己来测吧”，因此停在系统选择器验证。

- 构建基线：master `a0d3a4da93eb2e7210665b89cabb30eb4e4f6c50`；没有更新或重构产品代码。
- 安装文件：`release/0.0.1-beta/Eotion-0.0.1-beta-harmony.hap`；版本 `0.0.1-beta`，buildNumber `1`，signed `true`。
- HAP SHA256：`1e4d0ef06713d70d80554ce149bc5f50d016f709be8b6ce140d7776477645e7e`，17,383,357 bytes，与 sidecar 元数据一致。
- Lynx bundle SHA256：`0f98a277417b57bcb5fe5e4fed6b1ea22cba154ea8c87142bc4f9b2a22923664`（构建元数据声明）。内嵌构建元数据与 sidecar 一致。
- 页面 URL：`https://eotion.evanpatchouli.space`。HAP 构建 SHA 不能证明远端 Web 部署也恰好来自该 commit；本轮未读取远端部署版本。
- 设备：nova 14 / `TLR-AL00`，系统返回 `OpenHarmony-6.1.1.120`；屏幕 1084×2412，竖屏，底部三键导航。
- 工具：hdc `3.2.0f`，TCP 无线调试；`hdc install -r` 成功，没有 uninstall / clear data。安装后出现登录页，用户完成登录后开始本轮。没有安装前 Session 证据，不能据此判 Session 持久化失败。
- 原始证据目录：ignored `release/0.0.1-beta/runtime-verification/harmony-20261005/`（保留开始日期，测试跨午夜）。包含可能带账户信息的布局/截图，未提交。
- 提交证据：[截图、精简观测与校验清单](evidence/harmony-20261006/manifest.json)。hdc 截屏复用临时路径时部分 PNG 的 IEND 后残留旧文件字节；提交副本按 PNG chunk 边界去除尾部残留，不改变像素，原始文件保留。JSON 只提交选定节点，排除账户信息。所有结论限于本次观察。

## 逐项结果

| 项目 | Android | HarmonyOS 本轮 |
| --- | --- | --- |
| Session 真正 kill/restart 恢复 | 历史 PASS | NOT TESTED；用户缩减范围，没有真正 kill 与认证请求验证 |
| Workspace / Page | 历史 PASS | PASS；Page Tree、两个已有 Page、新建 Page、切换、回 Workspace 再进入正常 |
| 编辑器基本输入 / composition / 选择 | 历史 PARTIAL，真实软键盘待补 | PASS（本次样例）；真实键盘、中文候选、英文、换行、删除、插入位置移动、系统选择菜单 |
| Touch Toolbar 完整要求 | 历史 H1 缺口 | FAIL 原 H1 要求；粗体/斜体/文本/列表/H2 操作有效，图片/文件按钮能弹系统选择界面 |
| 离线两次 kill/restart | 历史 PASS | USER-REPORTED 概述，本轮 NOT TESTED；没有逐步 Gate 证据 |
| 恢复网络 pending oplog / convergence | 历史自动恢复 FAIL，手动重试后收敛 | USER-REPORTED 概述，本轮 NOT TESTED；普通在线编辑显示已同步，但未读 pending oplog |
| 第二客户端最终一致 | 历史手动重试后 PASS | NOT TESTED；不能以已同步标签替代 server → second client 证据 |
| 图片 / 文件附件上传、卡片、重启保留 | 历史 picker FAIL | PARTIAL；系统选择器已打开，上传与保留由用户另测，结果待回填 |
| Safe Area / IME | 历史 PARTIAL | FAIL；长正文 caret / 最后一行被 Touch Toolbar 遮挡 |

Android 为 [2026-10-04 历史验收](mobile-real-device-2026-10-04.md)（commit `05a110a`、当时基线 `3625f74`），本轮没有重跑，不能当作指定最新包的重新认证。

## Workspace 与输入证据

已登录进入“备忘录”，Page Tree 展示“测试清单”和之前 Android 的“无标题”。分别打开，正文不同且切换正确，没有白屏或可见崩溃。新建根 Page，命名最终为 `无标题HARMONY_ACCEPT_20261006`（自动输入追加到原默认标题，保留实际名称）。切换到已有 Page、重新打开，再通过工作区切换器选择当前工作区返回首页，最后重新进入验收 Page，全部输入仍在。[重新打开截图](evidence/harmony-20261006/reopened.png)、[工作区返回截图](evidence/harmony-20261006/workspace-return.png)、[最终重新进入](evidence/harmony-20261006/final-page.png)。这证明在线应用内重新打开保留内容，不证明离线 IndexedDB 落盘或进程死亡后的持久性。

正文点击弹出设备实际输入法。先逐键敲入英文 `zhongwen`，再切换中文逐键输入 `zhongwen`，看到 `zhong'wen` composition 与“中文”候选，点击候选后只出现一次“中文”，没有该样例中的丢字/重复字。[组合输入截图](evidence/harmony-20261006/chinese-composition.png)。英文标记通过 `uitest uiInput text` 注入，换行和删除通过软键盘按键执行：输入 `HARMONY_ACCEPT_20261006X`，删除 X 后结果正确。点击正文中间再插入 `CURSOR_`，结果变为 `HARMOCURSOR_NY_ACCEPT_20261006`，证明插入位置发生移动；没有冒充选择手柄拖拽已测。

Toolbar 逐项操作粗体输入 `Bold`、斜体输入 `Italic`、标题输入 `Heading`、切回普通文本输入 `Text`、列表输入 `ListItem`，实际渲染对应样式。[格式截图](evidence/harmony-20261006/formatted.png)、[底部 caret / 列表](evidence/harmony-20261006/caret-bottom.png)。标题按钮源码 `apps/web/src/components/editor/EotionEditor.vue` 的 `toggleHeading({ level: 2 })` 明确为 H2，原 H1 清单项不通过；这是验收要求差异，不自行改变产品行为。

长按英文文本出现选区与系统“剪切/复制/全选/自动填充”菜单，未见 Eotion Bubble Menu 同时浮出。[系统选择截图](evidence/harmony-20261006/selection.png)。未实际执行剪贴板复制/粘贴，不扩大该结论。

## Safe Area / IME 失败复现与定位

键盘关闭时宿主内容边界 y=105..2322，顶部状态栏在 y=0..105、底部系统导航栏在 y=2322..2412；Toolbar 在 y=2157..2322。键盘打开时 Toolbar 在 y=1257..1428，键盘在其下方，没有覆盖 Toolbar；短正文 caret 可见。Toolbar 自身是横向滚动容器，横滑可露出文件按钮；这不等于页面整体横向溢出。抽屉正常打开/关闭，打开时编辑器失焦且键盘收起，没有观察到双滚动条或页面横向溢出。横屏 NOT TESTED：本轮远程操作没有物理旋转设备，没有证据断言产品不支持横屏。

失败步骤：在验收 Page 的普通段落末尾依次输入 `IME_BOTTOM_01` 到 `IME_BOTTOM_06`，每段使用实际软键盘“换行”。随着正文增长，最后输入的行停留在 Toolbar 后方。随后切到英文实际敲 `a` 并按空格，布局记录 `IME_BOTTOM_06a `，屏幕仍只能看到 04 和部分 05，06 与 caret 不可见。[遮挡截图](evidence/harmony-20261006/caret-obscured.png)、[长正文初次观察](evidence/harmony-20261006/long-ime.png)、[布局观测](evidence/harmony-20261006/observations.json)。因此 Safe Area/IME Gate FAIL。

定位线索：`EotionEditor.vue` 的 `updateKeyboardInset()` / `keepCaretAboveTouchToolbar()` 使用 visualViewport 算 inset，并查找编辑器最近 `.document-wrap` 改 scrollTop；该函数在 inset 为 0 时直接返回。真机现象是 Toolbar 已上移，后续 caret 没有跟随避让。当前证据不足以确定 native resize 与 Web viewport 的真实 inset 值，或滚动容器选择是否为最终根因；不把代码线索写成已证明根因。此为产品交互缺陷，不属于必须修复才能继续测试的小阻塞，本轮只记录。

过程中发送两次系统 Back 后退到了系统无线调试页，随后 `aa start` 返回 App，内容保留。没有执行 kill/force-stop，不能把这一段称为 Session kill/restart 或离线重启测试。

## 附件边界与日志

图片按钮弹出系统“选择上传：图库/拍照/文件”；选择“文件”进入系统文件选择器，可浏览“我的手机 / Download”，未选用户私人内容。横滑 Toolbar 后文件按钮也弹出“选择上传：图库/拍照或录像/文件”。[图片入口](evidence/harmony-20261006/image-click.png)、[文件入口](evidence/harmony-20261006/file-click.png)。系统选择界面取消返回正常。图库子选择器、真实图片选择、真实文件选择、上传、图片/卡片渲染、附件 kill/restart 保留均未完成，用户接手手测。

平台依赖是 `@lynx/xelement_webview@4.0.3` 默认 `UIWebView.ets` 中 ArkUI `Web`。虽未显式注册 `onShowFileSelector`，本机 SDK `openharmony/ets/component/web.d.ts`（约 6492 行）明确说明未设置回调或返回 false 时提供默认文件选择界面。现场表现支持这一默认路径，不能因缺少自定义 callback 推断 Harmony 不支持 picker。该 API 声明 since 9；自定义结果接口为 `FileSelectorResult.handleFileList(...)`。

执行 `hdc shell hilog -x` 和 `hilog -x -P 57605`，采样进程日志覆盖末段键盘、选择/抽屉操作；环形缓冲限制使本次进程采样不能代表整个测试时段，未启动全程流式采集。[运行日志摘录](evidence/harmony-20261006/runtime-excerpt.txt)。观察到：

- Chromium `Unknown keycode:229` 与 AceWeb `KeyEvent is not find keycode` warning。
- AutoFillMgr `not find, callbackId: 1` / `null extensionCallback` error。
- AceNativeNode `event receiver is not register` error。

以上系统/ArkWeb 消息没有对应输入失败或可见崩溃的独立证据，不仅因 severity 判整项失败。该采样未检出 EotionHost、Lynx error、JS exception / Uncaught 或 network/sync error；这不是全时段零错误证明。普通在线 UI 显示“已同步”，没有 pending oplog、Push/Pull 或第二客户端验证。本轮产品代码无修改。

## 最终判定

本轮授权的应用内补测已完成；附件上传按用户要求转交手测。Harmony 真机存在 caret 遮挡与原 H1 要求缺口，且未补足全部硬 Gate 的独立证据；Android 历史记录也未通过完整 Gate。**不能正式声明 Android + HarmonyOS Mobile Real-device Acceptance PASS**。
