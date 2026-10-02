# Current Task — P5.8.1 Real Document Canvas / Editor Architecture Spike

状态：完成（2026-10-02）；独立 reviewer 未发现阻塞项。

## Work Units

- S0 investigate：主 Agent 读取依赖、现有 Editor、设计契约；scout 独立定位验证命令与 CSS / production 隔离证据。
- S2 decide：新增 DocumentEditor，保留既有产品 Editor；初始 JSON 输入、JSON update、动态 editable、focus()，实例仅组件持有。
- S1 execute：fast_worker 按 Brief 实现 primitive、隔离开发入口、回归与架构文档。
- S0 verify：typecheck、build、常规浏览器 regression、1440×900 / 390×844 截图。
- Review：一次独立 reviewer，主 Agent 复核最终 diff / 编码 / 提交。

## Implementation Brief

复用已安装 @tiptap/vue-3、StarterKit 3.31.3。DocumentEditor 只接收初始 content（更换文档用 Vue key 重建），editable 默认 true、ariaLabel；update 输出 JSON-safe 深拷贝；expose 仅 focus(): void。useEditor 已拥有 mount/create 与 unmount/destroy。输入亦深拷贝，不共享 attrs 引用。StarterKit 禁用 link / underline，其他基础默认。不直接用 ProseMirror API、不接 API / store / blockCodec / 附件。采用 Quiet Studio tokens 和 740px open canvas，无 toolbar / 卡片。DEV lazy route /__dev/editor-foundation；开发按钮 readonly / reset / focus / mount，序列化与输入不变证据。真实浏览器测试 lifecycle、初始内容、键盘编辑/格式/JSON、readonly、focus、重置与对象隔离、双尺寸无错误无溢出。

## Scope

不修改正式 Product 页面和原 EotionEditor；不实现 persistence / autosave / sync / Block Model / 附件或其他 Forbidden 项。单一聚焦 commit。

## Verification

- 根目录 pnpm typecheck 通过（Web / Desktop / API）。
- pnpm build 通过（Web / Desktop / Mobile / API）。
- 14 个既有常规浏览器 spec：149/149 通过；新 Editor suite：3/3 通过。
- 真实 production build + preview 路由隔离：1/1 通过，开发入口 fallback 到登录；开发页与新原语无 production assets。
- 主 Agent 检查 1440×900 和 390×844 截图；真实输入、只读、JSON、focus、reset、mount/unmount、无错误/溢出均通过。
- 独立 reviewer 无 blocker；输出对象主动修改测试为可选增强，当前深拷贝机制已复核。
- 11 个修改/新增文本文件 UTF-8 无 BOM，diff 检查通过；现有产品 Editor / LocalStore / sync / domain 均未修改。
- 截图与既有回归日志位于仓库外 C:/Users/evanpatchouli/.codex/visualizations/2026/10/02/eotion-editor-foundation。
- Electron 运行时、移动 WebView 真机、Mongo 集成与 offline-shell 未运行；本轮无相应链路改动。