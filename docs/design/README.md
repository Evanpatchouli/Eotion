# Eotion Design Workspace

本目录保存 P5.7 UI/UX Foundation 的设计文档。

## Document ownership

设计文档只保留四类职责：

| Document | Purpose |
| --- | --- |
| `ui-ux-audit.md` | 现状问题与设计输入，不定义最终规范 |
| `design-direction.md` | 产品视觉方向（Quiet Studio） |
| `design-system-v1.md` | 唯一 Design Token 来源 |
| `DESIGN.md` | AI / implementation-facing contract |

辅助文档：

- `stitch-design-brief.md`：设计探索输入，不是 source of truth。
- `core-screen-spec.md`：核心页面规格。
- `visual-acceptance.md`：视觉验收标准。

## Reading order

1. [UI/UX Audit](ui-ux-audit.md)
2. [Design Direction — Quiet Studio](design-direction.md)
3. [Design System v1](design-system-v1.md)
4. [DESIGN.md](DESIGN.md)
5. [Core Screen Design](core-screen-spec.md)
6. [Visual Acceptance](visual-acceptance.md)

## Authority

```text
design-direction.md
        ↓
design-system-v1.md
        ↓
DESIGN.md
        ↓
approved screen specifications
        ↓
implementation
```

规则：

- Design System 是 Token 唯一来源。
- DESIGN.md 不重复维护完整 Token，只描述实现约束。
- 探索稿、截图审计、AI 输出均不能覆盖正式设计规范。
- 当前 CSS 不自动成为 Design System。
- 未冻结的 responsive / mobile / dark 细节不要提前实现。
