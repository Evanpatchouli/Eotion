# Public Site

`apps/site` 是独立的 VitePress 静态官网。产品入口仍为 `apps/web`；官网不承载产品路由、`/api` 代理或登录会话。

## 本地构建

在仓库根目录运行：

```bash
pnpm --filter @eotion/site dev
pnpm --filter @eotion/site build
pnpm --filter @eotion/site preview
pnpm --filter @eotion/site typecheck
pnpm --filter @eotion/site check:links
pnpm --filter @eotion/site test
```

官网版本号与 build number 来自根 `package.json`，更新日期和亮点来自 `apps/web/src/releaseInfo.ts`。`apps/site/data/releases.ts` 将当前版本匹配到发布说明；若版本已升级但尚未增加对应发布说明，`releasedAt` 为 `null`，亮点为空。更新日志列出 `releaseInfo.ts` 中的记录，不单独维护第二套发布文案。

## 构建期配置

以下环境变量由 VitePress 配置注入公开客户端数据，且由 Compose 以 Docker build args 传入。它们只应包含公开 URL，不应写入凭据。修改后需要重新构建官网镜像，重启已有容器不会更新静态页面。

| 变量 | 用途 | 未设置时 |
| --- | --- | --- |
| `EOTION_SITE_ORIGIN` | 官网正式 origin，用于 canonical、robots 与 sitemap | `null`；不输出虚构官网 origin |
| `EOTION_APP_ORIGIN` | Web 产品入口 | `https://eotion.evanpatchouli.space` |
| `EOTION_DOWNLOAD_WINDOWS_INSTALLER_URL` | Windows NSIS installer | `null` |
| `EOTION_DOWNLOAD_WINDOWS_PORTABLE_URL` | Windows portable | `null` |
| `EOTION_DOWNLOAD_WINDOWS_ZIP_URL` | Windows ZIP | `null` |
| `EOTION_DOWNLOAD_ANDROID_APK_URL` | Android APK | `null` |
| `EOTION_DOWNLOAD_HARMONY_HAP_URL` | HarmonyOS HAP | `null` |

URL 必须是绝对 HTTP(S) 地址，不能包含凭据；两个 origin 变量不能带路径、query 或 fragment。正式发布前在部署环境设置 `EOTION_SITE_ORIGIN=https://eotion.site.evanpatchouli.space`。下载 URL 只在对应可分发产物已上传、可公开访问且完成必要验收后设置；未配置时页面应隐藏或禁用该下载入口，不能根据文件名猜测地址。原生 debug 签名包不应作为正式发布包宣传。

未设置官网 origin 的预览构建使用 `noindex, nofollow` 与 robots `Disallow: /`，不输出 canonical / sitemap。设置真实 HTTPS `EOTION_SITE_ORIGIN` 后，构建自动输出逐页 canonical、OpenGraph、Twitter Card、robots 与 sitemap；正式上线应先验证这些产物。

## 截图资产

真实产品截图在 `apps/site/public/screenshots/`，WebP 为展示格式，PNG 保留作为兼容 fallback 和 OpenGraph 图片。由 `pnpm --filter @eotion/site screenshots` 渲染真实 `apps/web` UI；内容来自公开演示 fixture，邮箱为保留示例地址，不含生产账号或客户文档。生成方式见 `apps/site/scripts/screenshots.md`。首页图片有明确尺寸、首图 preload，其余 lazy loading。开发脚本、测试和资产说明不作为公开 Markdown 页面构建。

Build 会先执行 VitePress 的 Markdown 链接检查，再检查静态 HTML 中的内部链接、锚点与图片资源（包括 Vue 官网组件的链接）。测试包含更新日志真实组件 SSR 回归与 Playwright smoke，验证导航、原生文档 Sidebar/TOC、搜索、三态主题、平台推荐和 1440×900 / 1024×768 / 390×844。设置 `EOTION_SITE_QA_DIR` 为工作区外目录可输出截图；测试需要本机 Chrome，先执行 build 再 test。

## 容器与入口

`docker-compose.yml` 的 `eotion-site` 服务使用 `apps/site/Dockerfile` 多阶段构建静态文件，由独立 Nginx 容器提供。它加入现有 `eotion-app` Docker network，并仅映射宿主机 `127.0.0.1:8002:80` 供诊断；产品 `eotion-web` 继续使用 `127.0.0.1:8001:80`。官网容器没有 API 或数据库依赖。

先检查展开后的构建参数，再单独部署官网：

```bash
docker compose config
docker compose up -d --build eotion-site
docker compose ps eotion-site
curl -I http://127.0.0.1:8002/
curl -I http://127.0.0.1:8002/changelog
```

公网 DNS、TLS 证书和 host 路由由独立 `Evanpatchouli/nginx-config` 仓库维护。正式官网域名为 `https://eotion.site.evanpatchouli.space`，通过边缘 Nginx 的 `conf.d/eotion-site.conf` 代理到 `eotion-site:80`；现有 `https://eotion.evanpatchouli.space` → `eotion-web:80` 产品路由保持不变。边缘 Nginx 与 `eotion-site` 共用 `eotion-app` network，首次/重复部署使用 nginx-config 仓库的 `deploy-eotion-site.sh` 申请/复用独立证书并验证 HTTPS。此仓库的 Compose 与内层 Nginx 不会自行创建公网路由或证书。

## 更新与回滚

更新发布文案时先修改 `apps/web/src/releaseInfo.ts`；更新下载链接时设置相应构建期变量并重建 `eotion-site`。上线前运行 `pnpm version:check`、官网 build，并核对实际产物版本、构建号、平台、签名状态、URL 可用性。Windows 产物命名与构建步骤见 [Desktop packaging](desktop-packaging.md)，移动端产物与签名边界见 [Mobile native hosts](mobile-native-hosts.md)。

回滚时切换到上一已知稳定的代码与公开 URL 配置，重新执行 `docker compose up -d --build eotion-site`，再验证官网正式 HTTPS 地址。官网是静态服务，回滚不涉及数据库。


## 当前正式域名与下载域名

```text
官网：https://eotion.site.evanpatchouli.space
产品：https://eotion.evanpatchouli.space
下载：https://download.evanpatchouli.space
```

`download.evanpatchouli.space` 作为统一品牌下载入口，由边缘 Nginx 提供 HTTPS，并按原始路径 302 到阿里云 OSS 官方 HTTPS 域名。真实安装包流量由 OSS 直接提供，不经过 Eotion 应用服务器；Nginx 只承担极小的重定向请求。站点下载环境变量应在对应正式产物完成签名并上传 OSS 后指向 `https://download.evanpatchouli.space/<product>/<version>/...` 的不可变版本路径。


下载域名的 DNS、Let's Encrypt 证书和 302 规则由 `Evanpatchouli/nginx-config` 的 `conf.d/download.conf` 与 `deploy-download.sh` 维护。底层对象存储当前为 `https://evan-oss-download.oss-cn-hangzhou.aliyuncs.com`；未来替换存储/CDN 时，不应改动公开下载 URL，只调整下载网关的 302 目标。
