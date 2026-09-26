# Current Task — Web zoom preferences

## Goal

为 Web bootstrap 增加独立的 double-tap / pinch zoom 环境开关；默认 false，保持当前 viewport 和 Safe Area。仅 Web 层变更。

## Work units

| ID | 模式 | 验收 | 状态 |
| --- | --- | --- | --- |
| W1 | investigate | 已确认入口为 `apps/web/src/main.ts`，全局样式在 `base.css`，viewport 在 `index.html`，已有 `safe-area.spec.ts`。 | 完成 |
| W2 | decide | bootstrap 读取两个 Vite env；double-tap 用 root class + `touch-action: manipulation`；pinch 修改现有 viewport 并保持初始化幂等。 | 完成 |
| W3 | execute | 最小代码、`.env.example`、README 说明及四种组合的 Playwright 覆盖。 | 完成 |
| W4 | verify/review | Web typecheck/build、Mobile build、storage 与 Safe Area Playwright、diff/编码复核后单独提交。 | 验证与复核完成，待提交 |

## Constraints

不改 Lynx Shell、bridge、LocalStore、RPC、oplog/reconnect、真机测试状态；保留已有无关工作区改动。

## Evidence

Web typecheck/build、Mobile build、Web storage Playwright 5/5、zoom preferences + Safe Area Playwright 8/8 通过。实际双开关 true 的 Web 服务在手机尺寸 Chrome 中确认单一 viewport meta、CSS class / touch-action、菜单点击与无页面错误；复用两项均为 true 的开发服务再次运行 zoom Playwright 6/6 通过。目标设备的手势效果仍需真机验证。
