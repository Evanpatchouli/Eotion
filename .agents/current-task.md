# 当前任务：Database UX 收敛

状态：**完成**。基线 `3f93222`；导航语义提交 `e8ed579`，其余 UI/测试/文档随本任务最终聚焦提交落盘。本轮仅重构既有 Table View，没有开始 P9，也没有扩展 Database MCP、Database offline sync、真实 Automation、People/Files 或新 View。

| Work Unit | 状态 |
| --- | --- |
| Record / Page / Database 导航语义 | DONE + committed：`e8ed579 feat(database): 收敛数据库与记录导航语义` |
| Database Block / Header / Create-Link / Settings | DONE |
| device-aware Overlay / Record 与 Property 独立偏好 | DONE |
| 属性完整管理 / Relation / Rollup / Formula | DONE |
| Record create/open / Database route / Page Tree | DONE |
| responsive / light-dark / 390px visual QA | DONE |
| 全量验证 | DONE |
| independent review | DONE：0 merge blocker |
| focused UI commit / clean workspace | DONE |

## 最终行为

- Database 左侧提供 `[+] [drag]`，拖拽仅 hover/focus 强调；Plus 在当前区块下方插入 paragraph；drop indicator 使用语义 accent token；Slash Database 使用统一图标。
- Header 使用“表格视图/名称”，无重复类型标签，空 Cell 留空；Create/Link 首层同行，Create 页明确区分返回、取消与 Primary 创建。
- `...` 是筛选、排序、属性、记录打开方式、自动化五入口；自动化 disabled。复杂配置使用正式 Overlay，不塞入小 Popover。
- 通用 Overlay 支持 desktop/tablet drawer/modal/page 与 phone right-drawer/bottom-drawer/modal/page；Desktop Drawer 无蒙层、不锁滚动、不阻止背景交互；有遮罩容器 focus trap/scroll lock/backdrop/Escape 正确。
- Record 与 Property 使用相同 device-aware 模型但独立持久化。属性支持新增、删除、重命名、顺序、显隐、Select options、Relation/Rollup/Formula 配置；visible/order 仍属于 View config。
- 新建 Record 保持 Record + Page 原子创建，随后按设备偏好打开并 autofocus；已有 Record 标题走同一机制；Page mode 使用正常 Page route。
- Database 通过 navigation projection 作为宿主 Page 子项并有独立 route；新旧 Record Page 在 Sidebar 查询分页前过滤，仍可由 Database 打开；旧 P8 数据无 migration。

## 验证证据

- Domain 31、Contracts 17、SDK 22、API domain 12、HTTP 全套、MCP 30、Storage package 7、Web IndexedDB/Electron storage 12、Desktop 18、Visual baseline 7、Database 5k/10k performance 全通过，无 skip。
- Product 完整命令 254/255；唯一旧 Toggle reload 用例随后完整 blocks 文件 14/14 通过，所有 255 项均有通过结果；Database 41/41、Overlay matrix 8/8。
- 根 typecheck、Web/API/Desktop build、`git diff --check` 通过。Web 仅有既有大 chunk warning。
- 视觉 QA 已人工检查 desktop light/dark、无蒙层属性 Drawer、Formula 配置、390px bottom drawer 与表格；截图位于系统 Temp，不入仓库。
- 独立 reviewer 定向复核 Record Page tree filtering、旧 P8 compatibility、Overlay focus/backdrop、device config、Record transaction、Linked View、hidden property 与 Local-first，最终 0 merge blocker。

## 剩余收口

无。确认 workspace clean 后按用户指定 12 项汇报并停止；不得开始 P9。
