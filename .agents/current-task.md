# Current Task — P5.4 Backend Unavailable

目标：TypeError / HTTP 502、503、504 时仅凭已有可信身份和账号隔离缓存进入本地产品；401 失效，403/其他 4xx/500 不降级。保留 LocalStore、snapshot marker、授权刷新和 Push-before-Pull。

## Work Units

1. 调查/决策 S0→S2：主 Agent 读取入口、stores、tests，确定共享 transient 判断与 Sync Push 错误传播边界。已完成。
2. 执行 S1：fast_worker 修改 productApi/auth/workspaces/sync，复用当前缓存与同步。
3. 执行 S1：独立 fast_worker 修改 App 启动连接界面，仅无 user 时遮挡 RouterView。
4. 执行/验证 S1→S0：主 Agent 扩展回归用例、Visual QA，运行 Web/Desktop/storage/offline/real-sync 验证。
5. Review：独立 reviewer 检查安全与恢复边界；主 Agent 复核、文档和提交。

## 状态

已完成；工作区开始时干净。无新增缓存、依赖或平台业务分支。

产品 91/91、存储/Electron 10/10、storage 单测 6/6、Desktop 单测 8/8、offline-shell 1/1、真实 Mongo/API/生产 Web 1/1 通过。Web/Desktop typecheck/build 与 diff check、UTF-8 无 BOM 验证通过。真实同步使用隔离临时 Mongo replica set，容器已移除。

真实 localhost:7173 proxy 502 Visual QA 通过：缓存身份+snapshot显示正式本地产品，无身份显示居中连接状态，390px无溢出和页面异常。截图在仓库外。独立review修复离线身份无workspace metadata时错误页重试缺口，复核无剩余blocker。正式行为/验证记录见 docs/p5-real-sync.md；Mobile原生宿主真机验收限制保持不变。
