# Architecture

这里记录**当前真实架构**与稳定的技术事实。

建议按领域拆分，例如：

```text
architecture/
├── README.md
├── system-overview.md
├── backend.md
├── frontend.md
├── data.md
└── integrations.md
```

原则：

- 描述“现在是什么”，不要把决策历史塞进这里。
- 能从源码轻易得到的信息不需要重复记录。
- 架构变化后及时更新；过时内容应删除或标记。
- “为什么这么设计”优先写入 `docs/decisions/`。
