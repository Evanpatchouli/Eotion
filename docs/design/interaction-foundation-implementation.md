# P5.7.5.3 Quiet Studio Interaction Foundation

共享交互位于唯一主 UI `apps/web`，Desktop 与 Mobile Shell 继续复用 Web renderer。此次只改变 primitive 和 ProductShell / PageTree 的展示接入，不改变业务页面、Editor、Block、LocalStore 或同步流程。

## NavItem

`components/ui/EotionNavItem.vue` 提供 `active`、`disabled`、`rowClass` 和 `rowStyle`。原生主按钮接收 attrs、ARIA 和 click；`leading`（树展开）、`icon`、默认文本、`trailing`（次级操作）slot 组成一行。展开与 trailing 操作都是主按钮的 sibling，不创建嵌套按钮，也不会触发主按钮导航。disabled 状态下次级操作应使用 slot 提供的 disabled 属性；组件同时约束次级区域的交互。

32px 桌面行、coarse pointer 44px 行沿用现有密度约定。hover / active / pressed 使用语义 token；键盘 focus-visible 使用独立 outline；无卡片或阴影。ProductShell 设置/退出、工作区列表和 PageTree 使用同一个 primitive，业务动作仍由原有父组件执行。

## SyncStatus

`components/product/SyncStatus.vue` 直接消费 `useProductSyncStore()`，不启动或改变同步生命周期；恢复动作只调用既有 `retry()`。状态映射顺序如下：

| store 条件 | 展示状态 | 文案 |
| --- | --- | --- |
| failed | error | 同步失败 · N 项待同步 · 重试 |
| offline | offline | 离线 · 本地已保存 |
| syncing | saving | 正在同步… |
| pending > 0 | saving | N 项待同步 |
| synced 且无 pending | synced | 已同步 |
| idle 且无 pending | 空白（data-state=idle） | 不宣称已同步 |

状态以可读文本和 polite live region 表达，不只依赖颜色。错误/离线优先于待同步数量；Topbar 不消费编辑器尚未落盘的保存状态。

## Command Overlay

`components/ui/EotionCommandOverlay.vue` 暴露 `v-model:open`、`label`、`shortcut`（默认开启 Mod+K）和默认 slot 的 `close()`。容器使用原生 `dialog.showModal()`，进入浏览器 modal top layer；背景不可交互，Tab/Shift+Tab 约束焦点，空内容时由 dialog 接收焦点。Escape / 外部 model / slot close 关闭并恢复打开前焦点；卸载清理监听并恢复可用焦点。

快捷键忽略 IME composition、repeat、额外 Alt/Shift 和已消费的事件；已有其他 modal dialog 时不抢占。重复快捷键不关闭或重建当前容器。`shortcut=false` 可禁用绑定。它不依赖 Router、Pinia、搜索或命令业务；本阶段不在产品中加入空的命令入口，后续 Command/Search 消费此容器。尺寸和 token 仅为基础容器约束，不构成新的产品 Command 高保真冻结稿。

## 验证入口

开发验证路由 `/#/__dev/interaction-foundation` 仅在 DEV 注册，使用导航计数和独立 Pinia 实例中的现有 store 作为状态 fixture。通过公开 `piniaSymbol` 向子组件注入，卸载时 dispose；不修改或恢复真实 store 的旧快照，因此不会覆盖后台同步的新状态。演示 retry 仅计数，没有同步生命周期或业务 API 请求，也不进入生产路由。同步逻辑仍由原有 `product-sync.spec.ts` 验证。

```powershell
pnpm --filter @eotion/web typecheck
pnpm --filter @eotion/web build
pnpm --filter @eotion/web exec playwright test tests/interaction-foundation.spec.ts tests/product-shell.spec.ts tests/ui-foundation.spec.ts
pnpm --filter @eotion/web test:product
```

设置 `EOTION_VISUAL_QA_DIR` 为仓库外目录可输出 interaction / command 的 Light、Dark、390×844 touch 截图，以及正式壳层截图。截图是实施检查证据；开发展示页不是正式产品的高保真 source of truth。

## 修改文件

- 新组件：`apps/web/src/components/ui/EotionNavItem.vue`、`EotionCommandOverlay.vue`；`apps/web/src/components/product/SyncStatus.vue`。
- 展示接入：`apps/web/src/components/product/PageTree.vue`、`apps/web/src/layouts/ProductShell.vue`；`apps/web/src/styles/product-shell.css`、`product.css`（仅清理旧导航行状态样式）。
- 导出与开发入口：`apps/web/src/components/ui/index.ts`、`apps/web/src/router.ts`、`apps/web/src/views/InteractionFoundationDemoView.vue`。
- 回归：`apps/web/tests/interaction-foundation.spec.ts`、`apps/web/tests/product-shell.spec.ts`。
- 文档与任务：本文、`docs/README.md`、`docs/context/README.md`、`.agents/current-task.md`。

## 验收结果（2026-10-02）

Web typecheck 与生产 build 通过。常规浏览器测试最终 149/149 通过（141 个既有测试，8 个新增回归），覆盖产品流程、页面树、编辑器、同步、附件、设置、主题、本地存储和布局；新增覆盖导航主/次动作隔离、按下态、disabled、同步状态优先级、fixture 隔离、Command 快捷键/焦点/关闭/卸载/IME 与手机几何。

独立工程复核无剩余 blocker。截图采集禁用动画后 Interaction suite 再次 7/7 通过；人工核对 1440×900 Light / Dark 与 390×844 touch，没有发现当前 primitive 的裁切或溢出。验证页身份、非空渲染、无 Vite overlay、console/page errors 和目标交互均已检查。Browser 插件未提供，使用仓库 Playwright + Chrome。未运行 Electron、真实 Mongo/API、offline-shell 或 theme-production 的独立配置，本次不更改这些层；本结果不代表整个 P5.7 或宿主真机验收完成。
