# Current Task — P5.6 Completed / Next: P5 Final Acceptance

P5.6 Settings & Preferences：PASS（2026-10-01）。产品版本保持 0.0.1 / build 1。

WU1 Account 已完成：legacy nickname、strict profile API/SDK、scrypt 改密、事务/CAS、credentialVersion fence 与全部会话撤销。
WU2 Surface 已完成：独立认证 Settings，宽屏双栏/compact pane replacement，安全 return/context，Morphicons。
WU3 Theme 已完成：device-local system/light/dark、live media、early production bootstrap、统一中性主题 tokens。
WU4 Toolbar 已完成：默认 OFF，user/workspace/device 隔离；compact 不重复，touch/Slash 保留。
WU5 验证/文档/独立 Review 已完成：正式验收证据与命令见 docs/p5-settings.md。

验证：Web product 111/111、Settings 专项 11/11、theme 3/3 + production 1/1、Web/Electron storage 11/11、offline-shell 1/1、真实 Mongo/API/生产 Web 双客户端 1/1；SDK 18/18、API domain 2/2 + HTTP/Sync/File 26/26、Desktop 8/8、storage 6/6；相关 typecheck/build、version:check、diff/编码检查通过。截图在系统临时目录 eotion-p56-visual-qa，不提交 Git。独立 reviewer 无确定 P1/P2 blocker。

下一步单独执行 P5 Final Acceptance。P5.4 Mobile WebView/Lynx 真机完全离线重启仍待验收，不以本轮浏览器/Electron测试替代。临时 Mongo replica-set 容器已清理，现有本机服务与数据不变。
