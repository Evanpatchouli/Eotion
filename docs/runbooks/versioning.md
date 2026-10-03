# Versioning Runbook

Eotion 采用单一产品版本。Web、Desktop、Mobile、API、HarmonyOS / Android 以及未来的 iOS 宿主共享同一 SemVer，不为不同端分别维护产品版本。

当前基线：

```text
version     0.0.1
buildNumber 1
```

## Source of truth

唯一版本源位于根 `package.json`：

```json
{
  "version": "0.0.1",
  "eotion": {
    "buildNumber": 1
  }
}
```

- `version`：面向用户和发布的产品 SemVer。
- `eotion.buildNumber`：只增不减的构建号，供原生平台版本码和测试包区分使用。
- `apps/*/package.json` 与 `packages/*/package.json` 的 `version` 由版本脚本同步，不作为独立版本源。
- Git SHA 不写入仓库；构建时解析并注入。

## Commands

检查所有 workspace version 是否与根版本一致：

```bash
pnpm version:check
```

只把当前根版本同步到 workspace，不改变产品版本或 build number：

```bash
pnpm version:sync
```

产品版本不变，只生成一个新的测试/安装构建：

```bash
pnpm build:bump
```

例如：

```text
0.0.1 build 1
→ 0.0.1 build 2
```

升级产品版本：

```bash
pnpm version:patch
pnpm version:minor
pnpm version:major
```

这些命令会同时：

1. 更新根 `version`。
2. 将 `buildNumber` 加 1。
3. 同步所有 app / package 的 `version`。

指定版本：

```bash
pnpm version:set -- 0.1.0
```

如果指定值与当前版本不同，同样会将 build number 加 1。当前脚本只接受稳定的 `x.y.z` SemVer，不接受 prerelease/build metadata。

## Build metadata

构建统一暴露三项：

```text
version
buildNumber
gitSha
```

Web：

```ts
import { EOTION_BUILD_INFO } from './buildInfo'
```

Desktop renderer 复用 Web，因此使用同一个 `EOTION_BUILD_INFO`。Electron 构建配置会注入相同常量。

Mobile Lynx：

```ts
import { EOTION_BUILD_INFO } from './buildInfo'
```

API：

```text
GET /api/health
```

响应包含：

```json
{
  "version": "0.0.1",
  "buildNumber": 1,
  "gitSha": "<short sha>"
}
```

本地 Web / Desktop / Mobile 构建会优先读取环境变量 `GIT_SHA`，没有设置时自动执行 `git rev-parse --short=12 HEAD`。

Docker 构建看不到宿主机 Git 仓库，因此正式部署时应显式传入：

```bash
GIT_SHA="$(git rev-parse --short=12 HEAD)" docker compose up -d --build
```

只重建 Web：

```bash
GIT_SHA="$(git rev-parse --short=12 HEAD)" docker compose up -d --build eotion-web
```

如果未传入，Docker 构建中的 `gitSha` 为 `unknown`，不影响运行，但会降低线上版本可追踪性。

## Native host mapping

Android Gradle 直接读取根版本源；HarmonyOS 构建命令从根版本源生成 `AppScope/app.json5`。原生宿主映射如下：

| Platform | Product version | Build number |
| --- | --- | --- |
| HarmonyOS | `versionName = version` | `versionCode = buildNumber` |
| Android | `versionName = version` | `versionCode = buildNumber` |
| iOS | `CFBundleShortVersionString = version` | `CFBundleVersion = buildNumber` |

例如当前：

```text
Eotion 0.0.1
Build 1
```

如果 UI / 功能仍属于同一产品版本，但需要重新打 HAP 测试：

```bash
pnpm build:bump
```

得到 `0.0.1 build 2`，不需要为了每个测试包修改 SemVer。

## Git tags

开发阶段不要求每个 build 打 tag。真正形成一个需要保留的产品发布点时再创建：

```text
v0.0.1
v0.1.0
v0.1.1
```

Tag 对应产品 SemVer，不包含 build number。发布前至少执行：

```bash
pnpm version:check
git diff --check
```
