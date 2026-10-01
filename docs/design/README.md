# Eotion Design Workspace

本目录用于 P5.7 UI/UX Foundation 的设计 source of truth。

当前阶段：**P5.7.3 Design System v1**。Gate A 前不修改正式 Product UI。

## Reading order

1. [UI/UX Audit](ui-ux-audit.md) — ✅ P5.7.1 PASS
2. [Stitch Design Brief](stitch-design-brief.md) — ✅ P5.7.2 探索输入
3. [Design Direction — Quiet Studio](design-direction.md) — ✅ P5.7.2 FROZEN
4. [Design System v1](design-system-v1.md) — 当前人类可读规范，DRAFT
5. [DESIGN.md](DESIGN.md) — 当前 AI / implementation-facing contract，DRAFT
6. [Core Screen Design](core-screen-spec.md) — P5.7.4
7. 用户批准 Gate A
8. Implementation（Gate A 后另建计划）
9. [Visual Acceptance](visual-acceptance.md)

总计划见 [P5.7 UI/UX Foundation](../p5-ui-ux-foundation.md)。

## Authority

设计 source of truth 优先级：

```text
design-direction.md
        ↓
design-system-v1.md
        ↓
DESIGN.md
        ↓
approved core screen designs
        ↓
implementation
```

如 Stitch 导出的 `DESIGN.md` / HTML / Tailwind / Material Symbols 与本目录正式文档冲突，以本目录正式文档为准。

## Rules

- Design Direction 已冻结为 Quiet Studio，不再重新做视觉方向探索。
- 设计决策先写文档，再进入实现。
- 不把当前代码里的偶然 CSS 数值直接视为 Design System。
- Stitch 负责视觉稿 / 状态稿，不再作为最终规范 authority。
- 多模型可以 critique，但不能各自修改 production UI。
- Gate A 前不进入 P5.7.5。
- P5.7.3 不猜测尚未设计的 Dark / Mobile / responsive 精确值；这些进入 P5.7.4 后再冻结。
