---
title: 数据库
description: 在 Eotion 页面中使用 Database、Table View、筛选、排序、Relation、Rollup 与 Formula。
---

# 数据库

Eotion 的 Database 用来整理结构化信息。它可以直接插入普通页面中；数据库里的每条记录同时关联一篇普通 Eotion 页面，因此你既可以在表格里维护属性，也可以打开记录页面继续写正文。

## 创建数据库与记录

在编辑器的斜线菜单中插入 Database。新数据库会创建一个默认的 Table View。

新建记录时先填写标题。记录创建后：

- 标题来自关联 Page 的 `title`，不会在 Record 中保存第二份标题副本。
- 点击标题可以打开记录页面，正文继续使用普通 Eotion 页面与编辑器。
- 删除 Database Block 不等于删除 Database；同一个 Database 可以在其他页面继续被引用。

## Table View

当前只提供 **Table View**。同一个 Database 可以创建多个表格视图，每个 View 可以保存自己的：

- 筛选条件
- 排序规则
- 显示列
- 列顺序

这些 View 共享同一批 Records。你也可以在其他页面创建 Linked View，选择已有 Database 与 View；修改记录后，其他引用同一 Database 的视图刷新后会看到同一份数据。

目前还没有 List、Board、Gallery、Calendar 或 Timeline View。

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

## 筛选、排序与列设置

Table View 可以组合多个筛选条件和多级排序，并独立控制列的显示与顺序。

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

- 只有 Table View。
- Relation 为单向关系。
- Date Rollup 暂不提供日期 min / max。
- Rollup / Formula 不支持作为 Filter / Sort 键。
- Formula 仍是轻量 JSON AST 编辑器。
- 没有 People / Files Property。

这些边界不会影响现有 Database 数据的正常读写；不支持的操作会被明确拒绝。
