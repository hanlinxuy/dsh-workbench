# Workbench 0.2.2 设置页验收

2026-11-10，macOS、Node 24、DSH 0.2.2-rc.1。仅使用独立 harness profiles，没有操作现有 Desktop、Mini 或 IM，没有复制模型凭据或调用模型。

## 固定来源

- 实现：c7b8717。
- Core：b843226ecded03f3973e19f7541bfb90fb010c22。
- 完整套装：9c3dc353af541e829216c9c8984fb91de488df9a。

## 已验证

- 两个固定 Git 套装均安装成功，真实宿主详情页显示「环境与迁移」。完整套装 ChatGPT 默认关闭。
- Core 自动识别三个独立组件；页面确认迁移后显示已生效，生成备份。
- 独立读取宿主合成配置：三个 ID 各一份，配置与原启停状态一致。
- 正常停止、重启后，Chief 状态和组件配置保持一致。
- Mac 显示无需安装 PowerShell，没有发起安装。
- 75 项自动测试与生成产物检查通过。覆盖活动任务阻止迁移、重复执行、缺少 HMR、保存后 HMR 失败，以及 Windows PowerShell 检测和安装结果重新核验。

## 使用与限制

打开「插件 → Workbench / Workbench Core → 环境与迁移」，自动检测当前 profile。点击「查看并迁移」→「确认迁移」，先备份再保存，使用宿主实时重载；不能实时生效时明确提示重启。

Windows 缺少 PowerShell 7 且可用 Winget 时显示安装按钮。通过 DSH 原生 subprocess 调用系统安装器，结束后再次检测版本。安装失败或 PATH 尚未生效会显示实际状态。macOS/Linux 不安装 PowerShell。

没有 Windows 实机，Winget 实际安装、UAC 和企业策略未验证；Windows 分支采用注入进程结果测试。检测发生在设置页打开时，不弹全局聊天通知。系统授权仍可能需要人工处理。
