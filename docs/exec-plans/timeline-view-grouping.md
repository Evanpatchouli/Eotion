# 通用 View Select 分组与 Timeline 接入

状态：2026-11-15 用户已批准实施。本方案冻结产品行为与验证边界；具体查询索引和准确计数的成本先实测再定。实施前 Timeline 尚无分组，Board 仅把已加载的全局分页窗口在前端分列。

## 目标行为

- 分组属于通用 View，首期按同库 Select 属性分组，供 Timeline 与 Board 复用；不创建 Timeline Group 实体或第二套 Record。Select option 按属性定义顺序展示，包括空组。独立的“未分组”收纳缺失、null 和失效 option 值，不借用可能与真实 option ID 冲突的字符串。
- 分组条件与 View 的持久或临时 Filter 做 AND。每组由服务端独立分页，在筛选及组归属确定后才取窗口；不能先取一页全局 records 再在客户端分组。显式 Sort 保持当前多字段顺序及 Record ID tie-break；无 Sort 时，组内顺序是该 View 已有持久手序的投影，新 Record 仍追加到 View 总序尾部。
- 每个组有自己的 opaque cursor，绑定 Workspace、Database、View、组键、实际生效的配置、Database/View 版本及 Record/Page 锚点。不同组的 cursor 不能混用；数据、配置或顺序变化使旧 cursor 明确 409。空组返回空窗口和 null cursor，不用其他组的窗口推断结束。
- 组可折叠。首选在设备本地按用户、Workspace、Database、View、组键记忆折叠状态，避免影响其他用户或仅因展开/折叠使所有服务端游标失效；切换设备的同步折叠状态不在首期范围。折叠组不加载记录，展开后读取该组窗口。
- Timeline 各组共用一个横向时间轴与标尺；组标题占独立的纵向视觉行，标题和记录行的
  坐标由同一个布局模型提供给冻结表、时间网格、依赖线、虚拟窗口和焦点恢复。折叠只
  隐藏该组记录，不改变其他组记录的业务顺序。
- 跨组拖动更新所选 Select 属性。无显式 Sort 且提供目标组锚点时，Select 修改与目标锚点前/后的手序精确放置必须在**同一事务**完成；失败不得只完成其中一步。空目标组及无锚点放置的规则需在实现前冻结，候选为追加到目标组末尾。有显式 Sort 时只改变 Select 值，显示位置由 Sort 决定，不写手序。同组拖动继续使用通用手序，但服务端须校验 source 和 anchor 属于同一当前组。隐藏记录的相对顺序保持不变。

## 模型与接口边界

- 扩展 generic `DatabaseViewConfig` 的 Select 分组配置与校验，兼顾 Board 已有 `options.groupByPropertyId`；Property 改型、删除及 option 生命周期在现有事务/CAS 边界内保护或显式修复。具体 config wire shape 和 Board 兼容方式在契约工作单元冻结，不能仅靠 renderer 解释未知 options。
- 新增 generic 按组 records 查询和跨组写入的公共 Contracts、SDK 与 HTTP 接口。组键采用可区分真实 option 与未分组的结构。查询复用现有 Record/Page 投影、Filter/Sort、View 手序、权限及 cursor fence。写接口传 source/target 组、可选目标锚点与 before/after、预期 Database/View/Record 版本；服务端在事务快照中重查归属、目标 option、筛选可见性与锚点，不接受客户端提交的当前页完整位置数组。
- 对当前无旧数据迁移的约定保持一致：新分组配置与读取路径不默默猜测损坏的 View/Record 元数据；无法安全解释时明确冲突。不会为本功能新增隐藏的记录总量上限。

## 待验证决策

- 准确的每组总数可能要求对所有选项执行筛选后的计数，尤其 Title、Relation、Date Filter 与大量 Select options 会增加扫描。先用真实 Mongo explain 和 10k/100k 数据测量。若可接受，返回准确计数及其版本语义；若不可接受，应另行确认延迟计算或维护通用 membership/count 索引，不能把当前已加载数量标作全库总数。
- 隔离 Mongo 8.2 的 100,000 条样本中，单次全组计数无 Title Filter 约 287 ms、扫描
  100,000 个文档；加入 Title contains Filter 后约 21.57 s、扫描约 200,001 个文档。
  当前分组接口不返回总数；这些是特定本地样本，并非延迟保证。稀疏分组首窗约 368 ms，
  同样扫描约 100,000 个 Record。后续优化需验证索引与数据一致性，不得伪造查询结束。
- 按组谓词能否在现有动态属性结构上高效索引、空组/未分组查询成本、组窗口与 Timeline 行虚拟化如何衔接，均以真实查询计划和 Web 行为验证后定。首屏只请求可见且展开的组，避免对每个 option 无条件全库扫描。
- 跨组无锚点、目标锚点被筛选隐藏或并发删除、移动后记录不再满足当前 Filter 时的回执及 UI 提示，在写接口契约中明确；不得自动重试 409 或未知提交结果。

## 验收与工作单元

1. **契约决策：**冻结配置 wire shape、组键、折叠本地键、空组与未分组、无锚点规则、准确计数策略；补 Domain/Contracts/SDK 测试。
2. **服务端读取：**实现每组服务端查询及 cursor；隔离 Mongo 覆盖空组、混合 Filter、显式 Sort、手序同 slot 跨页、临时查询、失效 cursor 和 10k/100k explain，不截断扫描伪造 EOF。
3. **服务端写入：**实现跨组 Select 与无 Sort 精确锚点手序的单事务提交；验证权限、归属、Database/View/Record CAS、筛选隐藏项、并发、删除/重建、回滚及未知结果。
4. **Web 接入：**Board 与 Timeline 共享组模型和逐组窗口；实现本地折叠、空组、加载更多、拖动/键盘替代、冲突刷新，并保持 Editor/NodeView 身份及 Timeline 日期拖动仲裁。
5. **独立验收：**真实 HTTP/Mongo、SDK、完整相关 Web 回归、Desktop/Tablet/Phone 与性能复核；记录准确计数方案及未达到的性能目标。

本方案新增公共行为、View 配置和查询/写入契约；用户已确认这些产品与 API 影响。
