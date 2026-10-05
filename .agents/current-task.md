# Current Task — Attachment Insert UX Fix

2026-10-06；master；聚焦通用 Web 编辑器附件插入反馈与 frozen target。

## Work Units
1. S2 decide / worker：最小 runtime placeholder 与冻结位置方案。
2. S1 execute / fast_worker：按 Brief 实现占位、位置与生命周期。
3. S1 execute / fast_worker：focused Playwright 回归，位置/生命周期/动态 UI。
4. S0 verify / scout：typecheck、编辑器/附件/product/web 回归、diff check。
5. Review / reviewer：一次独立 blocker 复核；主 Agent 整合、提交并 push master。

## Invariants
不修改 attachment contract、backend、同步协议、LocalStore/oplog、版本、native host 或其他编辑器功能。占位仅 runtime，不进入 JSON。保留 cleanup/lost response/epoch/IME/durable save 与 object URL 生命周期；多文件顺序以选择顺序为准。

## Status
实现完成：运行时 decoration/widget 占位、打开 picker 前冻结插入目标、空段占用/非空段后插、失败/取消/重试/保存失败回滚与多文件选择顺序。
验证：web typecheck 通过；附件专项 23/23；完整回归（editor/component/product/web）204 用例通过；git diff --check 干净；独立 reviewer 无 blocker（位置回退风险已加防御）。
待办：主 Agent 提交并 push master；用户在 nova 14 按 A–E 专项复测。
