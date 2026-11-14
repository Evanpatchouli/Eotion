# 通用 View 记录手动排序

状态：实施中。2026-11-15 用户确认允许调整数据模型、通用写 API 与分页规则。

## 产品契约

- 顺序属于 View，不属于 Timeline；同一 Database 的其他 View 保持各自顺序。
- 没有显式 Sort 时可手动移动记录；有 Sort 时禁止手动移动，服务端也要拒绝。
- 拖动发送 source、anchor 和 before/after，不提交当前页的完整数组。筛选后的可见
  顺序不变时为 no-op；隐藏记录彼此的相对顺序保持不变。
- 新记录追加到每个 View 的末尾；过滤、分页、刷新及删除后顺序仍正确。
- 客户端不可用、冲突和未知提交结果不得触发自动重试或假报成功。

## 数据与查询

- 每个新 Record 在创建事务内取得不可变 `creationOrdinal`，取本次 Database CAS 后的
  version。默认位置为 `(creationOrdinal, '1')`；它不进入公开 Record DTO。
- 每个 View 有不可复用的内部 scope。仅对移动过的记录保存该 scope 下的
  `(recordId, slotOrdinal, rank)`；rank 使用仅含 `0/1` 且以 `1` 结束的稠密 ASCII 键，
  按 Mongo simple collation 比较。新记录序号大于已有 slot，所以自然追加。
- 无显式 Sort 的读取合并两个有序流：未覆盖 Record 的创建序号流，以及该 View 的
  override 流。两流在过滤、排除覆盖项后各取 `limit + 1`，再以完整位置键归并。
  override 流足额时，其最后位置可作为默认流的远端边界，避免密集覆盖的无谓扫描。
- 原游标仍绑定 Workspace、Database、View、有效配置、数据库和视图版本、末条记录及
  Page 版本；续页在同一 scope 回查锚点位置。真实顺序变化使旧游标失效。
  临时查询以实际生效的 filters/sorts 计算 hash 和读取路径。
- 按用户确认不做旧数据兼容迁移；缺少创建序号的历史记录必须明确报错，不能静默漏行。

## 写入与生命周期

- 通用 `POST .../views/:viewId/record-order` 接受 recordId、anchorRecordId、before/after
  和 Database/View 版本。事务内校验权限、归属、持久 Sort、筛选可见性与两个版本；
  先检查筛选后的相邻 no-op，再按完整未筛选顺序确定实际邻居和新位置。
- 每次实际重排在同一事务写 override 并推进 Database/View 版本；失败整体回滚。
  409 只刷新，不自动重试；提交结果未知时客户端保持只读并提示刷新。
- 删除 Record 时清理其活跃 View overrides。删除 View 在事务中登记退休 scope，后台
  分批幂等清理；新建同 ID View 使用新 scope，不能读到旧顺序。
- 排序键超出数据库安全边界时必须在写前明确拒绝，不能截断或生成重复位置。

## 验证

隔离 Mongo 覆盖跨页双向移动、每 View 独立、筛选隐藏项/no-op、显式 Sort、追加、
删除和同 ID 重建、临时查询、过期 cursor、权限/CAS/并发及事务回滚。性能测试记录
零覆盖、稀疏覆盖、99% 覆盖和极稀疏筛选的扫描量与延迟，不以截断扫描伪造结束。
Web 覆盖纵向重排与横向日期拖动、依赖连接、触摸滚动、键盘、离线、冲突和视图切换。
