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

## 固定开发提交 fa367c4 的验收

- Node 24.22.2：111 tests，110 passed，1 skipped（本机非 Windows）。
- pnpm check 通过；CI [43796857481](https://github.com/hanlinxuy/dsh-workbench/actions/runs/43796857481) 全绿，含 Windows 运行时与三平台回归。
- 本机独立 profile：issue-sweep-20261116，DSH 0.2.2-rc.1，端口 19516。
- 首次升级同路径 tgz 命中旧内容；改为 dsh-workbench-suite-fa367c4.tgz 后验证 installed client/runtime/catalog 与构建产物逐字节一致。真实设置页面出现“服务凭据”。
- UI 保存专用假凭据成功；保存后输入框清空，显示“已保存 · file”。宿主重启后状态仍为已保存；状态响应不含值。
- 无 cookie 的 status/set/unset 三种凭据请求均返回 401；目录外 ref 的写入被拒。测试假凭据已删除。
- 未配置真实模型，未进行模型自然语言调用，不把这些结果标为 L1 模型验收。
- 正式 Desktop、用户会话、IM 均未操作。所有新 Issue 仍保持 open，未把局部实现冒充完整验收。

## 第三组：远端隔离验证中（尚未合入/关单）

在 hwstaff Mac 的任务专用目录执行测试，既有 Desktop 0.2.0-rc.2 未修改。另下载官方 Desktop 0.2.2-rc.1，codesign --verify --deep --strict 通过，使用其 Electron Node 24.21.0 跑本轮源码：129 tests，128 passed，1 skipped（Windows 专项）。这仍是运行时测试，不冒充 GUI/真实模型验收。

- #25/#26：五域目录与默认能力归属、可选代理口令覆盖/noProxy；多端点多桶索引、独立宿主凭据、待清理孤儿、设置 UI。参见 credential-domains.md。真实算力调用统计及内网 preset 业务工具由内网适配器接入，不能由保存凭据次数推断。
- #17：持久 pending 指纹阻断不确定写入；跨重启和并发重复调用测试通过。完成后再次明确请求仍可执行。日志不含 payload 或凭据。
- #23：用户确认原话必须来自本会话 human source；auto-reviewed 必须由可信宿主审查适配器提供匹配 head/target 的证据。内网实际审查适配器尚未接入，不能宣称真实子代理审查验收。
- #22/#34：内存共享池参考适配器默认禁止出借、双凭据来源、TTL/关闭/重启清空；按账号队列、前台优先、后台额度上限、全队列退避、取消/超时及元数据指标。内网池发布 UI/服务协议仍由适配器提供。
- #30：网关令牌改为必填，缺配置拒绝监听；所有 HTTP 路由鉴权，轮换立即生效。宿主设置路由继续依赖原生会话鉴权。
- #28/#39：单一 JSON 站点卡真源、实际工具依赖检查、禁用能力隐藏、秘密/临时态/重复源审计、确定性渲染、部署前备份改动产物。egress 卡在缺外发闸门时拒绝加载。
- #41：可选本地知识 search/read，一次取完整正文、来源、时间、过期标记；未启用不注册工具，损坏/未命中给明确回源路径。参见 site-cards.md。
- Desktop 运行时实测发现 AB 子进程丢失 Electron Node 模式，导致版本检查空结果；仅在 Electron 宿主显式传入 Node 模式标志，修复后同运行时复测通过。

其余 #18/#19/#27/#29/#31/#33/#36/#40 仍需继续实现或补全验收；所有 Issue 最终以完整验收证据决定是否关闭。
