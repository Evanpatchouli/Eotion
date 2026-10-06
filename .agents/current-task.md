# Current Task — P6.2 MCP Read Tools

2026-10-06；只实施 P6.2，P6.3/P6.4 不开始。基线 master 3394832，工作区初始干净。

## Work Units
1. S0 investigate / scout：现有权限、Page/Block、editor schema 与验证 Evidence Pack（完成）。
2. S2 decide / 主 Agent：最小稳定 DTO、有界服务查询与验收 Brief（完成）。
3. S1 execute / fast_worker：PageService 权限复用、repository 标题查询/id cursor、BlockService 有界读取。
4. S1 execute / fast_worker：MCP DTO 转换、三个只读工具、转换单元测试。
5. S1 execute / fast_worker：真实 /mcp transport integration 回归。
6. S0 verify / scout：typecheck/build/API tests；主 Agent 真实 Codex CLI 验收与清理；reviewer 最终一次独立 review。

## Implementation Brief / Invariants
- MCP → PageService/BlockService → 现有 WorkspacePermissionService → repository，不复制 ACL。
- list/search 只返回 summary；id 升序游标，默认 50/20，最大 100；query trim 1–200，literal case-insensitive 标题搜索。
- get_page 从 PageService 按 pageId 定位 workspace 并检查权限；不存在/越权统一通用错误。
- DTO 明确白名单：page id/workspaceId/title/parentPageId/updatedAt；block id/type/可读 text 与当前类型必要语义字段，不透传 props/node/内部字段。
- get 最大 1000 blocks、每 block 100000 文本字符、节点深度 32/总数 10000；只读工具单结果 JSON UTF-8 最大 1 MiB。超限失败，不静默截断。
- 不新增写工具、Resources、Prompts、搜索基础设施或未来 Database 抽象。

## Status
P6.2 completed / PASS。全仓 typecheck、API typecheck/build 通过；MCP 6/6（transport 1 + mapper 5）、domain 2/2、HTTP/Sync/File 26/26 通过。Codex CLI 0.156.1 真实完成四工具链并读出两段正文与稳定 IDs，exit 0。独立 review 无代码 blocker；过期阶段说明已修正。临时账号/页面/Token/数据库及服务已清理，剩余测试数据库 0。git diff --check 通过，lint N/A。正式证据在 docs/p6-mcp.md。P6.3/P6.4 not started，到此停止。
