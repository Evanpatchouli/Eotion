# Current Task — P4.5 File Domain + ali-oss-server SDK

## Goal

完成 workspace-scoped File HTTP API、Mongo metadata、仅服务端使用的 ali-oss-server SDK 对象生命周期，以及浏览器兼容的 Eotion SDK。不要进入 P4.6/P5。

## Work units

| ID | 模式 / 评级 | 验收 | 状态 |
| --- | --- | --- | --- |
| W1 | investigate / S0 | 核对现有领域/HTTP/SDK 与 ali-oss-server SDK 真实接口和 URL 语义。 | 完成 |
| W2 | decide / S2 | 确定上传流、objectKey、metadata ownership、OSS/Mongo 补偿及删除重试边界。 | 完成 |
| W3 | execute / S1 | 实现服务端 adapter、File service、workspace HTTP routes 与 metadata 收紧。 | 完成 |
| W4 | execute / S1 | 实现 contracts 与浏览器 SDK File API。 | 完成 |
| W5 | execute / S1 | fake HTTP server 经真实 SDK 的集成/失败语义测试与文档。 | 完成 |
| W6 | verify/review | 回归与构建、独立 review、修复、提交并推送。 | 完成 |

## Invariants

- `@ali-oss-server/sdk` 仅在 `apps/api` 使用；客户端不接收密钥或 token。
- 每次上传独立 objectKey；Mongo 创建失败先回读确认结果，安全时只清理本次 SDK 返回的 key。
- OSS delete 成功前不删 metadata；重试必须处理对象已不存在。
- 客户端仅能修改 `name`；服务端控制归属、文件属性、objectKey、URL。
