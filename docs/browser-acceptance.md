# Browser 0.1.0 验收

2026-11-07；macOS ARM64，DSH 0.2.1-rc.5、Node 26.5.1、pnpm 11.18.0，agent-browser 0.41.2。
使用独立 browser-0412 profile 和独立 Edge 浏览器资料；不操作现有 profile 或 IM。

已完成：

- 固定依赖安装，运行 package-local CLI 确认为 0.41.2。
- 检查 npm tarball：已包含各平台原生二进制，无需编译；安装未下载 Chromium。
- 本地真实浏览器：表单登录、填表提交后 DOM 读回。
- close 后重新创建 runtime：持久 Cookie 保留。
- 第二账号初始为 guest、独立登录，再切回第一账号仍是原身份。
- 参数边界及仓库既有单元测试，共 30 项通过。

安装发现及处理：pnpm 11 首次拦截未知 postinstall 会导致 DSH dependency 已写入、bundle 未登记。
移除未完成安装后使用 `add --allow-build=agent-browser` 完整重装，不能仅凭 dependency 判断插件加载成功。

宿主探针已通过：实际 DSH 工具派发完成 version/open/snapshot/text/close；普通项目会话可见工具，Chief 会话仍仅有管理工具。真实网站 SSO、验证码、Windows/Linux 和真实模型自主规划未在这轮验收；
本地测试成功不代表所有内网站点已通过。
