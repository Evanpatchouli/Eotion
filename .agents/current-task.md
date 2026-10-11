# 当前任务：Drawer Motion（NO PASS）

分支 master；基线 a9c206722e6d4c5bf05cff54e2212297729d6113。

| Work Unit | 难度 / 角色 | 状态 | 验收 |
| --- | --- | --- | --- |
| 调用边界调查 | S0 scout | 完成 | 受控异步保存与 slot 清理边界已验证 |
| Motion / close lifecycle | S2 worker | 实现完成 | Vue Transition 保留离场 vnode；200ms/170ms；接受关闭后才 leave |
| 定向测试 | S1 fast_worker | PASS | Overlay 35/35；IME、reduced motion、快速切换、焦点与资源清理 |
| 指定验证 | S0 scout | PASS | Database opening/record 14/14；Web typecheck、build:web、diff check |
| 交互回归调查 | S2 worker / S3 deep_solver | 已取证，范围阻断 | 手机排序面板被 snapshot 引发的父编辑器重建卸载 |
| 独立复核 | Review reviewer | 完成 | 动效完成回调、取消、受控关闭与焦点路径复核；整体不放行 PASS |

关闭请求立即交给现有受控父级，异步保存接受后 open=false 才触发 leave；拒绝保存不退场。退场保留旧 vnode/正文，完成后 dialog.close / unmount / unlock / focus restore。避免延迟 emit 误关闭背景中新打开的 Record。

最终验证（workers=1，retries=0）：Overlay 35/35、Database opening/record 14/14；Web typecheck、build:web、git diff --check 通过。保留已有 >500kB chunk warning。

扩展验证不可报全通过：完整 Database 首次稳定服务重跑 54/56；失败为 phone filter/sort（1355:1389）与 edits versioned cells（1790:1896/1897）。恢复 baseline nextTick 显示/聚焦时序后 Desktop 单例通过，Phone 正常速率仍失败，trace 降速会通过。隔离加载基线 Overlay 的两例 2/2 通过，确认 motion 时序暴露可观察回归。

Phone 正常速率浏览器 probe 已证实：Sort Drawer 入场后 PagePersistence.matchesLocalBlocks 返回 false（block 数量相同，mismatch ID phone-view-settings），随即整个 .eotion-editor 与 Database NodeView/Overlay 移除并重建。对应 PageView snapshotRevision -> loadBlocks -> editorRevision key 重建链。没有 Overlay close request。修复涉及本轮禁止修改的父编辑器/Sync 生命周期；未擅自越界，未削弱断言。所有 probe/diagnostic/临时 baseline config 已清理或按字节恢复。

本轮 NO PASS：保留手机交互阻断，不宣称完整 Database suite 或 UX 通过。一个聚焦 commit 后停止。
Remaining issues：Universal Block +、Database UX Final Acceptance；不开始 P9。
