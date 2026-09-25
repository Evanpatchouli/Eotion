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

不写死机型尺寸，不复制业务 UI，不提前建立 HarmonyOS Native Module。iOS WebView 与 HarmonyOS Browser 已完成真机布局验证；Android Lynx Explorer via 卓易通不作为原生 HarmonyOS Safe Area 验收环境，原生 HarmonyOS Lynx 宿主仍为 manual verification required。

## Evidence

Web typecheck/build、Mobile build 通过；Safe Area 与 storage/desktop Playwright 共 5 个用例通过。独立 review 发现的开发页安全区背景白边已修复。

真机 Safe Area：
- iPhone XS Max / iOS WebView：✅ 通过；系统状态栏与 Eotion 顶栏不重叠，safe area 正常消费。
- Huawei nova 14 / HarmonyOS Browser：✅ Web 布局通过；系统栏和浏览器 UI 正常划分 viewport，safe inset = 0 为正常结果，内容无系统区域侵入。
- Huawei nova 14 / Android Lynx Explorer via 卓易通：⚠️ 不作为原生 HarmonyOS Safe Area 验收环境；Explorer fullscreen/immersive，WebView 延伸到物理屏顶部且 `safe-area-inset-top = 0`，系统状态栏下拉后覆盖 WebView，归于当前宿主未暴露/消费系统 inset。
