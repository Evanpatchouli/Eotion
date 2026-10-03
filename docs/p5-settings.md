# P5.6 Settings & Preferences / 设置与偏好

## 状态

**P5.6 Settings & Preferences：✅ 已完成 / PASS（2026-10-01）。** 产品版本保持 `0.0.1 / build 1`。本阶段通过实现、自动验证、实际截图与独立 review；不代表 P5 Final Acceptance PASS。

P5.6 位于 P5.5 Attachments 之后、P5 Final Acceptance 之前。本阶段补齐 MVP 必需的账号资料、外观和编辑器偏好，并建立可继续扩展到 MCP / Agent 等未来能力的 Settings 信息架构。

P5.4 Mobile WebView 真机完全离线重启验收仍单独保留；本阶段不创建 HarmonyOS / Android / iOS 原生宿主，也不以原生宿主作为 P5.6 前置条件。

## 产品目标

Settings 是独立于具体 Page 的产品 Surface，不作为某个页面正文的一部分。核心原则：

- 同一份 Settings 信息架构适配 Web、Electron 和 Mobile WebView。
- 适配依据是可用宽度，而不是硬编码 Desktop / Tablet / Mobile 设备类型。
- 宽屏使用 list-detail 双栏；紧凑宽度使用 Settings Index → Detail 的单栏导航。
- 正式 UI 延续 Eotion 当前克制、低噪音、Notion 类产品质感，并继续使用 Morphicons 图标系统。
- P5 只实现高价值、稳定的设置项；不为了“看起来完整”堆砌空功能。

## 信息架构

P5.6 固定以下目录：

```text
设置
├─ 个人
│  └─ 账号资料
│     ├─ 修改昵称
│     └─ 变更密码
│
├─ 外观
│  └─ 外观
│     └─ 主题：跟随系统 / 浅色 / 深色
│
├─ 工作空间
│  └─ 通用
│     └─ 显示固定编辑工具栏
│
├─ 功能
│  ├─ MCP    （预留 / 即将推出）
│  └─ Agent  （预留 / 即将推出）
│
└─ 关于
   └─ 软件说明
      ├─ 当前版本 / 发行时间
      ├─ 检查更新
      └─ 当前版本日志
```

P5.6 不增加 Settings Search。当前设置量很小，搜索会增加视觉噪音；待后续设置项明显增多后再评估。

MCP / Agent 在本阶段只作为未来信息架构入口展示“即将推出”，不实现配置、路由详情或虚假可用状态。

## Responsive Settings Surface

### Expanded / 宽屏

当可用宽度足够时采用 list-detail：

```text
┌──────────────────────────────────────────────────────┐
│ 设置                                                 │
├──────────────────┬───────────────────────────────────┤
│ 个人             │                                   │
│   账号资料       │         当前设置详情              │
│                  │                                   │
│ 外观             │                                   │
│   外观           │                                   │
│                  │                                   │
│ 工作空间         │                                   │
│   通用           │                                   │
│                  │                                   │
│ 功能             │                                   │
│   MCP  即将推出  │                                   │
│   Agent 即将推出 │                                   │
└──────────────────┴───────────────────────────────────┘
```

PC 和宽 Tablet 使用此布局。设置导航保持固定宽度，详情区独立滚动；不要把主产品 Page Tree 当作 Settings 导航。

### Compact / 紧凑宽度

手机以及窄 Tablet / 分屏窗口不使用抽屉式 Settings Sidebar。采用单栏 list-detail navigation：

```text
设置
──────────────────
个人
  账号资料                    >

外观
  外观              跟随系统 >

工作空间
  通用                        >

功能
  MCP                 即将推出
  Agent               即将推出

关于
  软件说明                      >
```

点击可用条目后进入全宽 Detail：

```text
←        ⚙ 设置
──────────────────
         外观

主题
  ○ 跟随系统
  ○ 浅色
  ● 深色
```

紧凑宽度的 Detail 由唯一的顶部返回按钮恢复 Settings Index；Index 的顶部返回按钮回到进入前的产品 route。宽屏顶部返回按钮始终回到进入前的产品 route。

禁止为了复用宽屏布局，在手机上再做一个可展开/收起的抽屉侧边栏。Settings 本身天然是 list → detail 任务，紧凑宽度直接切换 pane 更简单。

