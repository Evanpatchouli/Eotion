# Current Task — Public Website + User Guide

2026-10-04；基于 master 05a110a，已 fetch 确认与 origin/master 一致。

## Work Units
1. S0 investigate / scout：真实能力 Evidence Pack（完成）。
2. S1 execute / fast_worker：8 篇公开指南（完成）。
3. S2 decide → S1 execute / main：VitePress DefaultTheme 扩展、六节首页、下载 UI / SEO（完成）。
4. S2 decide → S1 execute / worker：单一 release 元数据、静态容器、runbook（完成）。
5. S1 execute / fast_worker：公开演示数据驱动真实产品截图（完成）。
6. S0 verify / main：版本、typecheck、build links、Playwright 三尺寸/搜索/主题（完成）。
7. Review / reviewer：最终独立复核（完成）。

## Invariants
不改产品 UI/现有 origin，不公开内部 docs；无配置下载为 null；官网 origin 未设置时 noindex，无伪 canonical；根版本/build 与 web releaseInfo 是 source of truth。

## Result
实现完成：VitePress 六节首页、下载、8篇指南、更新日志，Quiet Studio三态主题、本地搜索、SSR/SEO、配置式发布数据、静态Nginx/Compose8002。版本/typecheck/build通过；339内部链接/锚点/资源通过；2个SSR回归+7个Playwright通过；1440/1024/390 light/dark截图已review。独立review唯一P2已修并复核通过。
Docker完整镜像构建被Corepack访问npm registry网络错误阻断；临时Nginx挂载最终静态产物与同一配置的HTTP替代验证通过。未上线；正式官网origin、DNS/TLS与公开安装包URL由部署者后续配置。现有产品origin不变。
