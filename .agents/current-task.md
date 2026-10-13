# 当前任务：P11.1D Property Lifecycle Fence（PASS，已完成并停止）

基线：e0238a324d47a421ddfb1f0b60358dd7bd1dc661（P11.1C PASS 收口），开始时工作树干净。
实现提交：16da8cfdb7753e7a26bc0fc2d491a9b95517d754；验收/交接为本文件所在收口commit。
正式版本仍0.0.1，P11目标0.0.3。本轮只到D，未进入P11.2。

| Work Unit | 模式 / 难度 / 角色 | 目标 | 状态 |
| --- | --- | --- | --- |
| D-1 | investigate / S0 scout | mutation / Board / Mongo CAS与测试Evidence Pack | 完成 |
| D-2 | decide / S2 主Agent | 统一View Property dependency及候选schema边界 | 完成，执行降至S1 |
| D-3 | execute / S1 fast_worker | hard fence、soft repair、真实view.type | 完成，主Agent复核 |
| D-4 | execute / S1 fast_worker | Mongo/HTTP生命周期、CAS、rollback、并发回归 | 完成 |
| D-5 | verify/review / S0 scout + reviewer | 测试/build/typecheck、独立review | 完成，0 blocker |
| D-6 | execute / S1 主Agent | 契约、验收、交接、commit | 完成 |

## 最终模型

内部DatabaseViewPropertyDependency.required：Board grouping/select、Timeline日期/date、
dependency/self-relation。删除或候选type/target破坏硬引用409；不清空/替换配置。
Frozen Table visibleProperties/propertyOrder是soft：删除时移除ID，保留其他配置。
updateProperty/changePropertyType/deleteProperty事务内先读Views、检查硬引用、候选schema
及真实view.type最终校验，后写Property/Record与View repair CAS。共享Database CAS防并发
新引用和破坏mutation同时成功；Property/View CAS冲突回滚。旧同类型no-op、Board文案、
Table/List opaque options和通用Record转换行为保持。新建非法非self View config仍400，
已有dependency下Relation retarget409；不改变C输入错误契约。

## 验证和接续

Domain48/48、Contracts25/25、SDK23/23、API四文件22/22、MCP30/30，合计148，0failed/skipped。
D定向1/1是API子集。相关typecheck与API build、diff/UTF-8无BOM、独立review0blocker。
全新Mongo8.2.3 replica set p111dAcceptance/27713已admin shutdown，PID43988退出，端口关闭。
日志：C:/Users/31250/AppData/Local/Temp/eotion-p111d-e8af2b28a6cd41cdb4614e4f8edc314c。
未执行完整Web Product/Database/E2E/Visual、原生真机、performance、sync/file全套及P11 Final。

正式契约docs/p11-timeline.md§21.5；完整证据docs/verification/p11-1d-property-lifecycle-fence.md。
下一步仅新指令下开始P11.2，从现有Timeline占位、options.timeline和generic records做只读renderer；
linkInPage仍Table-only，Linked Timeline后续需要单独明确接入/测试。本轮已停止。