断点应由 layout/container 可用宽度驱动；不要通过 UA 或“是否 iPad”硬编码。

## Route / Navigation 边界

Settings 是需要认证的独立产品 Surface，不依赖当前 Page route。

推荐形态：

```text
/settings
/settings/profile
/settings/appearance
/settings/workspace/general
/settings/about
```

实际 router 命名可根据现有 Vue Router 结构调整，但应满足：

- 从 ProductShell 用户区域进入 Settings。
- 关闭/返回 Settings 时回到用户进入前的产品 route；没有可靠历史时 fallback 到 `/app`。
- Settings 支持 offline cached identity 进入；账号网络操作在服务不可用时明确提示，不能影响本地偏好设置。
- MCP / Agent 本阶段不提供可访问的假详情页。
- Settings route 不复制 ProductShell Page Tree。

## 设置 Scope

不同设置不得混为一套同步策略。

| 设置         | Source of truth  | Scope                     | Offline                  |
| ------------ | ---------------- | ------------------------- | ------------------------ |
| 昵称         | Server User      | Account / 跨设备          | 可显示缓存；修改要求在线 |
| 密码         | Server Auth      | Account                   | 修改要求在线             |
| Theme        | Local preference | Device                    | 完全可用                 |
| 固定 Toolbar | Local preference | User + Workspace + Device | 完全可用                 |
| MCP / Agent  | 无               | Reserved                  | 无状态                   |

本阶段不建立“所有用户偏好统一同步到 Server”的通用 preferences domain。

## 账号资料

### 昵称

P5.6 在原有 `id/email/passwordHash/timestamps` 上增加面向产品展示的 `displayName`：

- API / Contract / SDK 返回值包含稳定的 `displayName`。
- 昵称 trim 后不能为空，并设置合理长度上限（建议 64 字符）。
- 只按文本渲染，不使用 HTML。
- 旧用户必须兼容，不要求破坏性迁移；可以由 Domain / Repository 提供稳定 fallback，并在首次修改后持久化。
- cached identity 应包含昵称，使后端暂不可用时仍能显示最近成功认证/更新的资料。
- 修改成功后当前 UI、cached identity 和后续 `/auth/me` 结果一致。

不要在 P5.6 增加头像上传、邮箱变更、账号注销、个人简介等额外账号功能。

### 变更密码

密码变更必须：

1. 要求输入当前密码。
2. 要求输入新密码及确认新密码。
3. 服务端重新验证当前密码；不能只依赖“已经登录”。
4. 新密码继续使用现有 scrypt hashing，不引入第二套密码算法。
5. 成功更新 password hash 后，撤销该用户全部现有 Session，包括当前 Session。
6. 当前客户端清 Cookie / cached identity / auth state，并回到登录页，提示“密码已更新，请重新登录”。
7. 原密码错误使用统一、不泄漏敏感信息的错误语义。
8. 密码不得进入日志、analytics、异常详情或 LocalStorage。

当前 SessionRepository 只有按 token revoke；P5.6 可以增加按 `userId` 撤销所有 Session 的最小能力，但不要建设复杂 Session 管理 UI。

## Appearance / Theme

主题提供三态：

```text
system
light
dark
```

默认：

```text
system
```

主题是设备本地偏好，不随账号跨设备同步。

要求：

- `system` 使用 `prefers-color-scheme`，系统主题变化时实时更新。
- preference 在 reload / offline / Electron / Mobile WebView 中保持。
- 在 Vue mount 前尽早应用已保存主题，避免明显 light → dark 闪烁。
- 设置正确的 `color-scheme`，使表单控件、滚动条等系统 UI 尽量匹配。
- 使用统一 design tokens / CSS custom properties 管理背景、文字、边框、hover、active、danger、focus、shadow 等颜色。
- 不允许通过在组件里继续堆大量 `#fff/#000` 分支实现 Dark Theme。
- 正式产品 Surface 至少覆盖 ProductShell、Page Tree、Page、Editor、Slash Menu、Attachments、Dialog/Menu、Login/Register、Connectivity state 和 Settings。
- `/__dev/*` PoC 页面不要求为 P5.6 做完整视觉重构，除非复用了正式组件。
- Light 主题不得因 token 化产生明显视觉回归。

