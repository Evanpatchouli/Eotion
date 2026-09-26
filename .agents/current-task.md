# Current Task — Workspace Layout 路由重构

## Goal

将 Workspace 壳提取为共享父路由 Layout；首页与 P1/P2/P3 dev 页面进入同一个 `.main-pane / .document-wrap`，保持 URL、Safe Area、zoom 与 storage 行为。

## Work units

| ID | 模式 | 边界与验收 | 状态 |
| --- | --- | --- | --- |
| W1 | investigate | 核对现有路由、壳、页面样式及相关测试，确认滚动和导航边界。 | 完成 |
| W2 | decide | 父路由持有唯一 Layout；`/` 和 dev URL 为子路由；首页标题来自 store，dev 标题来自 meta。 | 完成 |
| W3 | execute | 提取 Layout、瘦身首页、调整路由和必要页面样式，补充路由/滚动测试及文档。 | 完成 |
| W4 | verify/review | Web typecheck/build、Mobile build、storage 与路由/Safe Area/zoom Playwright、独立复核、diff 和编码检查。 | 完成；独立复核无 blocker |

## Constraints

保持 `.app-viewport` Safe Area 与 `VITE_ALLOW_PAGE_ZOOM` 语义；不改 Mobile storage bridge、P3 diagnostics 协议、LocalStore、RPC/oplog/reconnect、原生存储或真机测试状态；不触碰 `.codex`。

## Evidence

Web typecheck/build、Mobile build、storage Playwright 5/5、Workspace Layout + Safe Area + zoom Playwright 10/10 通过。生产预览中 P3 开发 URL 重定向到首页，开发入口不可见。桌面与手机尺寸 P3 渲染、breadcrumb 和无页面错误已检查。
