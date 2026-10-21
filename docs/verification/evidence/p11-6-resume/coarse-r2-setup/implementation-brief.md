# R2 coarse setup 独立失败与冻结修复

本次不是原先 `scrollLeft = 8074` 失败，亦没有执行到新增 trial tap，不能视为 trial 回归。

## 已证明的首错

- `call@9084` 初始 Timeline Alpha Bar tap：775569.618 → 775673.410，成功；actionability 日志为 visible/enabled/stable，没有遮挡或移动重试。
- `call@9086` 确认 Record surface 存在。775693 snapshot 中 ASIDE drawer 正在 entering；775737 已 open，内嵌 Record 编辑器已渲染。
- `call@9088` Escape：775765.688 → 775792.632。之后 `call@9090`（正式 spec 11936）期待 Record surface 数量为零，但 775843 → 780806 每次均为一；780829.906 首个 expect 失败。
- Escape 后 snapshot 775799.824 仍为 open drawer，内嵌 ProseMirror 带 `ProseMirror-focused`。trace 未直接采集 keydown 的实际 activeElement，不能把 focused class 冒称为实际事件 target。
- 所有已记录 auth/navigation/snapshot/table API 均 200，fixture 和初始 Bar tap 均已完成；没有后续 390 loop、trial tap、五次 touchMove。

## 后续清理现象

首错之后 finally 中 context.close：782621.571 → 782656.141 成功。browser.close 于 782698.724 开始而没有 after；test timeout 在 799539.515 开始 teardown。报告的 30 秒超时掩盖了此前已发生的 5 秒 Record 关闭断言失败，二者必须分别描述。

## 当前实现与最小决定

`EotionProductOverlay.vue:225` 的 drawer/page window Escape handler 明确忽略 contenteditable 中的 Escape，以保留编辑器行为。此滚动测试只需关闭已验证打开的 Record，不应把编辑器 Escape 当成无条件关闭入口。

独立 review 已认可的 S1 patch：仅本 case 的 else 分支，将 `page.keyboard.press('Escape')` 改为当前 `recordSurface` 中精确名称“关闭记录”的现有按钮 `.tap()`。保留紧随其后的 `toHaveCount(0)`；保留 trial readiness、原始坐标、五次 move、`> before.left`、5 秒断言和零 mutation；不修改产品、timeout 或 retries。

R2 全门禁仍在运行，本 patch 仅准备，未应用。待主 Agent 解除 source freeze 后再落实和串行验证。

## 证据边界

`failure/trace.zip` 为权威原始 trace；`trace-selected-actions.json` 仅为派生解析。stdout/stderr 的归档文件明确标为进行中快照，不代表最终完整 Product 日志。此前 trial 正式 repeat5、观察 repeat3 全通过，以及旧失败/基线通过证据均保留，不被本轮失败覆盖。
