# 当前任务：Property Menu 失败用例复验（PASS）

master；基线 f383c121ca5369afc700a20728f58a8492f5def6。仅4条失败复验、Property Menu定向回归和一个Escape归属最小修复；无Type Mutation、domain/API/schema修改、Final Acceptance或P9。

| Work Unit | 难度 / 模式 / 角色 | 状态 |
| --- | --- | --- |
| 4条逐条单跑，收集失败证据 | S0 investigate / scout | 完成，4条原失败均复现 |
| 旧测试修正及最小Escape归属修复 | S1 execute / 主Agent | 完成 |
| 定向组、typecheck、diff check | S0 verify / scout | 最终targeted 7/7 PASS（22.1s，retries=0）；Web typecheck PASS；diff check PASS |
| 最终diff独立复核 | Review / reviewer | 4行Escape guard无blocker |

分类：menu原失败是title名称旧locator；inline原失败是严格caret断言，并修正API failure场景旧rename入口；schema既有Select名称歧义locator，也有内层Modal Escape误关父Drawer真实bug；cells既有旧Header button locator/未关设置面板流程，也触发同一真实Escape bug。

产品代码只修改共享EotionProductOverlay的4行Escape归属guard，覆盖Property Menu、Settings原位rename、删除/选项Modal：不抢内层Escape，父属性面板保留。生产caret、Property schema/domain/API和Type mutation未修改。

定向新增：3项菜单数量、Type List Escape/outside关闭且无PATCH、Settings Menu Escape焦点返回、Settings删除Modal Escape无DELETE且父面板保留、Settings原位rename Escape、选项Modal Escape保持父面板。既有取消/backdrop/delete retry、IME/空名称/>100/API failure、stable IDs与offline readonly由定向组复验。

剩余：Property Type Mutation；Database UX Final Acceptance。完成提交后停止。
