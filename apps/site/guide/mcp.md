---
title: MCP
description: 连接 Codex 等 MCP 客户端，在账号权限范围内搜索、阅读、创建和更新 Eotion 文档。
---

# MCP

Eotion 原生支持 MCP（Model Context Protocol）。连接 Codex 等 MCP 客户端后，AI 可以在你的账号权限范围内搜索、阅读、创建和更新文档，而不只是读取一份导出的副本。

## 什么是 Eotion MCP

MCP 是让 AI 客户端连接外部工具与数据源的开放协议。Eotion MCP 是 Eotion 服务自身提供的原生 MCP 入口，地址为 `/mcp`，使用 Streamable HTTP 传输，不需要额外安装插件或中间服务。

连接后，AI 可以使用六项能力：查看工作区、浏览页面、搜索页面、阅读正文、创建页面，以及安全修改已有页面。

## 创建 MCP Access Token

MCP 使用独立的 Access Token 认证，与网页登录 Session 相互独立。你不需要把浏览器 Cookie 交给 AI 客户端。

当前版本的设置界面还没有 Token 管理入口，请通过 Eotion API 创建 Token。以下示例使用 PowerShell 7；把 `$api` 替换为你的 Eotion 服务地址，本地开发默认为 `http://127.0.0.1:7137`。

```powershell
$api = 'http://127.0.0.1:7137'

# 1. 登录以获取网页会话；不要在脚本或命令历史中写入密码明文
$login = Get-Credential -Message 'Eotion email / password'
$body = @{ email = $login.UserName; password = $login.GetNetworkCredential().Password } | ConvertTo-Json
Invoke-RestMethod "$api/api/auth/login" -Method Post -ContentType 'application/json' -Body $body -SessionVariable session | Out-Null

# 2. 创建 MCP Access Token，名称仅用于你自己识别
$credential = Invoke-RestMethod "$api/api/mcp/tokens" -Method Post -WebSession $session -ContentType 'application/json' -Body '{"name":"Codex local"}'

# 3. 交给 Codex 使用，只在当前进程环境中生效
$env:EOTION_MCP_TOKEN = $credential.token

# 4. 清理临时变量
Remove-Variable credential, body, login
```

几点说明：

- 名称去掉首尾空格后需要是 1–64 个字符。
- 明文 Token 只在创建时返回一次，之后无法再次查看，请像密码一样保管。
- Token 以 `eotion_mcp_` 开头。丢失后请重新创建一个，不要复用旧值。

## 使用 Codex 连接

### 配置

在 `~/.codex/config.toml` 中添加：

```toml
[mcp_servers.eotion]
url = "http://127.0.0.1:7137/mcp"
bearer_token_env_var = "EOTION_MCP_TOKEN"
enabled_tools = ["eotion_list_workspaces", "eotion_list_pages", "eotion_search_pages", "eotion_get_page", "eotion_create_page", "eotion_update_page"]
startup_timeout_sec = 20
```

把 `url` 换成你的 Eotion 服务地址，连接远程部署时使用对应的 `https://…/mcp`。Token 通过环境变量 `EOTION_MCP_TOKEN` 传入，不要写进配置文件或仓库。

### 检查连接

1. 在已经设置 `EOTION_MCP_TOKEN` 的终端中启动 Codex。
2. 运行 `codex mcp list`，确认 `eotion` 已注册。
3. 在 Codex TUI 中执行 `/mcp`，确认连接正常并列出六个工具。

桌面版 Codex 同样需要继承这个环境变量；修改环境变量后请重新启动客户端。

### 第一次测试

连接成功后，直接用自然语言提出请求：

```text
列出我的 Eotion 工作区。
```

如果返回的是你账号下的工作区名称，说明认证与连接都已就绪。

## 使用其他 MCP 客户端连接

其他支持 Streamable HTTP 的 MCP 客户端也可以连接，配置时使用：

- URL：`http://127.0.0.1:7137/mcp`，连接远程部署时使用对应的 `https://…/mcp`。
- 认证：请求头 `Authorization: Bearer <你的 Token>`。
- 传输方式：Streamable HTTP，不依赖 Cookie 或 OAuth 登录。

不同客户端的配置字段名称不同，请以对应客户端的 MCP 文档为准；只要客户端支持自定义请求头和 HTTP 传输即可使用。

## AI 可以做什么

连接后，你可以用自然语言指挥 AI 完成以下事情：

