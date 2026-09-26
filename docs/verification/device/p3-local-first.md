# P3 真机测试清单

本清单用于 P3「本地优先基础」的移动端真机验收。

开发验证入口：

```text
/#/__dev/storage-p3
```

状态约定见 [真机验证索引](README.md)。

## 当前测试环境

- iPhone XS Max / iOS WebView。
- Huawei nova 14 / HarmonyOS 6 Browser。
- Huawei nova 14 / Android Lynx Explorer via 卓易通。
  - 可用于 Mobile typed bridge 的基础链路验证。
  - 不作为原生 HarmonyOS Safe Area 或原生存储验收环境。

Safe Area 的已验证结论记录在 [P3 本地优先基础](../../p3-local-first.md#safe-area-真机验证)。

## A. 当前即可执行：Mobile bridge 与生命周期

| # | 状态 | 测试项 | 操作 | 通过标准 / 当前证据 |
| --- | --- | --- | --- | --- |
| 1 | ✅ | Mobile runtime 识别 | 从 Lynx App 打开 `/#/__dev/storage-p3` | 页面显示 `Adapter: Mobile typed bridge`，未错误选择 Web IndexedDB。 |
| 2 | ✅ | WebView → Lynx 消息发送 | 在 P3 页面触发 storage 操作 | Lynx Shell 实际收到并处理 storage request；否则不会返回 native storage 状态。 |
| 3 | ✅ | Lynx → WebView 响应 | 触发 storage 操作 | Web 收到 Shell response，并在页面展示返回结果，不是 timeout。 |
| 4 | ✅ | 当前 unavailable 行为 | 尝试创建 / 更新页面 | 明确返回 `unavailable: Mobile local storage is unavailable: this Lynx shell has no registered native storage module.`；无 IndexedDB fallback、白屏或卡死。 |
| 5 | ⬜ | 连续请求稳定性 | 等待初次读取结束，清空 diagnostics，连续触发读取 / 写入约 10 次 | `Requests sent` 等于 `Responses received`；`Pending`、`Timeouts`、`Unknown responses`、`Duplicate responses`、`Method mismatches` 均为 0；最近记录逐项显示对应方法与 `unavailable`。 |
| 6 | ⬜ | WebView reload | 刷新 / 重载 WebView 后再次操作 | diagnostics 重新计数；新请求仍有对应 response，`Pending`、`Timeouts`、`Unknown responses`、`Duplicate responses` 均为 0。 |
| 7 | ⬜ | App 前后台恢复 | 切到后台 10–20 秒，再返回并操作 | 返回后清空 diagnostics 并触发新请求；计数匹配，异常计数为 0，无重复 listener。 |
| 8 | ⬜ | App 完全重启 | 杀掉 App 进程后重新打开 P3 页面 | runtime 判断与 bridge 重新初始化；新请求计数匹配且异常计数为 0。 |
| 9 | ⬜ | 页面 / WebView 重建 | 触发页面重建、方向切换或宿主重新创建 WebView 后操作 | 重建后新请求计数匹配，`Pending` 与异常计数为 0；一次 request 只产生一次对应 response。 |
| 10 | ⬜ | 异常响应体验 | 在没有 native storage 的当前状态下重复操作 | 最近记录展示 `unavailable`，`Responses received` 持续增长，`Timeouts` 为 0；App / WebView 不崩溃、不白屏、不卡死。 |

`Bridge diagnostics` 只在开发版 Mobile typed bridge 页面显示，数据仅保存在当前 WebView 内存中。`Responses received` 包括正常匹配、unknown 和 duplicate 响应；相同 ID 但方法不符会另外计入 `Method mismatches` 并标注在最近记录中。验证 #5 时还需确认这三项均为 0。清空按钮仅在 `Pending = 0` 时可用。重新加载或重建 WebView 后计数重新开始，不用于验证 Page / Block / oplog 持久化。#5–#10 仍待真机按上述步骤重测。

## B. 原生存储实现后执行：CRUD、持久化与 oplog

以下项目依赖原生 storage Native Module / 平台存储 adapter。当前尚未实现，因此标记为 ⏸，不是测试失败。

| # | 状态 | 测试项 | 操作 | 通过标准 |
| --- | --- | --- | --- | --- |
| 11 | ⏸ | 创建 Page | 真机创建一条 Page 后立即读取 | 写入成功，读取内容与输入一致。 |
| 12 | ⏸ | 创建 Block | 在 Page 下创建多个 Block 并查询 | 能按 Page 查询；数据完整，顺序符合 `orderKey` 语义。 |
| 13 | ⏸ | 更新 Page / Block | 修改已有 Page / Block | 更新后读取为新值，实体 ID 不变化。 |
| 14 | ⏸ | 删除 Block | 删除已有 Block 后读取并检查 oplog | Block 不再可读，并生成对应 `block.delete` operation。 |
| 15 | ⏸ | 删除 Page | 删除含 Block 的 Page | Page 与关联 Block 按 LocalStore 语义一致删除，并记录 `page.delete` operation。 |
| 16 | ⏸ | operation log | 连续执行多次本地 mutation | 每个成功 mutation 都产生对应 pending operation；无孤立内容写入。 |
| 17 | ⏸ | operation ID 稳定 | 制造失败后 retry | retry 沿用原 operation ID，不创建新 operation。 |
| 18 | ⏸ | WebView reload persistence | 写入 Page / Block / oplog 后 reload WebView | reload 后数据与 pending operation 仍存在。 |
| 19 | ⏸ | App 进程重启 persistence | 写入后彻底杀 App，再启动 | Page / Block / oplog 仍存在；client identity 按设计保持。 |
| 20 | ⏸ | 写入原子性 | 制造 mutation 中途失败 | 不能出现“内容已写入但 oplog 缺失”或相反的半提交状态。 |
| 21 | ⏸ | offline / reconnect | 离线产生 pending operation，再恢复连接 | pending 队列保留；恢复后按 sequence 顺序发送。 |
| 22 | ⏸ | 重复 reconnect | 对同一持久队列重复触发 reconnect | 不创建新的 operation；已存在 operation ID 保持不变。 |
| 23 | ⏸ | 发送成功、本地确认失败 | 模拟 remote send 成功但本地 `mark synced` 前失败 | 下一次 reconnect 会再次发送同一个 operation ID，符合 at-least-once。 |
| 24 | ⏸ | 多实例并发语义 | 两个 store instance / WebView instance 指向同一持久存储并同时 reconnect | 允许同一 operation 被重复发送；不误认为存在跨实例全局互斥，未来 server 必须按 operation ID 幂等。 |

## P3 完成判定

当前 P3 Mobile 可以分两层判定：

1. **Typed bridge 验收**
   - #1–#10 全部完成后，可声明 Mobile WebView typed bridge 与基础生命周期行为完成真机验证。
2. **Native persistence 验收**
   - #11–#24 依赖原生 storage 实现。
   - 在原生 HarmonyOS / Android / iOS 宿主实现对应 adapter 后，再逐平台执行。
   - 在这些项目完成前，不声明移动端原生本地持久化已经通过。

P4 仍必须保持既定约束：sync transport / server 按稳定 operation ID 幂等处理重复投递。
