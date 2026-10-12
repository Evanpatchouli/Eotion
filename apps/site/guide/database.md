---
title: 数据库
description: 在 Eotion 页面中使用 Database、Table / List / Board、多视图筛选排序、Relation、Rollup 与 Formula。
---

# 数据库

Eotion 的 Database 用来整理结构化信息。它可以直接插入普通页面中；数据库里的每条记录同时关联一篇普通 Eotion 页面，因此你既可以在表格里维护属性，也可以打开记录页面继续写正文。

## 创建数据库与记录

在编辑器的斜线菜单中插入 Database。新数据库会创建一个默认的 Table View。

新建记录时先填写标题。记录创建后：

- 标题来自关联 Page 的 `title`，不会在 Record 中保存第二份标题副本。
- 点击标题可以打开记录页面，正文继续使用普通 Eotion 页面与编辑器。
- 删除 Database Block 不等于删除 Database；同一个 Database 可以在其他页面继续被引用。

## Table、List 与 Board

一个 Database 可以拥有多个 View。当前提供 **Table、List、Board** 三种展示方式，它们共享同一批 Records 和 Properties，但每个 View 可以独立保存筛选、排序、属性显示顺序等配置。

### Table View

Table 适合结构化编辑。属性按列显示，可以直接在单元格里维护 Text、Number、Checkbox、Select、Date 等可写属性，也可以打开记录页面继续编辑正文。

### List View

List 适合快速纵向浏览。每条记录以 Page 标题为主，并在旁边展示当前 View 选中的属性；筛选、排序、显示属性与属性顺序仍然来自同一个 View 配置。List 不复制 Record，也不会维护另一份标题。

### Board View

Board 使用一个 **Select 属性**作为分组依据：

- 每个 Select option 对应一列，空值进入“未分组”。
- 更换分组属性只修改当前 View，不会批量改写 Records。
- 桌面端可以拖动卡片跨列移动；移动实际上更新该 Record 的分组 Select 值。
- 手机端不依赖触摸拖拽，可以通过卡片上的分组选择器完成同样的移动。
- Board 卡片仍遵循当前 View 的筛选、排序、显示属性和属性顺序。

新建 Board 后可以先保持“尚未配置分组属性”，再从当前 Database 的 Select 属性中选择分组。

### 多 View 与 Linked View

同一个 Database 的多个 View 共享数据，但配置彼此独立。例如一个 Board 可以按“状态”分组，另一个 Board 可以按“优先级”分组；Table 和 List 也可以保存自己的筛选和排序。

Database Block 只引用 `databaseId` 与 `viewId`。两个 Block 引用同一个 `viewId` 时会看到同一份 View 配置；引用不同 View 时配置独立。你也可以在其他页面创建 Linked View，再次呈现同一个 Database，而不会复制 Records。

## 基础属性

当前支持：

| 属性 | 用途 |
| --- | --- |
| Title | 记录标题；唯一来源是关联 Page 的标题 |
| Text | 普通文本 |
| Number | 数字 |
| Checkbox | 是 / 否 |
| Select | 单选选项 |
| Date | 日期 |

Title 属性不可删除。

## 筛选、排序与属性显示

Table、List、Board 共用同一套 View 查询语义：可以组合多个筛选条件和多级排序，并独立控制属性的显示与顺序。Table 把这些属性显示为列，List 显示为记录摘要，Board 显示为卡片信息。Board 会先按服务端筛选与排序得到记录，再按分组 Select 属性组织成列。

Relation 当前支持空 / 非空筛选。Relation 不支持排序；Rollup 与 Formula 当前也不支持筛选或排序。遇到这些不支持的配置时，Eotion 会明确拒绝，而不是先分页再在客户端得到不完整结果。

## Relation

Relation 用来把一条记录关联到同一工作区中的另一个 Database Record。

- 一个 Relation 单元格可以关联多条记录。
- 选择器按目标 Record 对应的 Page 标题显示。
- Relation 是单向的，不会自动创建反向属性。
- 可以关联当前 Database 自己的记录。
- 删除目标 Record 时，指向它的 Relation 会在同一事务中被清理。

当前每个 Relation 单元格最多关联 50 条记录。

## Rollup

Rollup 通过一个 Relation 汇总目标记录中的基础属性。当前支持：

- `count`
- `count_values`
- Number 的 `sum` / `avg` / `min` / `max`

Rollup 是只读属性。结果在读取时计算，不会作为另一份值写入 Record。

## Formula

Formula 是只读的受控表达式，不执行任意 JavaScript。

当前支持基础字面量、属性引用、算术、比较、布尔运算、`if`、`empty` 与 `concat`。Formula 可以引用当前 Database 中的基础属性、Rollup，以及其他合法 Formula；循环依赖会被拒绝。

当前 Formula 编辑器使用结构化 JSON 表达式，定位是安全、可验证的基础版本，而不是脚本运行环境。

## 在线与离线

页面和普通文档内容继续遵循 Eotion 的 Local-first 模型，但 **Database 当前是 online-only**：

- 在线时可以读取和修改 Database。
- 已加载的 Database 在离线状态下只读。
- Database mutation 不会加入 Page / Block 的本地 oplog。
- 当前没有 Database 离线复制或跨客户端实时推送。

如果你需要了解普通页面的离线行为，请阅读[同步与离线](/guide/sync-offline)。

## MCP 边界

当前 MCP 的 Page 工具可以看到 Database Block 的稳定引用，也就是 `databaseId` 与 `viewId`；还没有独立的 Database MCP 工具，也不会通过 Page 读取自动展开 Records、Schema 或计算结果。

MCP 的文档读写能力见 [MCP 指南](/guide/mcp)。

## 当前边界

当前公开版本刻意保持以下范围：

- View 支持 Table、List、Board；暂不提供 Gallery、Calendar、Timeline 或 Chart。
- Board 只支持按单个 Select 属性分组，不提供多级分组、泳道、WIP 限制或自定义列顺序。
- Relation 为单向关系。
- Date Rollup 暂不提供日期 min / max。
- Rollup / Formula 不支持作为 Filter / Sort 键。
- Formula 仍是轻量 JSON AST 编辑器。
- 没有 People / Files Property。

这些边界不会影响现有 Database 数据的正常读写；不支持的操作会被明确拒绝。
