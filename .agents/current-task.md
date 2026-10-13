# 当前任务：P11.3A Timeline Drag Mutation Foundation（范围 PASS，完成并停止）

基线 3c73470，工作树干净；分支 codex/p11-3a-timeline-drag。版本保持 0.0.1，P11 目标 0.0.3。
只实现整体 Bar drag / local preview / temporal command / 既有 Database mutation / optimistic 与 CAS rollback；完成后停止，不进入 P11.3B。

| 单元 | 模式 / 难度 / 角色 | 输出 | 状态 |
| --- | --- | --- | --- |
| A1 | investigate / S0 scout | Record/cell/CAS/transaction/refresh/Host Evidence Pack | 完成 |
| A2 | decide / S2 主 Agent | temporal 和 interaction / mutation Brief | 完成；single Date 边界用户确认，后续降为 S1 |
| A3 | execute / S1 fast_worker | 纯 temporal command、logic tests | 完成；7/7，commit d2daaa2 |
| A4 | execute / S1 fast_worker | 局部 Drag Controller、父层 adapter、Web 回归 | 完成；新Web6/6 PASS，commit bd561e4 |
| A5 | verify / S0 scout | logic/API/Web/typecheck/build 与 100/500 证据 | 完成；logic35/API19/新Web6/既有Web12+38、typecheck/build PASS |
| A6 | review / reviewer | 最终独立 blocker review | 完成；同帧native-scroll P2已修，最终0剩余确定blocker |
| A7 | execute / S1 主 Agent | 验收、P11、current-task、handoff 与提交 | 完成；正式文档收口commit即包含本文件的提交 |

不变量：timeToX/xToTime 唯一坐标入口；date-only 日历日/ datetime instant offset；range duration/timeZone/shape 保持；不写视觉 exclusive end；unscheduled 不拖；pointer move 仅当前 Bar preview；pointer up 单次 generic Record update；CAS/transaction 复用，不建 endpoint/collection。保 P9 scope/epoch、Editor/NodeView/Record Host/Drawer identity。无 resize/handles/dependency/auto scheduling/multi/bulk/undo/offline/calendar/settings。

## 收口与接续

- 2026-10-13启动，2026-10-14收口；正式验收 `docs/verification/p11-3a-timeline-drag.md`。
- 实现commit `d2daaa2ff899a7e1b450dcb2b9b0daf89e1bcb26` / `bd561e431b55488ad24075f73d1384696b8ced59`。
- single Date Property可拖动；独立Start/End两列用户确认暂只读，因现有cell API不能原子双写。
- 100/500 armed后取样，parent refs稳定，other Bar DOM mutations/Vue updated hooks均0；无每像素网络。
- Desktop/390预览与提交、409回退五PNG已视检/外部存档；RecordHost/Drawer/两个Tiptap与Editor/NodeView保存后身份保持。
- 35logic、19真实隔离Mongo API、6新拖动Web、12既有Timeline/Date/CAS、38Overlay全部通过；Web/API build和typecheck通过。Mongo27715已停止。
- 未运行全Product/P11 Final/native真机/正式帧率benchmark；保留既有chunk提示与Overlay测试代理噪声，不扩范围修复。
- 完成后停止，P11.3B未开始；从mutation.ts/controller/NodeView adapter接续，具体B范围须另行明确授权。无Resize/Dependency/Auto shift/Undo等实现。
