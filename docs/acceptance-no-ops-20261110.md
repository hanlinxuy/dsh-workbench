# Workbench 0.2.3：移除 OPS 与 Desktop 升级

实现提交 a8bd3d4；Core 固定包 117c3217d55c1ad0788d21898ea02206556231e6，完整套装 0b64d330cdde4c118f89cd56e3498cc9fc2733f5。

## 改动

- 删除两个套装的 OPS 依赖、组件登记与迁移器接管规则。独立安装的 OPS 由用户管理，不自动删除。
- 设置页和备用 CLI 共用 Workbench 自有 PowerShell 检测、WinGet 安装与安装后版本核验；没有 OPS 运行时引用。
- 使用 DSH subprocess，不分发 PowerShell 二进制，不更改 DSH 自定义 Shell 配置。

## 验证

macOS、DSH 0.2.2-rc.1。75 项自动测试、生成检查和 CI 通过。独立 profile 从固定 Git 提交升级，实际设置页显示 0.2.3、无 OPS 组件、登记正常，Mac 无需安装分支正常。测试 profile 已停止。Windows 安装分支仅受控测试，未验证实际 WinGet/UAC。

用户授权后通过 Desktop 自带 CLI 升级本机：备份配置、Chief 状态和会话文件哈希；正常退出、安装同一固定提交、迁移 Memory/Context 重复登记，再正常启动。升级前后 55 个会话文件哈希一致；Chief ID 和项目保留，真实界面显示原历史及 Chief preset。ChatGPT 原启用值保留，套装内 Memory/Context 开启且各一份。独立旧 bundle 显示关闭是登记迁移结果，不代表组件停用。

## Agent Teams 对 Chief 的影响：当前未隔离

DSH 0.2.2-rc.1 的 experimental-agent-team 将普通根会话视作 lead。experimental-tool-agent-team 向其精确 agent scope 注册 team:policy、team:identity 和团队工具，包含 Chief。UI 标题栏按钮只是其中的可见部分。

当前 preset schema 只有 id/name/description/order/plugins，没有排除全局团队插件的声明；tools.restrict 明确不能屏蔽同一 scope 的局部工具。因此不能声明 Chief 完全不受影响，也不应仅加一句提示词就宣称隔离。此次保持用户的团队开关，不改宿主、不 monkey-patch 私有服务。

建议宿主提供 preset/session 级 capability opt-out（例如排除 agent-team，名称仅为建议），统一作用于成员资格、恢复/消息投递、工具、系统提示词和 UI。验收应覆盖团队开启时 Chief 无团队身份/工具，普通项目仍可使用团队，切换和重启保持 Chief ID/控制权/任务状态。此宿主能力尚未实现。
