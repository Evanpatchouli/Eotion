# P2 编辑器概念验证

开发模式入口：`http://localhost:5173/#/__dev/editor-p2`，也可从工作区侧栏进入。生产构建不注册该路由。编辑器仅实现于 `apps/web`，Electron 加载同一 Web renderer，Lynx 移动壳继续加载同一 Web URL。

## 验证范围与当前结果

| 项目 | 当前证据 / 状态 |
| --- | --- |
| Tiptap 3 Extension / Command | 段落、二级标题、项目列表和 Slash 菜单使用 Tiptap Command；Slash 匹配使用 Tiptap Suggestion utility。Web 与 Electron 已运行验证。 |
| `@tiptap/pm` | 按官方 Vue 3 安装组合引入，目前没有直接调用；没有直接添加 `prosemirror-*` 依赖。当前 PoC 尚未出现必须下沉到 Selection、Transaction 或 Decoration API 的需求。 |
| 中文 IME | 页面记录 `compositionstart/update/end`、组合期 transaction 数及 selection；Huawei Nova 14 与 iPhone XS Max 的真实输入法清单由用户人工确认通过。 |
| Selection / Cursor | Web 浏览器中移动光标、拖选文字和 5000 区块末尾选区已验证；两台真机的光标、选区与选择手柄由用户人工确认通过。 |
| Slash Command | Web 中 `/` 菜单、方向键、Enter、Escape 已验证；两台真机的 Slash 与 IME 交互由用户人工确认通过。 |
| 触摸工具栏 / 长按 | 移动布局的底部工具栏在浏览器视口已显示，选区加粗命令已验证；两台真机的触摸工具栏与长按由用户人工确认通过。页面只观察 pointer/contextmenu，不阻止默认行为。 |
| Web | 开发路由、编辑、命令、5000 区块加载与输入已实测。 |
| Electron | 开发态 Electron 窗口实际报告 `runtime: electron`；输入、标题命令和 5000 区块加载已实测。 |
| HarmonyOS WebView | 用户在 Huawei Nova 14（HarmonyOS 6）人工测试，确认 P2 清单全部通过；未记录精确耗时。 |
| iOS WebView | 用户在 iPhone XS Max 人工测试，确认 P2 清单全部通过；iOS 版本和精确耗时未记录。 |

真机结论来自用户在设备上的人工测试，不是当前开发机自动运行结果。两端均确认中文输入、Slash、光标/选区、长按与触摸工具栏、虚拟键盘布局和 5000 区块可用；5000 区块的设备端耗时没有记录，因此只能判定功能与可用性，不能量化移动端性能。

## 自动验证与 Web 操作

```bash
pnpm --filter @eotion/web typecheck
pnpm --filter @eotion/web build
pnpm --filter @eotion/desktop build
pnpm dev:web
```

打开开发路由。在空段落输入 `/`：方向键应改变菜单高亮，Enter 应创建所选 Text、Heading 或 Bullet List，Escape 应关闭菜单并保留输入。拖选文字时，`selection` 应从光标状态变为非空区间。使用真实中文输入法输入词组，检查事件顺序、组合中的光标稳定性、Slash 不误触发，以及输入结束后 Ctrl/Cmd+Z 与 Ctrl/Cmd+Shift+Z 的撤销/重做。页面显示的 transaction 数仅为观察值，不以零为通过条件。

点击“加载 5,000 区块”。fixture 固定生成 500 个标题、4500 个段落（其中 1000 个位于项目列表）、1000 个格式化文本块，合计 5000 个可编辑文本块。页面应显示实际渲染 5000；随后在末尾输入单字符、移动光标并拖选。记录生成、`setContent`、至下一绘制机会和最近单字符输入至下一帧的耗时，同时观察浏览器是否严重卡顿或崩溃。这些数值是浏览器内轻量观测，并非标准化性能基准。

当前一次本机 Web 观察：首次加载生成 1 ms、`setContent` 47 ms、至下一绘制机会 134 ms；重复加载分别为 1/12/24 ms。两次实际渲染均为 5000，末尾输入单字符至下一帧为 15 ms，选区可用，未观察到严重卡顿或崩溃。设备、浏览器和机器不同需重新测量。

## Electron 操作

运行 `pnpm dev:desktop`，从工作区侧栏打开“编辑器 P2 演示”。确认仪表台显示 `runtime: electron`，执行输入、Slash、选区和 5000 区块步骤。当前开发态 Electron 窗口已实测普通输入与标题命令，5000 块实际渲染，生成 2 ms、`setContent` 76 ms、至下一绘制机会 90 ms。`apps/desktop` 的 renderer 配置直接指向 `apps/web`。

`pnpm --filter @eotion/desktop typecheck` 当前因 `electron.vite.config.ts` 在 CommonJS 模式导入 ESM 包报 TS1479；该配置未被 P2 修改，桌面 build 成功。此项需另行修复，不能视为 typecheck 通过。

## 移动 WebView 人工验证与复测

1. 在开发机运行 `pnpm dev:web` 和 `pnpm dev:mobile`。按 [P1 WebView 步骤](p1-mobile-demo.md)在 Huawei HarmonyOS 或 iOS 设备的 Lynx Explorer 扫码。可从侧栏进入 P2；若直达，在 `apps/mobile/.env` 设置带引号的 `EOTION_WEB_URL="http://<开发机局域网 IP>:5173/#/__dev/editor-p2"`，重启移动 dev server。
2. 确认页面和编辑区加载，记下 runtime/layout/input/width；若 runtime 显示 `web`，记录实际 UA 和 Lynx 环境，不把标签误判为编辑器已在普通浏览器运行。当前 Shell 没有显式注入 `EotionMobile` UA 标记。
3. 使用设备上的中文输入法输入词组、删除、换行并撤销/重做。通过条件：组合事件完整，文字无重复/丢失，候选选择时光标不乱跳，Slash 菜单不在组合过程中误触发。
4. 用手指移动光标、长按文字并拖动系统选择手柄。通过条件：选区与仪表读数一致，原生选择/复制菜单仍可用；底部触摸工具栏可执行粗体、斜体、文本、标题、列表，不意外丢失选择。
5. 打开虚拟键盘后在文档首尾编辑、旋转屏幕、切换后台再返回。通过条件：编辑区/光标没有被键盘长期遮挡，工具栏位于可视区域，现有内容和 focus 不意外丢失。页面的“可视视口底部遮挡”数值仅辅助判读。
6. 加载 5000 区块，记录页面的耗时；在文档末尾输入普通字符并拖选。通过条件：5000 块加载且仍可输入、移动光标和选择，没有严重卡顿或崩溃。复测时记录机型、系统、WebView/Lynx 版本及异常现象。本次两台设备的精确耗时未记录。

## 已知限制

- 两台真机的 P2 功能清单已由用户人工确认通过；精确加载与输入耗时、iOS 版本及 WebView/Lynx 版本未记录，浏览器模拟移动宽度不能替代这些设备结果。
- `runtime` 的 mobile-webview 标签依赖 UA 包含 `EotionMobile`，当前 Lynx 壳未显式设置该值，需在真机核对。
- PoC 没有持久化、协作、完整 Notion 命令系统或虚拟化；重载页面会恢复初始内容。
