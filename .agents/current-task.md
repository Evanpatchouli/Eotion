# Current Task — P4.1 TypeScript domain runtime build

## Goal

在 `186a4712ccb072ff47d2ff1cb0b381c41e51450d` 上删除 `packages/domain/src` 的手写 JS/声明文件，以单一 TypeScript 常量构建 Node 可加载的运行时产物，保持 P3/P4.1 行为。

## Work units

| ID | 模式 / 评级 | 边界与验收 | 状态 |
| --- | --- | --- | --- |
| W1 | investigate / S0 | 核对基线、domain package/tsconfig/exports 与所有消费者的构建边界。 | 完成：本地与远端一致；仅 API 运行时消费常量，其余均类型导入。 |
| W2 | decide / S2 | 确定 TypeScript 构建产物格式、导出映射与 clean clone 构建顺序。 | 完成：tsc 构建 CommonJS，API dev/build 显式先构建 domain。 |
| W3 | execute / S1 | 实现单一 TS 常量、package 构建/exports、API 命令接线、删 workaround 并同步文档。 | 完成 |
| W4 | verify/review / S0 + Review | 执行指定验证、Node runtime smoke、独立 review、提交推送。 | 完成：指定验证与 Node 22.12 smoke 通过，独立 review 无 blocker。 |

## Constraints

不进入 P4.2，不改 Block 类型集合、P3 BlockRecord 或 P4.1 Mongo 行为；不新增 bundler，不修改 `.codex`。
