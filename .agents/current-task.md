# 当前任务：P7.2 Rich Blocks Final Acceptance

状态：P7.2 已 PASS（实现提交 139a6ff）。本轮只做验收收尾，不新增功能，不开始 P7.3。

## 验收结果

- product：完整 `test:product` 执行 3 次（默认多 worker 1 次、`--workers=1` 2 次），每次 173/175；失败项每次不同且都是与 Callout 无关的既有 flaky，逐个单独复现通过；`product-attachments.spec.ts:147` 在干净基线 c687f1d 上同样失败。
- visual：6/7，唯一失败 `Connectivity backend unavailable desktop` 与基线像素差一致（21748 px，ratio 0.02）。
- 回归：domain 11/11、contracts 6/6、storage 7/7、API domain 2/2、HTTP 26/26、MCP 21/21、Electron storage 11/11、typecheck、Web/API build、`git diff --check` 全部通过；无 lint 脚本。
- 独立只读 review：无 blocker；两个 minor（blockquote 内 block 级块保存被拒、hardBreak marks 校验不对称）已记入 docs/p7-advanced-blocks.md 已知限制。

## 下一步

P7.3 Nested Blocks UX 未开始；启动前先处理上述两个 minor（可选）。
