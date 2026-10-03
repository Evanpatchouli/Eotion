# Current Task — Android / Harmony Lynx Runtime Blocker

状态：本轮 blocker PASS；基于最新 master 3ef33cf，验证完成，按 fix(mobile): isolate Lynx runtime contracts 提交。

## Work Units
1. S0 investigate / scout：已确认 Mobile root contracts → Zod Sync schema → 未声明 discriminator；main 在 nova 14 重启旧包复现 error 201。
2. S2 decide / main：冻结 zod-free mobile leaf；root 保持兼容，原生 runtime 不变。
3. S1 execute / fast_worker：mobile.ts、条件 exports、root重导出、App.vue leaf import；稳定边界测试4/4通过。
4. S0 verify / main + scout：所有要求的build/typecheck及SDK/API回归通过；APK/HAP串行构建、包内bundle哈希验证通过。
5. Review / reviewer：代码diff独立复核无blocker；main更新runbook、最终diff和commit。

## Device Evidence
- Android SDK API36、MuMu、nova 14 HarmonyOS6.1 均实际安装启动并截图确认production登录页；无discriminator/error201，白屏消除。
- Android SDK 输入成功，无效测试凭据返回Invalid credentials；production /api/health status ok。
- nova14完成登录页截图后用户继续使用手机，未追加输入/登录操作。
- 两个产物同bundle88177B，SHA256 0f98a277417b57bcb5fe5e4fed6b1ea22cba154ea8c87142bc4f9b2a22923664。
- 新bundle解码discriminator=0，Zod union标志=0；完整module graph 无root/Zod，含mobile leaf。
- Android仍有不影响可见登录页的321/2298日志，不宣称零runtime错误。
- 证据：apps/mobile-hosts/release/runtime-verification/（忽略）。

## Regression
- version:check、contracts typecheck/build/test4/4、Web typecheck/build、API typecheck/build、Desktop typecheck、SDK typecheck/test18/18。
- API domain2/2；typed HTTP1/1、sync1/1、file24/24（随机本地测试库）。
- build:mobile 使用显式production EOTION_WEB_URL，与原生package脚本相同；本机.env仍可覆盖独立开发构建，不修改用户.env。

## Scope / Remaining
- Android Lynx4.1.0/PrimJS4.1.1/WebView4.1.0，Harmony4.0.3/PrimJS4.0.1-alpha.5 保持。
- 无测试账号/已有session，未做Workspace/Page成功登录；完整Mobile/P5验收仍见runbook。
