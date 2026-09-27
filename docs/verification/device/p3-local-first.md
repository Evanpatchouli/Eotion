# P3 真机测试清单

本清单用于验收 WebView 中由 `apps/web` 提供的 P3 本地优先存储。普通 Web 与 Mobile WebView 共用同一个 IndexedDB adapter；Electron 使用 SQLite，不属于本清单。`eotionRuntime=mobile-webview` 只供 runtime/UI 识别，不选择存储 adapter。

开发验证入口：

```text
/#/__dev/storage-p3
```

状态约定见 [真机验证索引](README.md)。以下 15 项当前全部待目标真机执行，不得据此文档声称真机已通过。

## 当前测试环境

- iPhone XS Max / iOS WebView。
- Huawei nova 14 / HarmonyOS 6 Browser。
- Huawei nova 14 / Android Lynx Explorer via 卓易通。

Safe Area 的既有结论记录在 [P3 本地优先基础](../../p3-local-first.md#safe-area-真机验证)，不代表本清单的 IndexedDB 验收已通过。

## 当前 P3 IndexedDB 真机验收

| #   | 状态          | 测试项                            | 操作                                                                                 | 通过标准                                                                                        |
| --- | ------------- | --------------------------------- | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| 1   | ⏳ 待真机验证 | runtime 与 adapter                | 从 Lynx WebView 打开 P3 开发页，检查 runtime 和 adapter 标识                         | runtime 显示 `Mobile WebView`（对应 `mobile-webview` marker），adapter 显示 IndexedDB。         |
| 2   | ⏳ 待真机验证 | Page CRUD                         | 创建、更新、读取并删除 Page                                                          | 各操作成功，读取内容正确，删除后不可读；ID 按 LocalStore 语义稳定。                             |
| 3   | ⏳ 待真机验证 | Block CRUD / 按 Page 查询         | 创建、读取、更新、删除 Block，并调用 `listBlocksByPage`                              | CRUD 结果正确；查询只返回目标 Page 的 Block，内容及顺序符合 `orderKey` 语义。                   |
| 4   | ⏳ 待真机验证 | WebView reload 持久性             | 写入 Page、Block 和 pending operation，reload WebView 后读取                         | 数据、client identity 与 pending operation 均保留。                                             |
| 5   | ⏳ 待真机验证 | 前后台恢复                        | 写入数据后将 App 切到后台再返回                                                      | Page、Block、client identity 和 pending operation 保留，继续操作正常。                          |
| 6   | ⏳ 待真机验证 | Host / Explorer 进程重启          | 写入数据后彻底杀掉 Lynx Explorer / Host 进程，再重新打开                             | Page、Block 与 pending operation 恢复；client identity 保留。                                   |
| 7   | ⏳ 待真机验证 | WebView 重建                      | 写入数据后触发 WebView 重建、方向切换或宿主重建，再读取                              | Page、Block、client identity 和 pending operation 保留。                                        |
| 8   | ⏳ 待真机验证 | 离线 mutation 与 oplog            | 断网后创建或更新 Page / Block                                                        | mutation 本地成功并产生对应 `pending` operation；恢复网络前队列仍可读取。                       |
| 9   | ⏳ 待真机验证 | clientId 持久性                   | 记录 clientId，reload 并重启 Host 后再次查看                                         | clientId 不变。                                                                                 |
| 10  | ⏳ 待真机验证 | sequence 单调性                   | 连续写入 operation，重启后继续写入                                                   | 新 operation 的 sequence 大于已有最大值；不回退、不重复。                                       |
| 11  | ⏳ 待真机验证 | pending / failed 恢复             | 产生 pending 和 failed operation，reload 并重启 Host 后查询                          | 两种状态的 operation 均存在，内容与状态可读取。                                                 |
| 12  | ⏳ 待真机验证 | reconnect 与 retry ID             | 触发 reconnect；模拟或制造发送失败后重试                                             | 重试沿用原 operation ID，不新增 operation；队列仍按 sequence 处理。                             |
| 13  | ⏳ 待真机验证 | mutation 与 oplog 原子性          | 用 WebView 调试器调用 `upsertBlock` 写入不存在的 Page，再检查内容、oplog 和 sequence | 写入被拒绝；内容和 oplog 一并回滚，sequence 无跳号，不出现半提交或孤立记录。                    |
| 14  | ⏳ 待真机验证 | origin / storage partition 稳定性 | 使用 P3 页面的“修改 Query 并 Reload”按钮，再切换 P3 → P2 → P3 路由             | origin 不变；query/hash 改变后 Page、Block 和 oplog 仍可读取。                                    |
| 15  | ⏳ 待真机验证 | 不主动清理站点数据                | 写入数据后执行 App/WebView 升级、reload、前后台恢复和进程重启                        | App/WebView 不主动清除站点数据，原 Page、Block 和 oplog 仍可读取。                              |

### #14 Lynx Explorer 操作步骤

1. 在 P3 页面创建 Page 和 Block，确认 pending operations 非空；记录页面显示的 Origin、Query 和 Hash。
2. 点击“修改 Query 并 Reload”。按钮保留原 query（包括 `eotionRuntime=mobile-webview`）和当前 hash route，只新增或更新 `p3QueryTest`，然后触发真正的 WebView 页面导航。
3. 页面 reload 后确认 Origin 未变，Query 中的 `p3QueryTest` 已变化，Hash 仍指向 P3。
4. 点击“重新读取”，确认之前的 Page、Block 和 pending operations 仍可读取。
5. 通过 P3 → P2 → P3 路由切换改变 hash，再次点击“重新读取”，确认相同数据仍可读取。

通过标准：Origin 不变；query/hash 改变后仍使用同一个 IndexedDB，Page、Block 和 oplog 均可读取。Origin 由 `protocol + hostname + port` 共同决定；切换到不同 origin 后看不到旧 IndexedDB 属于正常行为，不计为本项失败。

## 存储部署约束

- Mobile WebView 必须保持稳定的 origin 和 storage partition；query/hash 不应改变 IndexedDB 的存储身份。
- App/WebView 升级、reload、前后台恢复和进程重启不能主动清除站点数据。
- 若 WebView 从远程 Web origin 切换到 bundled/local origin，或 origin / storage partition 有其他变化，必须重新评估迁移路径和真机验收；不能假设旧 IndexedDB 自动迁移或可见。

## 历史 WebView↔Lynx bridge PoC（非当前 P3 验收）

下列 #1–#10 是此前 typed bridge PoC 的历史记录，原状态仅描述当时的 bridge PoC 检查。它们不是当前 P3 IndexedDB adapter 的实现或验收证据；不得用其状态替代上方 15 项真机验证。

| #   | 历史状态         | 测试项                  | 操作                                                            | 历史通过标准                                                                                                                                                                         |
| --- | ---------------- | ----------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | ✅ 历史 PoC 记录 | Mobile runtime 识别     | 从 Lynx App 打开 `/#/__dev/storage-p3`                          | 页面显示 `Adapter: Mobile typed bridge`，未错误选择 Web IndexedDB。                                                                                                                  |
| 2   | ✅ 历史 PoC 记录 | WebView → Lynx 消息发送 | 在 P3 页面触发 storage 操作                                     | Lynx Shell 实际收到并处理 storage request；否则不会返回 native storage 状态。                                                                                                        |
| 3   | ✅ 历史 PoC 记录 | Lynx → WebView 响应     | 触发 storage 操作                                               | Web 收到 Shell response，并在页面展示返回结果，不是 timeout。                                                                                                                        |
| 4   | ✅ 历史 PoC 记录 | 当时的 unavailable 行为 | 尝试创建 / 更新页面                                             | 当时返回 `unavailable: Mobile local storage is unavailable: this Lynx shell has no registered native storage module.`；无白屏或卡死。                                                |
| 5   | ✅ 历史 PoC 记录 | 连续请求稳定性          | 等待初次读取结束，清空 diagnostics，连续触发读取 / 写入约 10 次 | `Requests sent` 等于 `Responses received`；`Pending`、`Timeouts`、`Unknown responses`、`Duplicate responses`、`Method mismatches` 均为 0；最近记录逐项显示对应方法与 `unavailable`。 |
| 6   | ✅ 历史 PoC 记录 | WebView reload          | 刷新 / 重载 WebView 后再次操作                                  | diagnostics 重新计数；新请求仍有对应 response，`Pending`、`Timeouts`、`Unknown responses`、`Duplicate responses` 均为 0。                                                            |
| 7   | ✅ 历史 PoC 记录 | App 前后台恢复          | 切到后台 10–20 秒，再返回并操作                                 | 返回后清空 diagnostics 并触发新请求；计数匹配，异常计数为 0，无重复 listener。                                                                                                       |
| 8   | ✅ 历史 PoC 记录 | App 完全重启            | 杀掉 App 进程后重新打开 P3 页面                                 | runtime 判断与 bridge 重新初始化；新请求计数匹配且异常计数为 0。                                                                                                                     |
| 9   | ✅ 历史 PoC 记录 | 页面 / WebView 重建     | 触发页面重建、方向切换或宿主重新创建 WebView 后操作             | 重建后新请求计数匹配，`Pending` 与异常计数为 0；一次 request 只产生一次对应 response。                                                                                               |
| 10  | ✅ 历史 PoC 记录 | 异常响应体验            | 在当时没有 native storage 的 stub 中重复操作                    | 最近记录展示 `unavailable`，`Responses received` 持续增长，`Timeouts` 为 0；App / WebView 不崩溃、不白屏、不卡死。                                                                   |

历史 bridge diagnostics 仅在开发版记录 bridge 请求响应，数据保存在当前 WebView 内存中；reload 或 WebView 重建会重置计数。它不验证 Page / Block / oplog 持久化。

## P3 完成判定

当前 Mobile WebView 的 P3 IndexedDB 验收以本页 15 项为准。全部在目标真机完成并记录证据后，才可声明相应环境通过；目前 15 项均待真机验证。P4 仍须由 sync transport / server 按稳定 operation ID 幂等处理重复投递。
