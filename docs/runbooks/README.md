# Runbooks

这里记录可重复执行的操作流程，例如：

- 开发环境初始化
- 测试与验证
- 构建与发布
- 部署与回滚
- 常见故障排查

推荐文件：

```text
runbooks/
├── README.md
├── development.md
├── testing.md
├── deployment.md
└── versioning.md
```

Runbook 应尽量描述“怎么做”和“出现什么结果算正常”，不要变成大篇幅背景知识。

- [Desktop production API](desktop-production.md)：bundled Electron 的 HTTPS origin、Cookie Session、配置和离线启动验收。
- [Windows Desktop packaging](desktop-packaging.md)：NSIS、Portable、ZIP 分发命令、版本文件名与产物验证。
- [Mobile native hosts](mobile-native-hosts.md)：Android APK/AAB、HarmonyOS HAP/App Pack、工具链、调试签名与真机验收。
- [Public site](public-site.md)：独立官网的发布元数据、公开下载 URL、容器部署与回滚。
