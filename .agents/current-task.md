# Current Task — P5.5 Attachments

基线 master bb4a653，与 origin/master 一致；开始时工作区干净。版本保持 0.0.1 / build 1。

## 目标与 invariant

正式 Page Editor 图片/文件附件；二进制在线上传到既有 API / ali-oss-server，稳定 snapshot 走原有 Block / LocalStore / oplog / P5.4 sync。未知 attrs 拒绝写；每 Block 独立 fileId；删除本地提交且同步确认后才清理远端；清理状态持久化并按当前账号授权的 workspace 重试。Web 是唯一 renderer，Mobile 沿用 WebView，不新增原生宿主。

## Work Units

1. 调查 S0：API/MIME 与 Storage/IPC/ack 两份独立 Evidence Pack；主 Agent 核对 Editor/UI。
2. 决策 S2（GPT-6.1 Sol）：确定 attrs schema、MIME 流式识别、cleanup queue ack gate、上传/导航补偿；形成 Brief 后执行降为 S1。
3. 执行 S1：Domain/Contracts/SDK/API MIME 与测试；LocalStore IndexedDB/SQLite/IPC cleanup 与测试，互不重叠。
4. 执行 S1：Morphicons 基础层及正式系统图标；Editor node/上传/Slash/drop/paste 与正式 PageView 接线，互不重叠。
5. 验证 S0：规定命令、产品回归、真实双客户端、Desktop/Mobile 构建；Playwright desktop/tablet/mobile Visual QA。
6. Review：GPT-6.1 Sol High 独立 blocker review，修复后验证；文档与每个逻辑单元 commit。全部 exit criteria 满足前不标 PASS。

## 状态

实现、自动验收与独立 review 已完成。Browser plugin not available；使用已有 Playwright 验证。产品 72/72、存储/Electron 10/10、真实双客户端 1/1、API domain 2/2、HTTP 24/24、SDK 14/14、storage 6/6；规定 typecheck/build 与 version check 通过。修复了响应性、NodeView 图标事件、取消/重试并发、卸载、401、未落盘清理与首次对象删除失败等 review blocker。

P5.5 PASS：已部署 OSS 的生产 Web 双客户端完成真实 PNG/文件上传、刷新、URL 200 字节校验与删除；Mongo metadata 和已删除 OSS URL 均为 404。Desktop/Tablet/Mobile 截图已人工复核，390px 无横向溢出。早期 smoke 遗留对象依据隔离 replica set 的精确 insert oplog 恢复键并逐个清理；最终测试对象均已清理，不做 bucket prefix 扫描。线上验证未输出凭据或修改生产配置。

已提交：`de592b0` API/契约、`19db80f` 两端清理存储、`822c51c` 正式 UI/图标/产品链；`3be7ba0` 触摸与可移植 QA 输出；文档验收作为最后单元提交。正式结果见 `docs/p5-attachments.md`。P5.4 原生宿主待验收和 P5 Final Acceptance 未关闭。本轮临时 API/preview 已停止，隔离 Mongo 测试容器已移除；截图留在仓库外。
