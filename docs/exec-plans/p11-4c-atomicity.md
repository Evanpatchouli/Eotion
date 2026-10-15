# P11.4C Atomicity Design Gate

基线 d662dec83c849ce8d2ec4c09ab566ae72c0fa272；2026-10-16。范围仅 P11.4C。用户已明确授权必要的 generic transactional multi-record / multi-cell 能力及 unknown-result resolution。

## Evidence Pack

- `DatabaseService.updateRecordCell` 每次单 Cell 独立事务，先 Database compareAndBump，后 Record updateProperties CAS；不能组合成 cascade。
- `DatabaseRecordRepository.updateProperties` 可一次替换合并后的完整 properties 并 version +1；`list` 有 10,000 + 1 扫描界限。
- 所有 View / Property / Relation 编辑共用 Database version fence；View 另有 version。
- `transact` 使用 Mongo snapshot transaction；无 replica set 拒绝写。MCP/sync receipts 不覆盖 Database mutation。
- Web `moveTimelineRecord` / `mutateTimelineDependency` 已有 scope/epoch/root/config、busy、offline、409、unknown 防护；当前 unknown 只比较 loaded 单记录，不能用于 cascade。
- Date validator/normalizer 为 `packages/domain/src/date.ts`；separate Start/End renderer 使用各 Cell 的 normalized start。手动 Start/End 继续只读。
- `dependency.ts` 和 `dependencyMutation.ts` 已冻结 depends-on target→owner、blocks owner→target。调度器只接 semantic predecessor/successor。

## 十项门禁决定 / Implementation Brief

1. 新增 generic `POST .../databases/:databaseId/cell-mutations`。执行器一次 snapshot transaction 内读取 DB/Properties/View/Records，规划、校验全部变更、统一写入及 committed receipt，任一步失败整体回滚。
2. 请求 `records:[{recordId,expectedRecordVersion,cells:[{propertyId,value}]}]`，合并完整 properties 后每 Record 仅调用一次 repository CAS。禁止通过多次单 Cell PATCH 执行。
3. 同 Record 多 Cell 先合并，统一 validator，再一次 CAS；Start/End 平移因此原子。
4. 实际变化整批 Database version +1；全部 no-op 不 bump。Database CAS 仍在 no-op 时校验。
5. 每个 changed Record version +1；未变化不 bump。重复 record/cell target 拒绝。
6. 显式 root/client targets 全携带 expected Record version；server 生成 cascade targets 使用同事务 canonical snapshot 中的 Record version，和同一 Database CAS 共同封住 graph。
7. 服务端直接有界读取本库 canonical records，不走 View filters/pagination，不经 Web 补全，不 N+1。扫描最多现有 10,000 records，超过 fail closed；affected 最多 500 records / 10,000 edges，最终最多 1,000 Cell mutations。不得 truncate。
8. mutationId 唯一、绑定 user/workspace/database/request hash；先预登记 pending receipt，业务事务内改 committed，确定事务失败后改 not_committed。未知 commit label/receipt read failure 保持 uncertain。GET receipt 仅确认同一批 identity；missing/pending 为 uncertain，不能当失败。客户端不自动重试 mutation。
9. Planner 纯 domain/service logic，稳定 topo + aggregated constraints，输出 generic properties patch；cycle / limits / invalid interval 整体失败。预登记 receipt 不是业务数据写入；失败 0 Date/Relation/DB-version writes。
10. DTO/route 为 generic Database Cell batch，optional `context:{viewId,expectedViewVersion}` 只表达执行当前 View policy。server 读取 canonical View policy，从 date source Cell 更新或 Relation added edge 推导 root intent。无 Timeline 专属实体/API，也不信任 Web graph plan。context 仅允许单 root Cell intent，避免歧义；generic 无 context 可批量多 Cell。

## 调度语义冻结

- date-only point finish=start；显式 range finish=inclusive end 次日，datetime 精确 instant；保留 wire shape、timezone、ms、显式 end、elapsed duration。
- 混合精度沿既有 domain 日期排序使用 date-only UTC day boundary；required instant 落 date-only 当天中间时向未来 ceil 到下一 calendar boundary。display timezone 不参与。
- no_auto_shift 0 cascade，cycle 允许；overlap 仅 future 推到 max(currentStart, incoming finishes)；keep-gap 每边取 root mutation 前 max(0, oldSuccStart-oldPredFinish)，加入 incoming constraint。
- root 接受用户值，不由 incoming 拉动；从 outgoing 向下游传播，multi predecessor 聚合全部 incoming，diamond 单次规划/写入；affected scheduled reachable cycle fail closed，无关 cycle 忽略。
- unscheduled successor 不造日期且停止该路径；root 无日期不传播。dependency delete 0 shift；create Relation 与 cascade 同事务。
- avoidWeekends 只约束需自动调整 successor 的新 start；周末 calendar roll 到周一，datetime 按值自身 IANA 时区保本地钟点与毫秒、跨 DST，range 保 elapsed duration，不采用工作日时长。
- pointermove 继续 root/line preview only；release 一次请求，之后只刷新已有窗口。no_auto_shift 保持原单 Cell 路径。

## 验证

Domain 语义/性能；Contracts/SDK；真实随机端口随机 DB replica set 的 generic batch / canonical policy / rollback / concurrent / receipt HTTP；Web pointer integration 与全部现有 Database 回归；独立 reviewer 0 blocker 后才可 PASS。Mongo 必须结束关闭，不访问用户 27017。
