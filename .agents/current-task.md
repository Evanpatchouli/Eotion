# Current Task — P3 Mobile WebView IndexedDB

## Goal

将 Mobile WebView 的 P3 LocalStore 直接接入 Web 共用的 IndexedDB adapter，移除失效的 storage 专用 Lynx bridge，并保留通用 ping/pong bridge。更新 P3 文档、真机清单与自动化覆盖，验证后提交并同步 master。

## Work units

| ID | 模式 | 边界与验收 | 状态 |
| --- | --- | --- | --- |
| W1 | investigate/decide | 核对远程 master、storage 引用和 P3 现状，确定删除边界。 | 完成：master 与 origin/master 一致；旧 storage bridge 引用已定位。 |
| W2 | execute | 平台选择、Mobile Shell、共享协议、P3 Demo 和测试调整。 | 完成 |
| W3 | execute | 同步 P3 架构文档和真机清单，保留历史桥验证记录。 | 完成 |
| W4 | verify/review | 相关测试/构建、diff/编码、独立复核、提交及推送。 | 验证与独立复核完成；无 blocker，真机项目待测 |

## Constraints

不触碰 `.codex`；保留 `eotionRuntime=mobile-webview`、P1 通用 WebView ↔ Lynx bridge、Safe Area、Workspace Layout、page zoom 与 Electron SQLite。P3 不实现移动原生存储或同步服务。真机 IndexedDB 生命周期验收须如实标记待测。

## Verification

`@eotion/storage` test 5/5、typecheck；`@eotion/web` typecheck/build、storage Playwright 4/4；`@eotion/mobile` build；`@eotion/desktop` typecheck/test 2/2；Workspace Layout、Safe Area、zoom/route Playwright 10/10。目标真机 IndexedDB 持久性 15 项仍待验证。
