# Current Task — HarmonyOS Touch Toolbar / caret 修复

2026-10-06；master；仅 H2 图标识别与长正文 caret 避让。已完成。

## Work Units
1. S0 investigate / scout：确认 document-wrap 为实际 overflow:auto 正文容器、验证入口（完成）。
2. S2 decide / main：保留 fixed Toolbar；实际 toolbar top + 12px；去掉 inset 前置；双 RAF 合并事件检查（完成）。
3. S1 execute / fast_worker：组件局部修复和真实 DOM Playwright 回归（完成）。
4. S0 verify / scout + main：web typecheck、15-spec web 回归、视觉与生产编辑器回归（完成）；Review / reviewer：独立复核无 blocker。

## Invariants
H2 命令不变；复用 Morphicons + 下标 2；44px target；无 UA 分支；不改附件、同步、Bubble/Slash、版本号和 release 规则。两个独立逻辑修复分别提交并 push master。

## Results
Web typecheck 通过；生产编辑器 build/回归 1/1；视觉 7/7。15-spec 共 204 项首轮 202 通过：新增 caret 用例的旧 blur/遮挡场景已修正，H2/caret 两用例各重复三次 6/6；5,000 区块 fixture 在四 worker 下超时，单独复跑 1/1（6.4s，未改 timeout）。最终所有用例已覆盖并通过。git diff --check 通过。

## Remaining verification
nova 14 真机 H2 识别与连续长正文 caret 仍待复测；自动化不替代原生 IME 验收。HAP 默认加载远端 Web，复测须确保远端 Web 部署本轮提交，仅重新打包 HAP 不更新远端页面。
