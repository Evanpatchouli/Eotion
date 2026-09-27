# Current Task — P3 query reload helper

## Goal

在 P3 开发页验证 Lynx Explorer / Mobile WebView 中相同 origin 下修改 query 并真正 reload 后 IndexedDB 数据仍可读，不改变存储架构。

## Work units

| ID | 模式 | 边界与验收 | 状态 |
| --- | --- | --- | --- |
| W1 | investigate/decide | 核对最新 master、P3 页面、router、LocalStore 与现有测试；决定 clientId/sequence 范围。 | 完成：LocalStore 无只读 metadata API，本轮不扩展契约。 |
| W2 | execute | 增加按钮、URL 信息、#14 真机步骤与 Playwright 覆盖。 | 完成 |
| W3 | verify/review | 执行 Web typecheck/build/storage 与布局相关测试，独立复核 diff。 | 完成；无 blocker。 |

## Constraints

保留已有真机清单排版改动；不改变 LocalStore、IndexedDB schema、Mobile WebView adapter、Electron SQLite 或其他阶段行为。

## Verification

`@eotion/web` typecheck/build 通过，storage Playwright 7/7，Workspace Layout / Safe Area / zoom / route Playwright 10/10；`git diff --check` 与 UTF-8 无 BOM 检查通过。目标真机 #14 待执行。
