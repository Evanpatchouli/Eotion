# 当前任务：P8.2 Inline Database + Table View

状态：COMPLETE / P8.2 PASS；基线 3ddab71784220fd928be9c411cc19965323679cc。仅 P8.2，最终一个聚焦 commit；不开始 P8.3。

| Work Unit | 模式/评级 | 负责 | 验收 |
| --- | --- | --- | --- |
| 继承实现与领域边界核对 | investigate/S0 | 主 Agent | 已核对工作区未提交的 P8.2 实现与 P8.1 基线 |
| 原子插入/未知提交结果边界 | decide/S2 | 主 Agent + reviewer | 固定 ID 核对、会话内 fence、正文继续保存 |
| HTTP/contracts/Table 与回归收敛 | execute/S1 | 主 Agent + p82_test_gaps | 创建/linked、Record/Page、状态/分页、标题导航 |
| API/domain/contracts/SDK/MCP 验证 | verify/S0 | p82_api_verify | 全部通过；独立 Mongo replica set，无 skip |
| 产品与 visual 最终验收 | verify/S0 | p82_web_verify + 主 Agent | visual 7/7；完整产品 231/231，exit 0；已检查 P8 截图 |
| 最终独立 review | review | p82_review | 已完成最终独立复核，0 个可操作 blocker |

禁止 P8.3 属性编辑、filter/sort、其他 View、Database MCP tools、完整 Database sync。

已通过：Domain 23/23、Contracts 12/12、SDK 19/19、API domain 4/4、HTTP 26/26、MCP 30/30，均 exit 0 / skip 0。最终 Web 源码收敛后根 typecheck、Web/API build、visual 7/7、diff check 通过。首轮产品 215/218，失败均已定位并修复/补明确前置；后续完整产品 230/231，唯一旧 Table 加粗用例定向连续复跑 3/3 通过，没有修改该用例或 Table 实现；最终全量单 worker 231/231，exit 0（6.1m）。Database 20/20；完整回归包括 P7。

Connectivity 陈旧视觉基线仅更新一张：现行 env 关闭诊断行，与 556603b 的已有行为一致；实际图已人工核对，阈值保持 0.001，没有改动产品 UI。
