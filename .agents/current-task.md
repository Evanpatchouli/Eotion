# Current Task — Idle / Next: P5.6 Settings & Preferences

当前无进行中的实现任务。

## Next planned phase

P5.6 Settings & Preferences，正式范围见 `docs/p5-settings.md`。

已确定的产品边界：

- 宽屏 Settings 使用 list-detail 双栏；紧凑宽度使用 Settings Index → Detail，不做移动端抽屉 Sidebar。
- 个人 / 账号资料：昵称、变更密码。
- 外观：system / light / dark；默认 system，设备本地偏好。
- 工作空间 / 通用：显示固定编辑工具栏；默认关闭，按 user + workspace + device 保存，不关闭移动端必要 touch/contextual editing controls。
- 功能：MCP / Agent 只显示“即将推出”，P5.6 不实现实际能力。
- 密码修改必须验证当前密码，成功后撤销该用户全部 Session 并要求重新登录。
- P5.6 不创建 HarmonyOS / Android / iOS 原生宿主。

P5.4 Mobile WebView 真机完全离线重启验收仍保留为既有未完成边界，不因 P5.6 自动关闭。
