# Current Task — Mobile Real-device Acceptance

2026-10-04，基线 master 3625f74（fetch 后与 origin/master 一致）。用户后续明确仅执行 Android，nova 14 / HarmonyOS 本轮不测；不重复登录。

## Work Units
1. S0 investigate / scout：只读定位 Session、offline cold start、oplog、附件的验收证据入口。
2. S0 verify / main：MuMu Android 12，最新 master APK 覆盖安装保留已登录数据；执行 Session、Workspace/Page、编辑器/IME、两次完全离线 force-stop/restart、恢复同步与第二客户端、附件、安全区；记录日志/截图。
3. S1 execute / main：形成验收文档和证据索引，不为验收修改产品功能。
4. Review：完成后独立检查证据与结论，无证据的项目不得 PASS。

## Result
设备验收完成，正式记录已写入 docs/verification/device/mobile-real-device-2026-10-04.md；独立 review 的唯一提交阻断（*.log 被忽略）已通过改为脱敏 .txt 并更新manifest解决，证据/链接/编码检查通过。
Android Session/Workspace/Page/离线两次进程重启通过；手动重试后server/second client A/B一致。自动恢复未通过，picker失败，H1要求差异与真实IME/SafeArea待补，完整Mobile不能PASS。用户原测试清单已恢复；网络/旋转设置已恢复。仅文档和脱敏证据，没有产品修改。

## Invariants
- 不清除数据/不卸载；不重做登录；不把 reload 当 kill/restart。
- 测试文本使用唯一标记，不破坏已有正文。
- 完全断网仅限模拟器，结束后恢复网络与旋转设置。
- 原始证据：apps/mobile-hosts/release/runtime-verification/acceptance-20261004/；不提交 Cookie/Session/账号秘密。
- HarmonyOS 未执行，不能声明双平台 Mobile Acceptance PASS。
