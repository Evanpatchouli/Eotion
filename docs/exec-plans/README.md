# Execution Plans

这里保存需要跨会话持续推进的复杂工作计划。

## active/

正在执行的复杂任务。

## completed/

已经完成、但未来可能仍需要了解其过程或决策的计划。

简单任务不需要创建计划文件；Agent 可以直接在会话中形成简短计划。

推荐模板：

```md
# Plan: 标题

## Goal

## Constraints

## Plan

1. ...
2. ...
3. ...

## Validation

## Decisions

## Status

- [ ] ...
- [ ] ...
```
