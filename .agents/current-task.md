# 当前任务：Page snapshot convergence / editor remount correctness

master；基线 a37aba8dd36ced4f1bf1683418dfb2cad185140e。范围仅快照比较与回归；25 分钟停止，最迟 30 分钟。

| Work Unit | 难度 / 模式 / 角色 | 状态 |
| --- | --- | --- |
| 最小 mismatch 证据 | S0 investigate / scout + fast_worker | 完成：props 完全相同，orderKey 不同；测试 mock 漏 block.move |
| 比较语义决策 | S2 decide / worker | 完成：忽略 JSON 对象字段插入顺序，保留真实 props/树变化 |
| 聚焦实现与生命周期回归 | S1 execute / fast_worker | 完成：两处 props 比较共用 canonical JSON；mock 处理 block.move |
| targeted tests、typecheck、diff check | S0 verify / scout | PASS：新增及原 Phone 5/5，相关 Editor/Sync 13/13，Web typecheck、diff check |
| 最终独立复核 | Review reviewer | 完成：无 blocker |
| 额外 Database opening tests | S0 verify / scout | PASS：8/8（required checks 全绿后执行） |

原失败 phone-view-settings baseline orderKey=000000000000000001000000000000，snapshot=0000000000000100；props、parent、type 一致。编辑器新增尾段落后 rebalance 发出 block.move，旧 mock ACK 但未落库，导致 snapshot 返回旧次序。补齐 mock 后原例无需放宽生产 order 检查即通过。

独立回归在旧比较实现上 3 红 / 1 绿；修复后等价 props 键重排保持 EotionEditor/DatabaseNodeView/Phone Filter、Sort Drawer 的 DOM、Vue 实例和未保存草稿，真实 paragraph 更新仍 reload。snapshotRevision 到达与 PageView 比较完成均显式等待；MutationObserver 检查无瞬时卸载。dirty 检测同用比较，数组次序、props 值、ID/type/parent/order、增删仍能识别变化。

未修改 PageView fences、local-first draft、sync contract 或 Drawer Motion；未执行 Final Acceptance、Universal Block +、P9 或完整 Database suite。

Remaining issues：Drawer Motion final re-acceptance、Universal Block +、Database UX Final Acceptance。