## Workspace / General — 固定编辑 Toolbar

设置名称：

**显示固定编辑工具栏**

说明：

> 在文档顶部显示常用格式和插入操作。关闭后仍可通过 / 命令、快捷键和上下文操作使用编辑功能。

默认：

```text
OFF
```

这里的 Toolbar **只指 Page Editor 顶部固定块工具栏**，不是“关闭全部编辑能力”。

语义：

- 默认 Eotion 文档应尽量接近“标题 + 正文”，减少永久 UI 噪音。
- Desktop / 宽 Tablet：Toolbar 仅在该设置开启时显示。
- Compact / Mobile：顶部固定 Toolbar 默认不显示；移动端必要的 touch/contextual editing controls 不由此设置关闭。
- Slash Command、快捷键、选区/上下文操作、附件插入能力仍然存在。
- preference 以 `userId + workspaceId + device` 为 scope；不同账号或不同 Workspace 不互相污染。
- 当前 Workspace 不可确定时，Workspace General 应显示明确的不可配置状态，而不是写入一个模糊的 global value。
- 本阶段不把 Toolbar preference 同步到 Server。

该设计允许一个用户在工作区 A 隐藏 Toolbar、工作区 B 显示 Toolbar，同时另一台设备可以保留自己的偏好。

## 功能 / Reserved

Settings 中保留：

- MCP — 即将推出
- Agent — 即将推出

本阶段：

- 可以显示对应 Morphicons 和“即将推出”状态。
- 不提供开关。
- 不提供空白详情页。
- 不实现 MCP Server 管理、Agent 配置、模型选择或权限。
- 真正能力仍按 Roadmap P6 及后续阶段实施。

## 关于 / 软件说明

设置导航最底部的独立分组“关于”提供只读的版本信息页：

- 路由 `/settings/about`；桌面与平板沿用与其它设置页一致的 list-detail，390px 紧凑宽度沿用 Index → Detail 与唯一返回按钮，并保留 `returnTo` / `workspaceId`。
- 当前版本与 Build 号来自 `EOTION_BUILD_INFO`（Vite define，root `package.json` 的 `version` / `eotion.buildNumber`），页面不硬编码版本号。
- 发行时间与版本日志来自 `apps/web/src/releaseInfo.ts`，只记录仓库当前已经实现的能力，不写未来规划。
- “检查更新”复用 `api.health()`（`GET /api/health` 的 `version` / `buildNumber`），不新增后端接口，也不做自动下载、自动更新、安装包跳转或 GitHub Release。
- 比较规则：远端 SemVer 更高 → “发现新版本 x.y.z”；SemVer 相同但远端 Build 更高 → “发现新构建 x.y.z · Build N”；完全相同 → “已是最新版本”；本地更高 → “当前版本已是较新版本”；网络或 API 失败 → “检查更新失败，请稍后重试”。检查期间按钮显示“检查中…”并禁用重复点击。

## UI / UX

Settings 不是后台管理页。视觉方向：

- 与当前 Eotion Product UI 一致。
- 低噪音、轻边框、清晰分组、足够留白。
- 行级 setting 使用稳定 label / description / control 布局。
- Switch、Segmented/Radio、Password form、Save feedback 的状态清晰。
- 不使用浏览器 `alert/confirm/prompt`。
- 系统图标继续通过现有 `EotionIcon` + Morphicons + Lucide data 渲染。
- 不允许用 `>`、`+`、`×`、`▾` 等文本字符冒充系统图标。
- Icon-only control 有 aria-label；focus-visible、keyboard navigation、reduced motion 保持。
- Compact 模式关键触摸目标至少约 44×44。
- Settings Detail 长度超过 viewport 时只滚动内容，不制造双重异常滚动。

## Local-first / Backend unavailable

Settings 必须延续现有 P5.4 connectivity 语义：

- cached identity 存在时，后端 500/502/503/504 或网络失败不能让 Settings 整体消失。
- Theme / Toolbar preference 在 backend unavailable 时仍可读取和修改。
- Profile / Password 的 server mutation 在 offline/backend unavailable 时禁用或返回产品化提示，不伪造成功。
- 401 仍然是 authoritative session invalidation；Settings 不得绕过。
- 403 和其他明确非 transient 4xx 不转换为 offline permission。