- **查看工作区**：列出当前账号可以访问的工作区。
- **浏览页面**：查看某个工作区里的页面列表和层级信息。
- **搜索页面**：按标题查找页面。当前是标题的文本匹配，不是正文索引或语义搜索。
- **阅读正文**：读取页面的标题与正文，包括标题、列表、待办、引用、代码等结构。
- **创建页面**：在指定工作区中新建页面并写入正文。
- **安全修改已有页面**：基于读取到的版本更新标题或正文，避免覆盖较新的修改。

几个可以直接使用的例子：

```text
在「工作」工作区搜索标题包含“周报”的页面，并读取它。
```

```text
在「备忘录」中创建一个“旅行准备”页面。
```

```text
读取这个页面，然后把最后一段改得更简洁。
```

## 工具参考

MCP 客户端会发现以下六个工具：

| 工具 | 作用 |
| --- | --- |
| `eotion_list_workspaces` | 列出当前账号的工作区 |
| `eotion_list_pages` | 列出工作区的页面 |
| `eotion_search_pages` | 按标题搜索页面 |
| `eotion_get_page` | 读取页面与正文 |
| `eotion_create_page` | 创建页面 |
| `eotion_update_page` | 更新页面标题或正文 |

## 权限与安全

- MCP Token 与网页登录 Session 相互独立。退出网页登录不会让 Token 失效，也不需要把 Cookie 交给 AI 客户端。
- 每个 Token 都是一条独立凭证，单独保存、单独失效，不会影响网页登录。
- AI 只能访问当前账号有权访问的数据。没有权限的工作区或页面会返回统一的失败信息，不会暴露页面是否存在。
- 页面修改带有并发保护：AI 必须基于读取到的版本提交更新；如果页面在此期间被其他设备修改，更新会被拒绝，而不是覆盖较新的内容。
- 页面写入是原子的，并带有幂等保护：网络重试不会把同一次成功写入执行两遍。
- 明文 Token 只在创建时返回一次，请像密码一样保管，不要写进仓库、聊天记录或截图。

## 撤销 Token

当前版本尚未在设置界面或 API 中提供 Token 管理入口，因此还不能由用户在网页上自行撤销 Token。服务端已经按账号和凭证维度保存 Token 状态，可以按凭证 ID 单独撤销。

在撤销入口开放前：

- 如果 Token 可能已经泄露，请联系你的 Eotion 部署管理员，在服务端撤销对应凭证。
- 修改账号密码**不会**自动撤销已经创建的 MCP Token。

Token 的管理与撤销入口会在后续版本中提供。

## 当前限制

- 搜索目前以页面标题为主，使用大小写不敏感的文本匹配，不做正文索引或语义搜索。
- 不保留完整的行内富文本格式（marks）。AI 写回后，加粗、斜体、链接等行内样式可能丢失。
- 图片和文件当前对 MCP **只读**，不能通过 MCP 上传、替换或删除。
- 不支持通过 MCP 删除页面。
- 不支持 Database MCP。
- 不支持 MCP Resources 或 Prompts。
- 不提供 Agent 或 Automation 能力。
- 复杂嵌套的列表和引用可以读取，但不保证无损写回。
- 写入需要数据库支持事务，自建部署需使用副本集，否则写入会被直接拒绝。
- MCP 入口目前没有专用限流，公开部署前会补充。
- 官方托管环境是否开放 MCP 入口取决于部署配置；自建部署需要在反向代理中保留 `/mcp` 路径与 `Authorization` 请求头。

## 常见问题

### AI 看不到我的工作区

确认 AI 客户端使用的 Token 属于当前账号，并且 Token 没有被撤销。修改环境变量或配置后，需要重新启动客户端。

### 需要把网页登录 Cookie 交给 AI 吗

不需要。MCP 只使用独立的 Bearer Token，与网页登录 Session 分开。

### 修改密码后 Token 会失效吗

不会。修改密码会结束网页登录会话，但不会撤销已经创建的 MCP Token。需要撤销时请参考上文「撤销 Token」一节。

### 为什么更新页面时提示版本冲突

页面在你读取之后被其他设备或客户端修改过。让 AI 重新读取页面，再基于最新内容提交修改即可。

### 为什么 AI 改完格式变了

当前不保留完整的行内富文本格式，也不保证复杂嵌套结构无损写回。改写时尽量使用标题、段落、列表、待办、引用和代码等受支持的结构。

### 搜索为什么只匹配到标题

这是当前实现的范围：搜索只针对页面标题。正文内容可以通过阅读页面获取。
