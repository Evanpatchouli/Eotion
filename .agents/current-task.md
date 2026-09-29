# Current Task — P4.2 Auth / Session / Workspace Permission Foundation

Base: `95cb1308275d219fa92a4c04591cccc96b1f3797` (`origin/master`, 2026-09-29).

## Goal

建立 User、email/password 认证、Mongo hash-only Session，以及 owner-only workspace 应用服务权限边界；不进入 P4.3 transport/SDK。

## Work units

| ID | 模式 / 评级 | 边界与验收 | 状态 |
| --- | --- | --- | --- |
| W1 | investigate / S0 | 核对登录要求、P4.1 service/测试/索引及授权缺口。 | 完成：无既有登录标识约束；Mongo 集成设施可用。 |
| W2 | decide / S2 | 定下 User、密码摘要、Session 生命周期与授权 API。 | 完成：email/password、scrypt、opaque token hash、AuthService.login 签发。 |
| W3 | execute / S1 | 实现 User/Auth/Session schema、repository、service 与测试。 | 完成 |
| W4 | execute / S1 | 为 Workspace/Page/Block/File 应用服务接入用户权限并补测试。 | 完成 |
| W5 | execute / S1 | 更新 P4.2 文档和索引。 | 完成 |
| W6 | verify/review / S0 + Review | 执行 build/typecheck/Mongo integration/health，独立 review，提交推送。 | 验证与独立 review 完成，无 blocker；提交推送记录见 Git history。 |

## Constraints

保持 P3 和 P4.1 领域模型兼容；raw password/token 不持久化或输出；Mongo disabled health；禁止 P4.3+ 能力和 `.codex` 修改。
