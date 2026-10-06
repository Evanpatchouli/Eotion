# 当前任务：P7.5 Advanced Blocks Final Acceptance

状态：PASS（2026-10-11）；P7.1–P7.4 已 PASS，本轮基线 `84f5c0d`，本轮只做 P7.5 验收，不新增 Block、不开始 Database。

| Work Unit | 模式/评级 | 负责 | 结果 |
| --- | --- | --- | --- |
| 混合文档端到端 + 交互/local-first/MCP/兼容/性能现状调查 | investigate/S0 | 主 Agent | Context Pack |
| 混合文档验收、回归与边界判断 | verify/S0 | 主 Agent | product 211/211、visual 6/7（既有基线） |
| 两处 blocker 最小修复（registry 收窄 + 属性归一化） | execute/S1 | 主 Agent | contentRules + 回归，BLOCKER 0 |
| 独立只读 review（两轮定向复核） | Review | reviewer | BLOCKER 0 |

验收结果：见 `docs/p7-advanced-blocks.md` 的「P7.5 Advanced Blocks Final Acceptance」。

修复：

1. 编辑器可产出 codec/domain 拒绝的结构（paste/input rule 产生 `li > heading`、`blockquote > table`），导致整页永久无法保存 —— 用 registry 派生 `listItem`/`blockquote` 的 ProseMirror content。
2. `<ol type="A">` / `<ol start="abc">` / 非法 cell span / HTML 注入 `blockId` 同类漏洞 —— 属性归一化。
3. P7.3 回归：Toggle 子块内 slash「折叠列表」静默无效 —— 修正 `isBlockCommandRangeSafe` 的容器误判。
4. 测试环境：Vite watcher 因 Playwright 临时目录 EBUSY 崩溃 —— `server.watch.ignored`。

下一步：P7 Advanced Blocks COMPLETE；不开始下一阶段（Database / 协作等），等待用户指令。
