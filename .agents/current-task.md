# 当前任务：Database UX 微调收尾（PASS）

master；基线 c3c4b76f3f324fff5623b4dca19a508382c62887。仅 UI 收尾，不改 Sync / Database domain / Drawer Motion / Block model，不开始 Database UX Final Acceptance 或 P9。

| Work Unit | 难度 / 模式 / 角色 | 状态 |
| --- | --- | --- |
| 图标与通用菜单定位 | S0 investigate / scout | 完成：创建/链接、Header、视图/筛选/排序/属性、打开方式、记录容器与 Database route |
| 最小实现路径 | S1 decide / 主 Agent | 完成：复用 EotionPopover + EotionContextMenu；原生 select 无文本 caret，不改变语义 |
| UI 小改 | S1 execute / fast_worker | 完成：96px 卡片居中、placeholder、共享菜单、图标、Phone 顺序及锚点 |
| 定向验证 | S0 verify / 主 Agent | PASS：18/18，Web typecheck、git diff --check；Desktop/Phone 明暗主题截图已查看 |
| 独立复核 | Review / reviewer | 无实现 blocker；正式文档已同步按钮顺序与 UI 契约 |

Browser plugin not available（session 未列出 browser runtime skill），使用项目 Playwright Chrome。定向 product-database 13、overlay 2、settings 2、ui-foundation Popover 1；未跑 product matrix。截图保存在仓库外会话 visualizations/database-ux-closeout。

替换：打开方式 caret/selected check；排序上下移/删除；属性拖拽/上下移/更多；视图、筛选、排序、属性新增 Plus；Header/View/表头与返回原已使用 EotionIcon。原生 select indicator 与数学比较运算符不是伪图标。

新增主题测试最初因同一页面取消后重复启动 Slash 的测试准备状态被旧菜单截获，改为 Desktop/Phone 独立 fixture 后通过；产品流程未扩大修改。首轮 typecheck 的 icon size14 已改为受支持的 size16，最终通过。

一个聚焦 commit，workspace clean 后停止。Remaining issues：Database UX Final Acceptance。

用户撤销原 commit 后的追加收尾（仍合并成一个 commit）：自动化原有 disabled，但对比不足；共享 ContextMenu 禁用项增加 opacity .45。视图浮层复用 Popover dialog / Input / Button，统一字体、选中行、重命名输入和危险操作布局。Popover 外部 click 采用捕获监听，确保 Database 标题等 stopPropagation 控件不阻断关闭；内部编辑、trigger toggle、Escape、ArrowDown 打开、列表加载与既有视图 CRUD 保持正常。未禁用整个 Popover，提交失败仍可在原面板重试；文本输入不参与菜单方向键导航。

最终 Desktop/Phone light/dark 截图已查看，18/18 定向测试、Web typecheck、diff check 通过；独立 reviewer 无新增 blocker。正式 UI 文档已同步。未开始 Database UX Final Acceptance 或 P9。
