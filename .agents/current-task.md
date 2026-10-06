# 当前任务：P7.2 Rich Blocks

状态：按用户要求停止验收并先提交当前实现；P7.2 保持 current，尚未 PASS。仅提交，不恢复测试或开始 P7.3。

## Work Units
- S0 investigate：registry/editor/codec 检索与第二 Rich Block 评估（scout）。
- S2 decide -> S1 execute：Callout leaf inline rich-text；icon + neutral/info/warning tone；registry、contracts/storage/server round-trip（foundation）。
- S1 execute：编辑器节点、slash、键盘与 Quiet Studio rendering（fast_worker）。
- S2 execute：MCP orphan fail-closed、Callout 稳定 read/write DTO（worker）。
- S0 verify：domain/storage/API/MCP/typecheck/build/product 回归；独立 reviewer 最终复核。

禁止：Table/Database、P7.3 嵌套 UX、child attachment、新 MCP Tools、sync operation、完整 plugin framework、大规模 editor 重构。

## 已完成与剩余

- Callout、MCP orphan fail-closed、registry、codec/local/sync 与相关回归已实现；独立 review 无剩余 blocker。
- 已通过 domain 11/11、contracts 6/6、storage 7/7、API domain 2/2、HTTP 26/26、MCP 21/21、Callout 定向 12/12、Electron storage 11/11、typecheck、Web/API build。
- 完整 product 验收未收齐；旧 slash 精确列表断言已补提示块，待定向重跑。visual 结果未收齐。
