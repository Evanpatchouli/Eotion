# 移动端 P1 演示页

演示页位于 `apps/web` 的开发路由 `/#/__dev/mobile-p1`。生产构建不注册此路由；移动端仍通过同一个 Web App 显示页面。

## 在浏览器与手机中打开

1. 运行 `pnpm dev:web` 和 `pnpm dev:mobile`，在 Lynx Explorer 扫码。WebView 默认进入工作区；打开侧边栏，点仅开发模式可见的“移动端 P1 演示”。之后可用页面顶部的“返回工作区”链接返回，无需切换 `.env`。
2. 浏览器也可直接打开 `http://localhost:5173/#/__dev/mobile-p1` 检查页面和 Web API 按钮。
3. 如需扫码后直接进入演示页，可选地在 `apps/mobile/.env` 中设置完整 URL，例如：

   ```dotenv
   EOTION_WEB_URL="http://192.168.1.10:5173/#/__dev/mobile-p1"
   ```

   换成开发机实际局域网 IP。URL 中有 `#`，因此 `.env` 的值需要加引号。更改 `.env` 后重启移动端开发服务。若想恢复扫码后进入工作区，移除该覆盖值或将其改为 Web 根地址即可。

## 操作与判读

| 操作 | 通过表现 | 判读 |
| --- | --- | --- |
| 发送 Ping | 页面显示带往返耗时的 Pong | 网页消息到达 Lynx 壳，且 Lynx 成功回调网页。普通浏览器没有 Lynx 壳，超时是预期结果。 |
| 复制文本、主动读取 | 页面显示所用 API 和结果；可手动粘贴复核 | 验证当前 WebView 的网页剪贴板能力。局域网 HTTP 可能限制 Clipboard API。 |
| 选择文件 | 页面显示文件名、类型、大小 | 验证当前 WebView 的文件选择器。演示页不读取或上传文件内容。 |
| 打开分享面板 | 系统分享面板打开，或显示不支持/失败原因 | 验证当前 WebView 的 Web Share API。 |

Ping 使用网页的 `window.postMessage` 发出请求；Lynx `<webview>` 监听 `message`，并通过 `eval` 调用网页的回复函数。是否由当前 Lynx Explorer 的 WebView 实现转发，需要在手机上以 Ping/Pong 结果确认。

若手机上 Ping 超时，可查看 Lynx DevTool 日志：没有 `P1 ping received` 说明网页消息没有到达 Lynx；收到 Ping 但出现 `P1 pong delivery failed` 说明回调网页失败。

剪贴板、文件、分享按钮直接验证 WebView 中的 Web API，页面会显示调用结果。当前仓库没有自有的 HarmonyOS、Android 或 iOS 原生宿主模块，因此这些按钮的成功不代表原生桥接已完成；后续接入宿主模块时可沿用此路由做对照验证。
