# 2026-11-16 Issue 批次

范围：#14–#41，共 28 条。开发分支 dev/issue-sweep-20261116；正式 Desktop 不变。

## 当前验证中的修改

- #14：设置页检查宿主实际 pwshPath，显式路径错误不回退；无 WinGet 提供用户目录 ZIP 路径指引。
- #15：固定 @dsh-ops/pwsh-win32-x64 0.2.1 可选依赖。Windows x64 设置页可将随包运行时接入宿主；不会覆盖显式自定义路径。bundledPwsh:false 隐藏使用入口；禁止下载需安装时排除 optional dependencies，运行时开关不会撤销已经下载的包。卸载前清除该 pwshPath，恢复宿主默认解析。尚未做受限 Windows 真机验收。
- #23：合并前仅允许 can_be_merged；合并后独立 GET 验证 merged，失败返回 outcome_unknown。两种授权模式尚未完成，不能关闭整条 Issue。
- #35：模型发现不再写配置；同步须预览并显式确认，五分钟有效、一次使用；目标配置变化要求重新预览。沿用 configEditor、备份、回读。
- #37：端口状态按当前实例判断；同进程冲突报告持有者 PID/实例，外部冲突给出本机诊断命令，不冒称已监听。Chief 原有租约/崩溃恢复测试继续覆盖。
- #38：拒绝不带快照前缀的 ref；上游 stale_ref/lock 错误原样保留；补原生与网页边界、刷新 refs、权限和未知锁屏说明。
- #32：新增错题集与规范；仅记录有证据的复发次数，不虚构三次晋升记录。

## 未完成的验收范围

#16、#17、#18、#19、#20、#21、#22、#24、#25、#26、#27、#28、#29、#30、#31、#33、#34、#36、#39、#40、#41 尚未达到各自完整验收要求。#24 是总索引，随各子项更新。不能用上述修改或单元测试推断这些功能已经支持。

## 验证记录

- pnpm test：103 项通过（本机 Node 26.5.1，后续补 Node 24）。
- npm 实包检查：pwsh 包包含 bin/pwsh.exe、bin/LICENSE.txt（Microsoft MIT），无安装脚本，仅 win32/x64，固定 npm integrity 已进入 lockfile。
- 未发送真实 Git 写入；未使用 IM；未修改正式 Desktop。

## 第二组开发进展

- #16：配置驱动的服务凭据目录、原生 credentials 存储、单 ref 白名单写入、状态脱敏、失败原因分类；设置新增“服务凭据”。旧连接配置尚未自动迁移，域/preset 自动联动和完整实例编辑仍待完成。
- #20/#21：Browser 支持操作员配置的 site → account，按 site/account 隔离 profile，捕获前当前 host 守卫、逐 cookie 域与有效期过滤、身份绑定恢复。真实 AB + 独立 headless Edge + 本机 HTTP fixture 已验证 capture 1 / restore 1 / 页面业务文本读回；未连接任何真实内网站点。
- #17：Git 高副作用动作默认预览，无远程请求；confirm:true 仍经原生 approval.request，每次只接受 allowed-once。写入日志仅保存参数哈希与元数据。测试覆盖拒绝/缺少交互通道/每次重新询问；完整跨重启不确定写入阻断仍待完成。
- #30：独立 DSH web 宿主中，不带 cookie、伪造 XMLHttpRequest 请求头调用内网设置得到 401；合法宿主会话返回 200。继续复用原生鉴权，无免密明文端点。

CI 43795512543 对 01fb2a4 的五项 job 全绿，包括 Windows 真实执行随包 pwsh.exe 为 7.6.6。该 CI 仅覆盖第一组固定提交，不能代替第二组的最终 CI。

独立安装记录：pnpm 下载/构建完成后进程未退出；终止本次独立安装的 pnpm 子进程后，通过 harness 的 registerInstalledBundles + verifyInstall 完成并验证原生登记，再启动宿主。此安装命令不计为无干预通过；不会以它证明安装链路完全正常。正式 profile 没有变化。
