# Current Task — P5.4 Real Sync

基线：`2dc9ae49e3b7025f05c6dcacf8cd889ce1bc04c9`；开始时工作区干净，`git pull --ff-only` 已确认最新。

## 目标与数据安全约束

正式 Page Tree 和 Editor 先写 durable LocalStore 与 oplog，后台 Push 再 Pull。任何 workspace 仍有 pending/failed operation 时拒绝远端 snapshot replace；离线重启仍可进入已缓存的账号和工作区并继续写。401 必须撤销缓存身份。P5.5、CRDT、实时协作不进入本任务。

## 工作单元

1. **调查/决策（S0→S2）**：分别核对 storage/IPC、API/contracts/SDK、Web 产品链路和测试，写出数据流、事务/权限 invariant 与最小接口。
2. **执行（S1/S2）**：snapshot 只读 API、contract/SDK；`page.move` canonical operation 与服务端复用 PageService。
3. **执行（S1/S2）**：LocalStore 两端实现 workspace 查询、page move、原子 remote replace 及 pending 拒绝，补数据完整性测试。
4. **执行（S2→S1）**：独立 ProductSyncCoordinator、按当前账号可访问 workspace 过滤发送、离线 auth/workspace cache、Page Tree 与 Editor 本地优先接线和状态。
5. **验证（S0）**：定向单元/集成、Web 产品测试、要求的全套命令、尽可能真实 Mongo/API/Web 双客户端及 Electron 路径。
6. **Review/收尾**：独立 review 重点检查覆盖风险、重试 ID、跨账号、active editor；修复 blocker，更新正式文档、复核 diff，按逻辑单元提交并 push。

## 当前状态

代码、文档与独立 review 已完成；review/旧测试揭示的活跃 Editor 回拉、Web 离线 app shell、空段落保存与同步刷新导致编辑器重建均已修复。contracts、storage、SDK、API、Desktop、Web `test:product` 55/55、`test:storage` 9/9、真实 Mongo/API/Web 双客户端与完整断网 app shell 测试已通过。Mobile WebView 默认 LAN HTTP 真机离线重启未验收，在该边界闭合前不标记完整 P5.4 PASS；后续验收交接见 `.agents/handoff.md`。
