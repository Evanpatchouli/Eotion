# Current Task — P4.5 SDK 1.1.0 收尾

## Goal

升级 `@ali-oss-server/sdk` 到 1.1.0，移除 CommonJS 加载 workaround，贯通真实文件名与上传取消，验证 P4.3/P4.4/P4.5 回归。不上线 P4 Final Acceptance 或 P5。

## Work units

| ID | 模式 / 评级 | 验收 | 状态 |
| --- | --- | --- | --- |
| W1 | investigate / S0 | 同步 master；核对当前上传链路、测试及 1.1.0 正式契约。 | 完成 |
| W2 | decide / S2 | 确定 Fastify 请求断开信号和补偿边界。 | 完成 |
| W3 | execute / S1 | 升级依赖，传文件名与 signal，删除动态 loader，更新文档与测试。 | 完成 |
| W4 | verify/review | clean install、指定回归、独立 review、修复、提交并推送。 | 完成 |

## Invariants

- 保留 `FileObjectStorage → AliOssObjectStorage → AliOssServerSdk`。
- Mongo 持久化 SDK 返回的最终 objectKey；删除继续 OSS → Mongo，并按 objectKey 条件删除。
- SDK 上传结果不确定时，不猜测远端 objectKey 或误删对象。
