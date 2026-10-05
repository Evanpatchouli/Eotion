# HarmonyOS 编辑器专项复测 — 2026-10-06

结论：H2 识别与 caret 避让专项均 **PASS**；不代表完整 Mobile Acceptance 或 Android 复测通过。

nova 14（TLR-AL00，OpenHarmony 6.1.1.120），1084×2412 竖屏；约 01:47–01:51（UTC+8），hdc `192.168.1.3:45795`。构建、签名、哈希与生产资源见 [manifest](evidence/harmony-editor-retest-20261006/manifest.json)。覆盖安装后 WebView 仍显示旧页；线上更新后用户卸载，Agent 重装启动，用户登录后复测。

在先前的第四个无标题页输入 `H2_RETEST_20261006`，H2 选中且内容为二级标题（图标下标 2）。实际键盘逐段换行输入 `IME_BOTTOM_01..12`（marker 由 `uitest uiInput text` 注入）；不滚动时 06/12 行 caret 均在 Toolbar 上方。再实际输入“啊”、`a`，换行后输入 `a`，新段 caret 仍在上方。Toolbar 顶边 y=1257；截图 caret 像素边界：06/12 `[399,1167,405,1220]`，最终 `[71,1167,77,1220]`，间距 37 px。依据为截图像素与原生布局，未采集 DOM rect、inset 或 scrollTop。

截图：[H2](evidence/harmony-editor-retest-20261006/h2-applied.png)、[06](evidence/harmony-editor-retest-20261006/line06.png)、[12](evidence/harmony-editor-retest-20261006/line12.png)、[最终状态](evidence/harmony-editor-retest-20261006/native-final.png)；[manifest](evidence/harmony-editor-retest-20261006/manifest.json)。数据留在无标题页；附件、同步与横屏未测。
