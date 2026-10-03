# Current Task — Harmony WebView false offline

状态：已修复并在nova14验证，按独立逻辑单元提交。

## Work Units
1. S0 investigate / scout + main：Web离线gate、Harmony权限与官方FAQ；manifest/已装HAP只含INTERNET，UI离线。
2. S1 execute / main：仅声明ohos.permission.GET_NETWORK_INFO，不改同步语义、Native runtime/bridge。
3. S0 verify / main：HAP构建/签名与包内bundle验证通过，覆盖安装保留登录数据，真实UI恢复已同步；version:check与diff检查通过。

## Evidence
- 官方OpenHarmony Web FAQ：缺GET_NETWORK_INFO时navigator.onLine始终false。
- productSync prepare/runSync在!navigator.onLine时直接offline，login不使用该gate。
- 修改前nova14 UI layout：离线 · 本地已保存；修改后：已同步，截图已确认。
- 设备bm dump确认新包具有INTERNET/GET_NETWORK_INFO；登录数据保留。
- 权限修复后ArkWeb网络质量报告4G（原先Offline），不据此宣称所有网络请求零错误。
- 证据：apps/mobile-hosts/release/runtime-verification/harmony-network-before.json、harmony-network-after.json、harmony-network-fixed.png、build-harmony-network.log。

## Invariants
- 只改网络状态权限，不清除应用数据/不卸载，不覆盖navigator.onLine，不删除Web离线gate。
- Harmony runtime4.0.3/PrimJS4.0.1-alpha.5、native host/bundle/production URL保持。
- 后续完整Mobile/P5验收仍见runbook。