## P5.6 不做

- Settings Search。
- Avatar。
- Email change。
- Account deletion。
- Notification settings。
- Language settings。
- Font-size / typography customization。
- Keyboard shortcut customization。
- Import / Export。
- AI model settings。
- MCP 实际配置。
- Agent 实际配置。
- 原生 HarmonyOS / Android / iOS Settings 页面。
- 通用 server-side user preferences framework。
- Toolbar 云同步。
- Theme 云同步。
- 全站重新设计。

## Exit Criteria

P5.6 只有在以下全部满足后才能 PASS：

1. 宽屏 Settings 具备清晰、美观的双栏 list-detail。
2. 390px compact Settings 使用 Index → Detail，不出现抽屉 Sidebar 或横向溢出。
3. 可以修改昵称并跨重新登录/第二客户端读取。
4. 可以使用当前密码修改密码；成功后所有旧 Session 失效，并要求重新登录。
5. 401/403/离线安全边界不回归。
6. Theme 支持 system/light/dark，默认 system。
7. system 能响应操作系统主题变化。
8. Theme reload / offline 后保持，并覆盖正式产品 UI。
9. Light Theme 无明显视觉回归；Dark Theme 通过 Desktop / Tablet / Mobile Visual QA。
10. 固定编辑 Toolbar 默认关闭。
11. 开启后 Desktop / 宽 Tablet 正常显示；关闭后正文仍可通过 Slash/快捷键/上下文能力编辑。
12. Compact/Mobile 不因该设置失去必要触摸编辑能力。
13. Toolbar preference 按 user + workspace + device 隔离并持久化。
14. MCP / Agent 以不可误解的“即将推出”预留入口呈现，不存在假功能。
15. Web / Electron / Mobile WebView 共用同一 Settings 产品逻辑，无业务复制。
16. P5.1～P5.5 现有核心行为和测试不回归。
17. Visual QA 与独立 review 无 blocker。

P5.6 PASS 后仍不能自动声明 P5 Final Acceptance；还需单独执行 P5 Final Acceptance，并保留 P5.4 Mobile WebView 真机离线重启的既有验收边界。

## 实现入口与持久化

- `apps/web/src/layouts/SettingsLayout.vue` 与 `views/settings/*` 是唯一正式设置 UI。768px 起使用固定 254px 导航 + 独立滚动详情（内容最大 620px）；更窄时显示 Index 或 Detail，导航不会成为抽屉。
- ProductShell 用户区域“设置”传递 `returnTo` 和当前 `workspaceId`。`settingsNavigation.ts` 只接受 `/app`、`/app/:workspaceId` 或 `/app/:workspaceId/page/:pageId`（稳定 ID 字符白名单），其它值回退 `/app`。进入工作区入口后沿用原有最近工作区解析。Workspace General 必须在当前用户拥有/缓存的列表中匹配 owner；没有有效 context 显示不可配置状态，不写全局偏好。
- `PATCH /api/auth/me` 与 SDK `auth.updateProfile` 使用 strict 昵称 schema。Repository 为 legacy user 提供 email 前缀 fallback。成功同步 `auth.user` 与 cached identity，正文只渲染文本。
- `POST /api/auth/change-password` 与 SDK `auth.changePassword` 只发送 current/new password。现有 scrypt、长度 1～1024；确认密码只在客户端验证。当前密码错误 400，保持身份。Mongo replica-set transaction 使用旧 hash CAS，同时更新 hash、递增内部凭据版本并 revokeAll；版本比较阻止并发旧凭据登录遗留有效 Session。失败不返回成功，成功 204 清 Cookie，客户端清身份并显示“密码已更新，请重新登录”。
- `theme.ts` + `index.html` 保存 `eotion:theme`；默认 system，显式 light/dark 优先于系统媒体变化。单例媒体 listener 在 HMR dispose 时释放。Vue 入口前内联脚本应用根 `data-theme`、`color-scheme` 和 theme-color；统一 semantic CSS tokens 驱动正式界面，中性深色避免纯黑大面积背景。
- `stores/preferences.ts` 保存 `eotion:editor-toolbar:<encoded userId>:<encoded workspaceId>`，默认 false。PageView 只在宽度至少 768px 且偏好开启时显示固定栏；touch toolbar、Slash、快捷键与附件 picker 独立保留。Theme 和 Toolbar 不随退出或改密删除，也不云同步。
- `views/settings/AboutSettingsView.vue` + `releaseInfo.ts` + `updateCheck.ts` 组成“软件说明”：版本/发行时间来自 build info 与 release metadata，检查更新只比较本地 `EOTION_BUILD_INFO` 与 `GET /api/health`，`packages/contracts` 的 `HealthResponse` 与真实返回一致（`version`/`buildNumber`/`gitSha`）。登录恢复的 Settings redirect allowlist 同样接受 `/settings/about`。
- cached identity 可在 network/500/502/503/504 下进入 Settings。昵称/密码禁提交或显示产品化连接提示；本地设置可修改。401 清身份，403 不转换为离线授权。MCP/Agent 仅静态“即将推出”，没有详情或 toggle。

