# Current Task — P5.3 Real Page Editor

## 目标与边界

在正式 Page 使用与 P2 同源的 Tiptap 3 编辑器，按稳定 Block ID 将顶层节点通过 server-backed Block HTTP 持久化，具备 debounce、串行保存、切页 flush、错误恢复和安全 reload。P5.4 LocalStore/oplog/sync 与 P5.5 附件不在本阶段。

基线：`728ba1a420d5c7a6033ba14450c3cd87597510f8`。开始前工作区干净，`git pull --ff-only` 已确认最新。

## 工作单元

1. **调查 / 决策（S2）**：核对 P2、产品路由、Block API/SDK、测试与文档；确定顶层节点 ID、props codec、orderKey、保存与导航 invariant。
2. **执行（S1/S2）**：补 Block HTTP DELETE、SDK 与定向测试，维持 Sync delete 幂等语义。
3. **执行（S2 → S1）**：抽取 P2/正式产品共用编辑器核心；实现 Block codec/orderKey 与独立 save coordinator，再接 Page UI、状态、切页保护。
4. **验证（S0）**：补正式产品测试及 P2 回归；运行要求的命令集，并尽可能跑真实 Mongo/API/Web 浏览器链路。
5. **Review / 收尾**：独立检查数据完整性与 race；修复 blocker 后更新正式文档、复核 diff、提交聚焦 commit 并按仓库规范 push。

## 关键验收

- 首次 load 无 mutation；普通编辑仅更新受影响 Block；新块 ID 稳定，顺序 reload 一致。
- 不支持的服务端 Block 安全失败；保存失败保留最新编辑并可重试。
- IME 组合期不 flush；切页前 flush，失败阻止导航；旧 load 不能覆盖新页面。
- P2 diagnostics、benchmark、Slash 和触摸工具栏继续可用。

## 结果

**P5.3 PASS / Ready for P5.4 Real Sync。**

- `EotionEditor` 被 P2 Demo 与正式 Page 共用；`BlockIdentity` 稳定顶层 ID，HTML/剪贴板不泄漏 ID；codec 以 `{ node: JSONContent }` 保留 marks、heading、list 等结构，不支持的 Block 阻止编辑。
- `PagePersistence` 用 500 ms debounce、Block ID diff 和串行循环保存；切页/删除/退出前 flush，IME 中暂停；响应丢失的 mutation 在重试前按 Block ID 与服务端校准，保留编辑器最新内容。
- Block HTTP/SDK 增加严格 page scope 的 DELETE；Sync 删除缺失目标仍幂等。
- 独立 review 发现并修复跨页面粘贴 ID 冲突、在途保存的导航/刷新保护、响应丢失后的 create/delete 重试；P2 safe-area 测试定位同步更新。
- 保存请求遇到 401 时在本浏览器内存保留正文，原用户重新登录后回到原页面继续保存；刷新/关闭时仍有离开提示。该暂存不构成 P5.4 离线持久化。

## 验证

- Web `test:product` 44/44、`test:storage` 7/7、safe-area 2/2、build PASS。
- API `test:domain` 2/2、`test:http` HTTP 1/1 + Sync 1/1 + File 22/22、build PASS。
- SDK test 10/10、build PASS；Desktop build PASS；`git diff --check` PASS。
- 真实 Mongo replica set + API + Web 浏览器链路 PASS：注册登录、工作区/页面、正文保存/reload、Block 新增/删除/reload、A/B 页面隔离、390×844 无横向溢出。未进行新一轮 Electron 原生窗口或移动真机人工验收；P2 历史真机结论保留。
- `test:storage` 首次因 Electron 临时 profile 清理 `EPERM` 失败；目标单测和完整 7 项套件重跑均通过。

收尾提交：`feat(p5): integrate real page editor`。
