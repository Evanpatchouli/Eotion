# Current Task — P6.3 MCP Write Tools

2026-10-06；基线 206860d，初始工作区干净。只实施 P6.3，P6.4 不开始。

## Work Units
1. S0 investigate / scout：Page/Block、事务与 Sync Evidence Pack（完成）。
2. S2 decide / 主 Agent：原子业务操作、CAS、持久幂等与稳定 DTO Brief（完成）。
3. S1 execute / fast_worker：严格 write schema、文本 block codec、round-trip 单元测试（完成）。
4. S1 execute / fast_worker：共享排序 helper、Page 版本推进与 Block 写入事务（完成）。
5. S1 execute / fast_worker：application reconcile、持久 receipt；integration tests 独立文件（完成）。
6. S0 verify / scout + 主 Agent：现有验证、真实 Codex CLI、清理；reviewer 最终独立复核（完成）。

## Implementation Brief / Invariants
- adapter 仅验证/映射契约与调用 application service，复用 PageService/BlockService/WorkspacePermission。
- create/update 只在 Mongo transaction 可用时执行；standalone 明确失败，不做部分写入 fallback。
- mutation 与成功 receipt 同事务提交；无外部 pending 状态，abort/crash 不锁 key；唯一 (userId,tool,key)，canonical payload hash 不同则 conflict。
- replay 在 CAS 前，且重新校验当前权限；结果在事务内生成与大小检查后保存。
- update page.updatedAt conditional write；每个普通 HTTP/Sync block 写入在同事务推进页面版本，保证严格单调，避免毫秒碰撞。
- 数组顺序由共享 domain helper 分配，page/block UUID 由 server 生成；existing ID 必须属于目标页面与工作区。
- 8 种文本 block 可写；image/file read-only；平面列表用 items，简单 quote 用 paragraphs，禁止解析含糊展示文本/暴露 AST。
- 1000 blocks、100000 文本字符、10000 nodes、32 深度、最终 DTO 1 MiB；超限在提交前失败。

## Status
P6.3 completed / PASS。MCP 14/14、domain 2/2、HTTP/Sync/File 26/26；全仓 typecheck、API typecheck/build、Web build、git diff --check 通过，lint N/A。真实 Codex CLI 两次 exit 0，完成 create/get 和 search/get/update/get，最终一页三个 Block 与两条 receipt；临时数据库全部清理（剩余 0），API/Mongo 进程已停止。真实 standalone 明确拒绝且无 Page/Block/receipt。独立 reviewer 的多段列表结构与 read 数量边界 blocker 已修复、回归并复核，无剩余 blocker。正式证据在 docs/p6-mcp.md。P6.4 not started，到此停止。
