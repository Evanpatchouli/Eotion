# Current Task — P2 编辑器概念验证

## Goal

在 `apps/web` 建立可重复验证的 Tiptap 3 PoC，并记录 Web、Electron、HarmonyOS WebView 的真实验证状态；不进入 P3。

## Work units

| ID | 目标与输入/输出 | 验收条件 | 验证方式 | 预计修改范围 | 难度 | 状态 |
| --- | --- | --- | --- | --- | --- | --- |
| T1 | 基于现有 Web 开发路由和 runtime context，输出独立编辑器页与 Tiptap Extension/Command 骨架 | 开发路由可输入、可切换 Text/Heading/Bullet；生产不注册；同一 Web renderer 可供三端加载 | Web typecheck/build、浏览器冒烟 | `apps/web` 依赖、路由、编辑器组件与页面 | S2 | done |
| T2 | 基于 T1 编辑器，输出 Slash 菜单、IME/selection 观察仪表和交互 | `/` 菜单支持键盘上下/Enter/Esc；composition 中不误触发；选区和事件可观察，真实中文 IME 有人工步骤 | 相关逻辑测试或浏览器交互、人工 IME checklist | 编辑器 Extension、Slash UI、PoC 页面 | S2 | done |
| T3 | 基于同一 schema，输出确定性约 5000 区块 fixture 与轻量耗时观测 | 加载成功，记录就绪与普通输入耗时，能重复检查光标/选区及卡顿 | fixture 测试、浏览器性能运行 | fixture、PoC 页面、验证文档 | S2 | done |
| T4 | 基于现有 input/layout/runtime 模式，输出触摸工具栏、长按观察和三端验证说明 | 触摸可操作、原生长按选择未被拦截；Web/Electron 实测，HarmonyOS 无设备则明确人工待验 | 浏览器移动视口、Electron smoke、设备 checklist | 编辑器触摸交互、PoC 页面、`docs/p2-editor-demo.md` | S2 | done |

## Constraints

- `apps/web` 是唯一编辑器 UI；不复制到 Electron/Lynx。
- 优先 Tiptap 公开 Extension/Command/Suggestion；仅有明确不足才使用 `@tiptap/pm/*`，不直接安装 `prosemirror-*`。
- 每个可工作的逻辑单元分别提交；不做 P3 持久化、P4 服务端、P6 协作。
- HarmonyOS 与 iOS 设备结果来自用户人工测试；缺失的性能数字不作推测。

## Evidence / blockers

- 现有 `WorkspaceView.vue` 是 `contenteditable` 占位区；P1 路由在 `import.meta.env.DEV` 下注册。
- 官方 Tiptap Vue 3 指南建议 `@tiptap/vue-3`、`@tiptap/pm`、`@tiptap/starter-kit`，Slash 可用 `@tiptap/suggestion`。
- T1 Web typecheck/build 通过；开发路由浏览器输入及 Heading 命令已运行验证。
- T2 Web typecheck/build 通过；浏览器确认 `/` 菜单、方向键、Enter、Escape 与选区读数。两台真机的真实中文 IME 由用户人工确认通过。
- T3 fixture 结构断言为 5000 个可编辑文本块；Web 浏览器两次加载均实际渲染 5000 块。首次生成 1ms、setContent 47ms、至下一绘制机会 134ms；重复加载为 1/12/24ms。末尾字符输入至下一帧 15ms，选区正确。
- T4 移动布局工具栏显示并执行加粗；Electron 实际窗口报告 `runtime: electron`，输入/标题命令和 5000 块加载成功；Mobile bundle build 通过。独立 reviewer 未发现可证实的 blocker。
- 用户在 Huawei Nova 14（HarmonyOS 6）和 iPhone XS Max 人工确认中文 IME、Slash、光标/选区、长按与工具栏、虚拟键盘、5000 区块清单均通过。设备端精确耗时与 iOS 版本未记录。
- Desktop typecheck 对未改动的 `electron.vite.config.ts` 报 TS1479；desktop build 通过。

## Next action

P2 验证记录已完成。Desktop typecheck 的现存 TS1479 属于单独修复事项；不进入 P3。
