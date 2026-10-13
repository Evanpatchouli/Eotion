# 当前任务：P11.3B Resize Range Mutation（范围PASS，完成并停止）

基线 `288bdc1`，工作树干净；分支 `codex/p11-3b-timeline-resize`。版本保持0.0.1，目标0.0.3。只执行B，完成后停止，不进入C。

| 单元 | 模式 / 难度 / 角色 | 输出 | 状态 |
| --- | --- | --- | --- |
| B1 | investigate / S0 scout | temporal/adapter Evidence Pack | 完成 |
| B2 | decide / S2 主Agent | 端点/snap/共用controller Brief | 完成，执行降S1 |
| B3 | execute / S1 fast_worker | 纯函数、logic/API回归 | 完成；commit6cb2803 |
| B4 | execute / S1 fast_worker | 共用preview与handles | 完成；commit251c1a3 |
| B5 | execute / S1 fast_worker | Web/100/500/视觉回归 | 完成；7新Web/43logic/17旧回归PASS |
| B6 | verify / S0 scout | 隔离Mongo、typecheck/build | 完成；最终19/19，临时Mongo已关闭 |
| B7 | review / reviewer | 最终独立blocker review | 完成；两项边缘命中问题已修，0剩余blocker |
| B8 | execute / S1 主Agent | 契约、验收、handoff与提交 | 完成；正式收口commit包含本文件 |

不变量：single Date Property；range左右handle只改对应端，越界clamp至相等；point仅右向创建end，legacy string必要升级object；all-day exclusive视觉日界逆回inclusive日期；scale.futureSnapUnit相对原端snap，date-only最细day；datetime保UTC/timeZone/另一端/毫秒。共用session/preview，move0PATCH/up最多1existing cell PATCH；双CAS/transaction、409 canonical refresh、unknown-state与identity fences复用。

验收入口：`docs/verification/p11-3b-timeline-resize.md`。43logic、7新Web、17旧定向回归、19真实API最终PASS；Web/API typecheck/build PASS。100/500 parent refs保持、other Bar DOM mutations/Vue updated hooks均0。Desktop/390 Light/Dark及390 preview五PNG已视检，console/pageerror定向断言通过。

首轮两项旧回归时序失败，单测与完整复跑通过，原因未证明；不声称完整Product全绿。另有一个未设置隔离URI的API test被及时中断且无结果，不作验收，执行疏漏见验收页。最终API在6cb2803已提交测试源上用独立27716/p113bFinal与全新dbpath，19/19通过并留完整日志；PID29880优雅shutdown、27716无监听。

独立Start/End仍只读，需generic transactional multi-cell mutation后另行支持。不实现Dependency/auto shift、multi/bulk、Undo/Redo、offline、Calendar/settings/inline Date editor或C polish。未运行全Product/P11 Final/native真机/正式帧率benchmark，不发布不改版本。

完成B后停止。C接续入口：TimelineBar.vue handles/focus、useTimelineBarDrag.ts shared session/cancel、mutation.ts/snap.ts端点、DatabaseNodeView.vue原adapter及P11.3A/B测试矩阵；必须后续独立启动，不自动扩展延期能力。
