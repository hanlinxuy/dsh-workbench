# 原生执行、套装迁移与 PowerShell

## 执行层

Workbench 0.2.1 起，Git 工具与 Chief Markdown 记忆的 Git 提交通过 DSH `subprocess` 服务执行，复用宿主的进程生命周期、取消、输出收集与环境清理。Git 规则仍在调用前检查；不会因执行器更换而放开外网 push 或 MR 写入。平台 API 仍使用 Node fetch，因为 DSH 没有统一 GitHub/GitLab API 适配器。

Chief 会话、调度、事件读取、工作区与工具注册使用 DSH API；SQLite、Markdown 使用 Node 原生能力。没有私有 Python、pnpm 或 Git 分发，没有额外 Python 依赖。命令需要机器上的 Git；GitHub 登录可复用机器上的 gh。AB/AD 仍是固定 release 的专用二进制。开发 CLI 在宿主未运行时用 Node 启动 DSH，不尝试调用不存在的宿主服务。

新装套装的 OPS 默认关闭，保留原生工具；X Memory、Context 仍默认开启。需要 OPS 的文件工具/PTC/Bash 时单独开启。已有用户配置的启停值优先。

## 已有 profile 的重复登记迁移

DSH 的 bundle insert 是追加，不会按组件 ID 自动去重。Workbench 提供显式离线迁移命令，不通过 npm postinstall 偷改 profile，也不在运行中的 DSH 上改登记。

1. 退出目标 profile 的 DSH，备份并安装所选套装。Core 与完整套装二选一。
2. 在该 profile 的包目录运行预览：

   ```sh
   pnpm exec dsh-workbench migrate --profile-dir .
   ```

3. 查看组件清单后应用：

   ```sh
   pnpm exec dsh-workbench migrate --profile-dir . --apply --stopped
   ```

4. 重启目标 profile，核对每个组件只有一份、配置值和启停状态正确。

处理范围为已独立安装的 X Memory、Context、OPS，以及完整套装中的 ChatGPT。保留依赖包，只移除冗余 bundle 登记；将原包默认值和启停状态放在原用户 patch 之前，用户配置优先。保留 `!!js` 标记但绝不执行表达式；不搬迁或删除记忆、凭据、模型登录、工作区或会话。重复执行无改动。遇到上游组件布局变化会停止，不猜测旧 OPS 多组件配置如何映射。

修改前将原 `package.json`、`cordis.patch.yml`、迁移记录保存到 profile 内 `.workbench-backups/<时间>/`。回滚时停止 DSH，恢复这三个文件；组件数据从未删除。单独插件依赖保留在 manifest，DSH 将其显示为未启用；运行实例由套装提供。

目前添加插件界面不会自动调用这一步：全新 profile 直接安装；已有独立登记的 profile 需要上述一次迁移。不要把“依赖包只下载一次”误认为“组件只加载一次”。

## OPS 与 PowerShell 7

2026-11-10 查阅：

- [OPS #488](https://github.com/T-Auto/dsh-ops/issues/488) 提及安装 pwsh7，并讨论 Bash/PowerShell 共存；不能据此认为 pwsh7 替代 OPS 全部文件工具/PTC 能力。
- [OPS 组件说明](https://github.com/T-Auto/dsh-ops/blob/main/docs/component-reference.md) 表明 PowerShell 由宿主管理，`upgrade-host-pwsh` 提供显式标准安装；网页 main 会变化，本套装固定 OPS 0.5.2。
- [Microsoft 安装说明](https://learn.microsoft.com/en-us/powershell/scripting/install/install-powershell-on-windows) 推荐 Windows 客户端用 WinGet，企业/离线环境可由管理员部署 MSI。

套装提供：

```sh
pnpm exec dsh-workbench pwsh
pnpm exec dsh-workbench pwsh --yes
```

第一条只检测/预览。Windows 上已可执行 pwsh7 时不安装；缺少时复用固定 OPS 的 `upgrade-host-pwsh`，检查 WinGet 并展示 Microsoft.PowerShell 安装方案。第二条才实际执行，保留 WinGet 的安装器/协议交互；不会后台提权、替换 Windows PowerShell 5.1 或覆盖 DSH 自定义 pwshPath。安装后需重启 DSH 并核对实际选中的 shell。

macOS/Linux 下提示无需为 Workbench 安装 PowerShell，不修改环境。内网无 WinGet/网络时，由内网 agent 或管理员使用公司软件源部署；不自动换源或上传配置。Mac 上不能验证 Windows 安装效果。
