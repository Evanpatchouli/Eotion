---
title: MCP
description: 连接 Codex 等 MCP 客户端，在账号权限范围内搜索、阅读、创建和更新 Eotion 文档。
---

# MCP

Eotion 原生支持 MCP（Model Context Protocol）。连接 Codex 等 MCP 客户端后，AI 可以在你的账号权限范围内搜索、阅读、创建和更新文档，而不只是读取一份导出的副本。

## 连接地址

Eotion 正式托管环境的 MCP 地址是：

```text
https://eotion.evanpatchouli.space/mcp
```

登录 Eotion 后打开 **设置 → MCP**，页面会显示当前运行环境实际使用的 MCP 地址，并提供复制按钮。这个设置页地址是最可靠的来源：Eotion 正式托管环境显示正式 HTTPS 地址，自建部署显示当前部署域名。

## 创建与管理 MCP Access Token

MCP 使用独立的 Access Token 认证，与网页登录 Session 相互独立。你不需要把浏览器 Cookie 交给 AI 客户端。

1. 登录 Eotion。
2. 打开 **设置 → MCP**。
3. 为当前客户端填写一个名称，例如“Codex”。
4. 点击“创建 Token”。
5. 立即复制并保存返回的 Token。

明文 Token **只在创建时显示一次**。之后设置页只显示名称、创建时间和最近使用时间，不会再次显示明文。

如果某个 Token 不再使用或可能泄露，可以在同一页面单独撤销它。修改账号密码不会自动撤销 MCP Token。

## 使用 Codex 连接

先把 Token 放到环境变量中，例如：

```powershell
$env:EOTION_MCP_TOKEN = '在设置 → MCP 中创建的 Token'
```

在 `~/.codex/config.toml` 中添加：

```toml
[mcp_servers.eotion]
url = "https://eotion.evanpatchouli.space/mcp"
bearer_token_env_var = "EOTION_MCP_TOKEN"
enabled_tools = ["eotion_list_workspaces", "eotion_list_pages", "eotion_search_pages", "eotion_get_page", "eotion_create_page", "eotion_update_page"]
startup_timeout_sec = 20
```

如果你使用自建 Eotion，不要照抄上面的正式托管域名；直接复制 **设置 → MCP** 中显示的地址。

修改环境变量后重新启动 Codex。运行 `codex mcp list`，再在 Codex 中使用 `/mcp`，应能看到 Eotion 和六个工具。

第一次可以直接测试：

```text
列出我的 Eotion 工作区。
```

## 使用其他 MCP 客户端连接

其他支持 Streamable HTTP 的 MCP 客户端也可以连接：

- URL：使用 **设置 → MCP** 中显示的地址。
- 认证：`Authorization: Bearer <你的 Token>`。
- 传输：Streamable HTTP。

不同客户端的配置字段名称不同；只要支持 HTTP MCP 和 Bearer Token 即可。

## AI 可以做什么

连接后可以：

- **查看工作区**：列出当前账号可以访问的工作区。
- **浏览页面**：查看工作区中的页面列表和层级信息。
- **搜索页面**：按标题查找页面。
- **阅读正文**：读取页面标题和受支持的正文结构。
- **创建页面**：在指定工作区创建页面并写入正文。
- **安全修改页面**：基于读取到的版本更新标题或正文，避免覆盖较新的修改。

## 工具参考

| 工具 | 作用 |
| --- | --- |
| `eotion_list_workspaces` | 列出当前账号的工作区 |
| `eotion_list_pages` | 列出工作区的页面 |
| `eotion_search_pages` | 按标题搜索页面 |
| `eotion_get_page` | 读取页面与正文 |
| `eotion_create_page` | 创建页面 |
| `eotion_update_page` | 更新页面标题或正文 |

## 权限与安全

- MCP Token 与网页登录 Session 相互独立。
- 每个 Token 都可以单独创建和撤销。
- AI 只能访问当前账号有权访问的数据。
- 页面修改带并发保护；版本已经变化时会拒绝旧更新。
- 页面写入是原子的，并带幂等保护。
- 明文 Token 只显示一次，不要写进仓库、聊天记录或截图。

## 当前限制

- 搜索目前以页面标题为主，不做正文索引或语义搜索。
- MCP 写回不保留完整行内富文本 marks。
- 图片和文件当前对 MCP 只读，不能通过 MCP 上传、替换或删除。
- 不支持通过 MCP 删除页面。
- 不支持 Database MCP。
- 不支持 MCP Resources 或 Prompts。
- 不提供 Agent 或 Automation 能力。
- 复杂嵌套内容不保证无损写回。
- MCP 写入依赖数据库事务能力。

## 常见问题

### AI 看不到我的工作区

确认客户端使用的是当前账号创建且未撤销的 Token。修改 Token 或配置后，请重新启动客户端。

### MCP 地址应该填什么

优先打开 **设置 → MCP**，复制页面中显示的地址。Eotion 正式托管环境当前为 `https://eotion.evanpatchouli.space/mcp`。

### 需要把网页登录 Cookie 交给 AI 吗

不需要。MCP 使用独立 Bearer Token。

### 修改密码后 Token 会失效吗

不会。需要失效某个 Token 时，在 **设置 → MCP** 中撤销它。

### 为什么更新页面时提示版本冲突

页面在 AI 读取之后又被其他设备或客户端修改过。让 AI 重新读取，再基于最新内容提交即可。