## 验收证据（2026-10-01）

| 命令 / 验证                                                      | 结果                                                                 |
| ---------------------------------------------------------------- | -------------------------------------------------------------------- |
| `pnpm version:check`                                             | 8 个 workspace 一致，0.0.1 / build 1                                 |
| contracts / domain typecheck                                     | 通过                                                                 |
| SDK test / build                                                 | 18/18；通过                                                          |
| API typecheck / build / test:domain / test:http                  | 通过；domain 2/2，HTTP 1/1 + Sync 1/1 + File 24/24                   |
| Web typecheck / build                                            | 通过，生产 Service Worker 生成                                       |
| Web test:product                                                 | 111/111（含 Settings 11 项）                                         |
| `playwright test tests/theme.spec.ts`                            | 3/3；三态、媒体变化、异常偏好与退出/登录持久化                       |
| `playwright test --config playwright.theme-production.config.ts` | 1/1；阻断真实 production entry JS 后根主题/token/color-scheme 已正确 |
| Web test:storage                                                 | 11/11，含真实 Electron SQLite 重启回归                               |
| Web test:offline-shell                                           | 1/1，完全断网 reload 与浏览器重启                                    |
| Web test:real-sync                                               | 1/1，生产 Web / Nest / 临时 Mongo replica set / 双独立客户端         |
| Desktop typecheck / build / test；storage test；Mobile build     | 全通过；Desktop 8/8，storage 6/6                                     |
| `git diff --check`；UTF-8 无 BOM 检查                            | 通过                                                                 |

真实双客户端验收同时覆盖昵称跨设备读取、错误当前密码不退出、成功改密后当前/另一会话 401、旧密码拒绝/新密码可登录；已有 Page/Block、离线 reload、附件上传/清理继续通过。对象存储回归使用真实 SDK + 隔离 fake OSS，未修改现有 Mongo/OSS 数据。临时无持久卷 `mongo:8` replica set 容器已移除。

Visual QA 使用仓库 Playwright / Chrome（Browser plugin not available），实际截图保存于系统临时目录 `eotion-p56-visual-qa`，不纳入 Git。Light 和 Dark 均在 1440×900、1024×768、390×844 检查 Settings Index/Profile/Appearance、ProductShell、Page/Editor、文件/图片附件、Slash；另检查 Login/Register/Connectivity，system light/dark live 切换由浏览器媒体模拟验证。六种布局无横向溢出、Vite overlay 或页面运行时异常；账号表单在手机独立纵向滚动。修复初轮深色偏绿和桌面误显移动导航按钮，最终中性灰阶无突兀白块。附件六种截图来自生产真实上传链路。

可访问性检查覆盖 nav/aria-current、Back 标签、radio 方向键、switch Space、dark focus-visible、密码错误 live region、44px compact touch target 与 reduced motion。修复离线昵称描述的 aria-describedby 目标。独立 reviewer 复核安全、缓存、路由、主题、偏好与最终截图后无确定 P1/P2 blocker；测试修正以稳定的 `/app` fallback link 与后续 workspace 解析为断言，没有削弱安全契约。

P5 Final Acceptance 尚未执行；P5.4 目标 Mobile WebView/Lynx 真机完全离线重启仍待验收，浏览器媒体/布局/IndexedDB 与 Electron 结果不替代该设备边界。
