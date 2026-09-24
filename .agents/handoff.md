# Handoff — P2 编辑器概念验证

- Goal: 在同一 `apps/web` Tiptap 3 PoC 上完成 Web、Electron、HarmonyOS WebView 能力验证。
- Current state: 四个实现工作单元已完成；HarmonyOS 真机和真实中文 IME、触摸长按、软键盘验证仍为 `manual verification required`，因此不能把跨端 P2 宣称为全部通过。
- Completed: 开发路由、Tiptap 命令与 Slash、IME/选区仪表、5000 区块 fixture 与耗时、触摸工具栏、Web/Electron 运行验证；详见 `docs/p2-editor-demo.md`。
- Key evidence: Web 两次实际渲染 5000 块，首次生成/setContent/下一绘制机会 1/47/134 ms，重复 1/12/24 ms，末尾单字符至下一帧 15 ms；Electron 窗口报告 `runtime: electron`，渲染 5000 块为 2/76/90 ms。
- Validation completed: Web typecheck/build、Desktop build、Mobile build、浏览器与 Electron 交互；独立 reviewer 未发现 blocker。
- Decisions: 使用 Tiptap Extension/Command 与 `@tiptap/suggestion`；`@tiptap/pm` 按官方组合安装但无直接底层调用；不引入直接 `prosemirror-*`，不进入 P3。
- Next recommended action: 在 Huawei HarmonyOS 6 设备按 `docs/p2-editor-demo.md` 执行 IME、Slash、选区、长按、键盘遮挡和 5000 区块检查，写回真实设备结果。若失败，再定位对应单一问题。
- Risks / blockers: 本环境未连接 Huawei 设备；`runtime` 的 mobile-webview 标签依赖尚未由 Lynx Shell 显式设置的 UA；Desktop typecheck 对原有 `electron.vite.config.ts` 的 ESM 导入报 TS1479，Desktop build 成功。
