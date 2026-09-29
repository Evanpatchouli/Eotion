# Current Task — P4.1 small hardening

## Goal

在 commit `7339a80cbe9572ff9a0ed45da3039c5216eaa707` 上收敛 BlockType runtime 常量、文件集合命名，并记录未来 Sync 时间/version 与 application error 边界；不进入 P4.2。

## Work units

| ID | 模式 / 评级 | 边界与验收 | 状态 |
| --- | --- | --- | --- |
| W1 | investigate / S0 | 核对 master 基线、共享类型调用、Mongo 目标及 `filemetadatas` 数据。 | 完成：本地与远端一致，配置为本机 eotion；旧/新文件集合均不存在。 |
| W2 | execute / S1 | 单一 BlockType 常量、文件集合改名、定向测试与文档约束。 | 完成 |
| W3 | verify/review / S0 + Review | 最小 typecheck/build/test、独立 review、diff 检查、提交推送。 | 完成：受影响验证通过，独立 review 无剩余 blocker。 |

## Constraints

不迁移真实数据；不实现 Auth、Sync、OSS、MCP 或新错误模型；不改变 P3 BlockRecord 行为。
