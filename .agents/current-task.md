# Current Task — Unified Web page zoom preference

## Goal

将两个 Web 缩放环境开关收敛为 `VITE_ALLOW_PAGE_ZOOM`；默认允许缩放，值为 `false` 时在实际滚动容器上禁止页面缩放并保留点击、长按和滚动语义。

## Work units

| ID | 模式 | 边界与验收 | 状态 |
| --- | --- | --- | --- |
| W1 | investigate | 已确认旧开关只在 Web bootstrap、CSS、env 示例/类型、README、zoom Playwright 中使用。 | 完成 |
| W2 | decide | 精确比较字符串 `false`；root class 标识状态，`.app-viewport` 使用 `pan-x pan-y`；原 viewport 缓存支持 false→true→false。 | 完成 |
| W3 | execute | 删除旧配置引用，更新实现、文档与测试。 | 完成 |
| W4 | verify/review | Web typecheck/build、Mobile build、storage、zoom、Safe Area 测试及 diff/编码复核后提交。 | 完成；独立复核无 blocker |

## Constraints

不改 Mobile bridge、P3 diagnostics、LocalStore、RPC、oplog/reconnect、真机 #5～#10 状态及无关文件。

## Evidence

Storage typecheck/单测 5/5、Web typecheck/build、Mobile build、Web storage Playwright 5/5、zoom + Safe Area Playwright 7/7 通过。`VITE_ALLOW_PAGE_ZOOM=false` 的真实 Web dev server + 手机尺寸 Chrome 检查 class、滚动容器 touch-action、单一 viewport、安全区参数、普通菜单点击与无页面错误。双击和双指手势需真机验证。
