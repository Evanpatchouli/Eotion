# Current Task — P4.3 Typed HTTP API + Eotion SDK

Base: `352e2ef9426a73ec884122b17c5c2268f9b591dc` (`origin/master`, 2026-09-29).

## Goal

把 P4.1/P4.2 application services 暴露为有运行时输入校验的 HTTP API，并提供共用 contracts 的浏览器 SDK。保持 opaque Cookie session、owner-only 权限与 Mongo disabled health；不进入 P4.4。

## Work units

| ID | 模式 / 评级 | 边界与验收 | 状态 |
| --- | --- | --- | --- |
| W1 | investigate / S0 | 精确核对 P4 文档、services、包构建与测试设施。 | 完成 |
| W2 | decide / S2 | 定下路由、Cookie、DTO/schema、错误与包运行时边界。 | 完成 |
| W3 | execute / S1 | contracts 运行时 schema、DTO、构建；SDK typed client。 | 完成 |
| W4 | execute / S1 | HTTP controller/guard 与 session Cookie transport。 | 完成 |
| W5 | execute / S1 | HTTP integration/E2E 与文档。 | 完成 |
| W6 | verify/review / S0 + Review | typecheck/build/test/health，独立 review，提交并推送。 | 完成：相关测试与构建通过，review 问题已修复；提交推送记录见 Git history。 |

## Constraints

不暴露 passwordHash/tokenHash；客户端不能提交 userId；Controller 仅调用 application services；不引入 sync、OSS 上传、RBAC 或 P5 UI。
