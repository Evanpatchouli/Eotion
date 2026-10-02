# Current Task — P5.8.2 Editor Architecture Convergence

## Scope

统一 `DocumentEditor` 与 `EotionEditor` 的 Tiptap 创建、生命周期、StarterKit 基线及 `EditorDocument` JSON 边界；保留产品编辑器的扩展、事件、附件与现有持久化行为。单一聚焦提交。

## Work Units

- S0 investigate：核对两组件、`blockCodec`、实际实例 consumer 和回归入口。
- S2 decide：共享 core 仅拥有 `useEditor` 生命周期、基础扩展、初始/输出 JSON 副本、editable、aria 和 focus；产品扩展与 Tiptap 回调从 `EotionEditor` 提供。StarterKit 关闭 link、underline，以匹配现有 `blockCodec` mark 范围。P2 基准页仍需实例，保留当前仅开发链使用的 expose。
- S1 execute：新增轻量 composable，迁移两组件；正式页面链路使用既有 `EditorDocument` 类型；补充边界回归并修正文档。
- S0 verify / Review：执行 typecheck、build、编辑器/附件/持久化回归、Desktop/Mobile viewport 烟测；独立复核最终 diff，完成单一提交。

## Invariants

- `DocumentEditor` 仍只公开 `focus()`，不引入产品依赖。
- `EotionEditor` 保留 BlockIdentity、附件、Slash、IME、事件、工具栏和 visualViewport 行为。
- `blockCodec` 保持唯一 Block ↔ Editor JSON 映射，业务映射语义不变。
- Core 不依赖 API、LocalStore、Sync、PagePersistence、workspace、附件或 Block。

## Validation

- Web `typecheck` 通过；最终 Web `build`（含 vue-tsc）通过。
- `editor-foundation.spec.ts` 5/5、`product-editor.spec.ts` 18/18、`product-attachments.spec.ts` 15/15、`product-sync.spec.ts` 41/41 通过。
- 编辑器开发页生产隔离 1/1 通过；Desktop 宽度与 390px Mobile 宽度的浏览器回归无明显 UI 问题。
- 一次并行套件中的 P2 Slash 用例未出现菜单；该用例单独及串行完整 suite 重跑通过。初次基础页 JSON 输出失败已定位为 core 注册未提供的 Tiptap callback，修复后 5/5 通过。
- 独立 review 未发现 blocker；最终 diff check 与 UTF-8 无 BOM 检查通过。

## Limits

- 本轮未运行 Electron 原生窗口或移动真机输入法；Desktop/Mobile UI 以浏览器宽度和移动 runtime 回归覆盖。
- P2 5,000 块 fixture、Slash 与撤销回归通过；长文连续输入时的额外 JSON 克隆成本尚未单独测量。

## Status

完成（2026-10-02），提交主题：`refactor(editor): converge document editor architecture`。
