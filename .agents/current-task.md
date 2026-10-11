# 当前任务：Universal Block +（PASS）

master；基线 7b6e689cffbdebbba07ad9007b631e586994b8cc。泛化现有 movable Block Chrome 与 insertParagraphAfter，未修改 Drawer、Sync、Database domain、model/codec；未开始 Final Acceptance 或 P9。

| Work Unit | 难度 / 模式 / 角色 | 状态 |
| --- | --- | --- |
| 现有机制与定向测试定位 | S0 investigate / scout | 完成 |
| 同 sibling 插入与平台边界决定 | S2 decide / 主 Agent | 完成：复用完整 nodeSize 定位、movable guard、dispatch 后 focus |
| 现有 Chrome 泛化与稳定契约 | S1 execute / fast_worker | 完成：统一隐藏、hover/控件focus/正文caret显示；嵌套 offsetParent 定位、focus监听销毁清理 |
| 定向产品验证 | S0 verify / 主 Agent | PASS：21/21；Web typecheck、diff check 通过 |
| 最终独立复核 | Review / reviewer | 完成：真实嵌套坐标 blocker 已复现修复；最终无 blocker |

覆盖 Paragraph、Heading、两种 List、Todo、Quote、Code、Divider、Callout、Toggle、Table、Database。Root 插 root sibling，nested child 插同 parent sibling，Toggle 与 Table 等插在完整节点之后；普通空 Paragraph 沿用 BlockIdentity、transaction/history 与保存通路，caret 聚焦可立即输入。附件/上传 placeholder 未扩大 movable 边界。

Desktop 24px 控件 idle opacity 0；hover、focus-visible 与编辑器正文当前 caret Block 显示。透明 4px 鼠标命中桥与显现控件层叠保证 Divider/Table 邻接时可达；无正常布局占位。Phone 390 普通和 root/nested Database controls 隐藏、无新增预留/overflow；Tablet coarse 既有普通隐藏/Database 44px header边界保持。

最终命令：pnpm --filter @eotion/web exec playwright test tests/product-nested.spec.ts tests/product-blocks.spec.ts tests/product-database.spec.ts --grep 'universal|Tab and Shift|a mid-block|Tab moves|390px touch toolbar|drag handle|drag rejects|dragging outside|Tab after a leaf|toggle creates|editing inside a toggle|callout slash creation|database block controls|hides database block controls|preserves the existing tablet layout' --workers=1 --retries=0。

Browser plugin not available（未列出 Browser runtime skill）；使用项目 Playwright Chrome，Desktop 1440、Phone 390、Tablet coarse 820。截图存于仓库外会话 visualizations/universal-plus，已查看 Desktop/Phone。未跑完整 Database suite，未处理属性 Drawer 已知失败。

一个聚焦 commit 后 workspace clean，停止。Remaining issues：Database UX Final Acceptance。