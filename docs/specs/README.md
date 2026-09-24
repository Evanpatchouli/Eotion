# Specs

这里记录 Eotion **应该做什么**：用户可见行为、业务规则、协议/API 契约、兼容性要求和验收标准。

适合建立独立 spec 的场景：

- 一个 Roadmap Phase 中会长期存在的产品行为；
- Web / Electron / Mobile 需要共同遵守的交互或数据契约；
- API、同步协议、权限或持久化行为；
- 单靠实现代码不容易看出完整验收标准的能力。

建议结构：

```md
# Spec: <能力>

## Goal
## Non-goals
## Behavior
## Edge cases
## Compatibility / platform constraints
## Acceptance criteria
## Related tests
## Related ADR / architecture
```

原则：

- 能由自动化测试稳定表达的行为，同时写成测试；不要只依赖自然语言 spec。
- 当前系统结构写到 `../architecture/`，技术选择原因写到 `../decisions/`。
- 不为尚未进入当前 Roadmap Phase 的能力提前写大而全的 spec。
