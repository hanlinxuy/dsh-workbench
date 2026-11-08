# Chief + Desktop/Git：真实模型验收

日期：2026-11-08。独立 profile，DSH 0.2.1-rc.5、Node 26.5.1、pnpm 11.18.0。
模型：本机已有 DeepSeek 账号对应的 deepseek-flash，reasoningEffort=low。
未改现有 profile，未接 IM；凭据副本和完整会话仅在本机私有测试目录。

## 自然语言链路

从 Chief 接收一条中文任务开始，而不是直接调用执行工具替代模型：

1. 桌面项目：操作独立 AppKit 测试窗口，将输入改为指定验收标记，点击 Save test，再读回 Saved 文本。
2. Git 项目：只暂存指定文件并提交，推送到本地 bare remote；验证外网策略拒绝及 GitHub 只读 API。
3. Chief 自行 list/register/remember/dispatch；项目 agent 自行选择工具；完成后 Chief read/audit/review。

首轮两个任务提交时间相差 19ms，执行区间重叠；桌面约 20.8 秒、Git 约 27.4 秒。
实际轨迹中桌面项目只调用 workbench_desktop，Git 项目只调用 workbench_git，没有换 shell/浏览器绕过。
桌面从真实工具结果确认 `Saved: REAL_MODEL_DESKTOP_OK_1108`。
Chief 自动收到完成通知，读取完整报告及 audit，并将验收、阻碍和下一步写入项目记忆。

## 发现并修复

Git 0.1.0 的 log 接受通用参数中的 branch，但执行时忽略它。模型曾用 log(branch=company/main)
作为远端证据，Chief 也采信了项目报告。该证据不成立，因此没有仅凭“模型说通过”结束测试。

Git 0.1.1：

- log(branch) 真正读取指定本地/跟踪分支，非法选项被拒绝。
- 新增 remote_head(remote,branch)，通过 ls-remote 读取真实服务端 SHA，沿用 remote 的只读权限与 URL 核验。
- 操作说明要求推送后独立读回远端，不以空输出或跟踪分支代替服务端证据。
- 回归用两个不同提交的分支证明 branch 参数生效，而非两个恰好相同的分支。

复测由原 Chief 重新派发，明确撤销旧证据；只为 Git 准备一处新的测试文件变更，桌面任务不重复执行。
真实模型复测通过：remote_head 返回的完整 SHA 与独立读取 bare 仓库 main 的值一致；
log(baseline) 不含新提交，log(main) 含新提交。两次 API 拒绝和 outside push 拒绝均在实际工具返回中核对。
Chief 重新完整读取报告与 audit，保存 accepted 评审。固定提交安装及重启结果在发布后补充。

## 外网写入限制

测试 remote outside 被标记为 external，但接收端是本机空 bare 仓库；即使策略失效也不会推送到外网。
配置故意令 push=true，验证 external 分类仍会拒绝。独立检查接收端 refs 为空。

外网 API 的 apiWrites=[]。模型各调用一次 issue_create/comment_create，均收到 API write is disabled，
在 HTTP 调用前拒绝。轨迹中没有其他工具绕过；没有对外创建 issue/comment。
这验证“允许哪些写入”的开关，不表示 issue/comment 永久禁止；按内网规则配置相应许可后可使用。

## 代理验证

本机 Clash HTTP CONNECT 代理实际完成两个只读操作：GitHub API repo_get 与 HTTPS Git fetch。
测试在客户端和 Clash 之间放一个本地 CONNECT 转发器，只记录目标主机，不解密 TLS/记录凭据。
看到 api.github.com:443 和 github.com:443；再将代理改为不可用地址，两种操作都失败。
因此这两次成功是经过代理的成功，不是直连恰好可用。

API 使用 Node fetch，启动 DSH 时要设置 NODE_USE_ENV_PROXY=1；仅设置 HTTPS_PROXY 不应被当作已生效。
Git HTTP 另外读取 Git proxy 配置，测试隔离了全局配置以避免优先级混淆。SSH remote 另走 SSH 代理规则。
复现：`CLASH_PROXY_URL=http://127.0.0.1:49159 node plugins/git/test/proxy.mjs`。

## 范围

这是有限的真实模型闭环，不是任意桌面应用、任意内网站点的成功率评测。
Windows/Linux、公司 SSO、公司 Git 平台真实写入未验证；GitHub/GitLab API 写入格式仍由本地模拟服务测试。
外网安全限制作用于插件工具，整机出口策略继续由内网部署负责。
