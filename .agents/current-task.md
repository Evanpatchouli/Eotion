# 当前任务：Database Opening / Record Creation / Overlay Semantics

状态：**本轮聚焦修复 PASS，Database UX Refinement 尚未 Final PASS**。基线 `7419e7043790085f855963f7a2d5a2b8a2fba73b`；本轮只完成 Opening / Record Creation / Overlay 语义修复，没有开始 P9，也没有扩展 Database domain / navigation architecture。

| Work Unit | 难度 / 角色 | 状态 | 结果 |
| --- | --- | --- | --- |
| 当前实现与测试证据包 | S0 / scout | DONE | 查清 preference、new record、overlay、filter/sort 调用链与测试缺口 |
| 实现边界与 invariant | S2 / 主 Agent | DONE | 保留 DeviceOpeningConfig、原子创建/uncertainty、统一 Record Host、Page route flush |
| Opening Settings + tests | S1 / fast_worker | DONE | 三端同屏 Popover/Menu、合法模式、Record/Property 独立、旧 key 兼容与即时持久化 |
| New Record pipeline + tests | S2→S1 | DONE | 删除 inline form，默认“无标题”，prepare + open，Existing/New 共用 pipeline |
| Overlay + Filter/Sort semantics + tests | S1 / fast_worker | DONE | Drawer/Modal/mobile semantics、共享 sidebar width、Filter/Sort 固定形态 |
| 定向与完整验证、视觉检查 | S0 / 主 Agent | DONE | Database 49/49；Overlay/Settings/Pages/Editor 99/100，唯一旧 Editor 状态按钮竞态隔离 3/3；完整 product 270/270（review 修复前） |
| 独立只读 review | Review / reviewer | DONE | 首轮发现 2 个 Record title flush/refresh race blocker；修复后二次 review 0 blocker |
| 聚焦提交与交接 | 主 Agent | DONE | 一个聚焦 commit；正式行为已写回 `docs/p8-database.md` 与 handoff |

## 本轮交付边界

- DeviceOpeningConfig 继续使用 `desktop` / `tablet` / `mobile`；现有 localStorage key/对象直接读取，无 migration。
- Record 与 Property 使用同一三端设置交互、两套独立持久化配置；当前设备只显示提示。
- Record + Page 继续原子创建，保留 transaction / CAS / uncertainty/auth/workspace fence；Page.title 是唯一标题来源。
- “新建记录”直接用“无标题”创建，随后 `prepareProductDatabaseRecordPage` + `databaseContent.openRecord`，Existing/New 共用统一 Host。
- Record 标题与正文共同进入 active page flush；关闭、切换和路由离开会等待标题保存。刷新通知携带保存时固定身份并支持多数据库并发目标。
- Desktop/Tablet Drawer 无 backdrop、背景可交互；Modal 与 Mobile Drawers 使用 native modal/focus trap/backdrop；Right Drawer 与 Mobile Sidebar 共用 `--mobile-sidebar-width`；Bottom Drawer 保留 safe area。
- Desktop/Tablet Filter、Sort 固定 Modal；Phone 固定 Bottom Drawer；Property 继续使用独立 preference。

## 验证摘要

- `pnpm typecheck`：PASS（Web/Desktop/API）；独立 Web typecheck：PASS。
- `pnpm build:web`：PASS，仅既有大 chunk warning。
- 完整 product：270/270（review 修复前）；最终 Database：49/49；Overlay/Settings/Pages/Editor：99/100，旧 Editor 同步重试按钮 DOM 状态竞态隔离连续 3/3 PASS。
- Opening 设置关闭按钮与 Linked View 列保存曾出现 DOM remount 竞态；改为验证真实 Escape/最终表格结果，相关隔离分别 3/3、5/5，未增加无意义 timeout 或削弱产品断言。
- Desktop light/dark 与 390×844 Mobile 截图已检查：三端设置无溢出，Desktop Drawer/Modal/Page，Phone Right/Bottom/Modal，Filter/Sort，safe area 均符合本轮要求。
- `git diff --check`：PASS；独立二次 review：0 blocker。

## 下一轮（本轮不处理）

- Drag Handle visibility
- Database Header icon consistency
- Page Tree / 10k projection 性能审查
- 最终 Database UX Acceptance

Database UX Refinement **不得**因本轮聚焦 PASS 被声明为 Final PASS。
