# Current Task — Mobile Safe Area / viewport 基础

## Goal

统一 Web 三端布局对四边安全区与动态视口的消费，不修改业务 UI，不进入新 Roadmap Phase。

## Work units

| ID | 模式与验收边界 | 状态 |
| --- | --- | --- |
| W1 | investigate：Web viewport、布局、fixed UI；Lynx WebView 尺寸及桥接证据 | 完成 |
| W2 | decide：外壳消费四边 inset，工作区内部使用剩余高度；固定 UI 单独定位 | 完成 |
| W3 | execute：Web 基础样式、现有 fixed UI、开发调试信息和文档 | 完成 |
| W4 | verify/review：Web/Mobile 构建、相关 Playwright 测试、diff 复核 | 完成；review 缺口已修复 |

## Constraints

不写死机型尺寸，不复制业务 UI，不提前建立 HarmonyOS Native Module。真机 HarmonyOS env() 行为标记 manual verification required。

## Evidence

Web typecheck/build、Mobile build 通过；Safe Area 与 storage/desktop Playwright 共 5 个用例通过。独立 review 发现的开发页安全区背景白边已修复。真机安全区和状态栏关系尚未验证。
