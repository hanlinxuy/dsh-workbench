# DSH Workbench

个人维护的 DeepSeek Harness（DSH）插件与使用指南。保留 DSH 原界面，补充项目管理能力。

Community plugins and practical guides for DeepSeek Harness. Not an official DeepSeek project.

## 一次安装

推荐 [Workbench 套装](docs/workbench-suite.md)：Chief、Browser、Desktop、受限 Git，以及 X Memory、Context 一起安装，ChatGPT 安装但默认关闭。OPS 不再依赖；PowerShell 7 由环境设置管理。在 DSH「添加插件」粘贴：

```text
git+https://github.com/hanlinxuy/dsh-workbench.git#release/workbench
```

内网用 `#release/core`，完全不带 ChatGPT。正式部署将发布分支换成该发布分支的验收提交。各插件仍可独立安装。

## 插件

| 插件 | 能力 | 状态 |
| --- | --- | --- |
| [ChatGPT provider](docs/chatgpt-provider.md) | ChatGPT 官方授权、DSH 模型提供方 | 上游 submodule，0.1.18 |
| [Desktop](plugins/desktop/README.md) | 固定 agent-desktop release、原生应用观察与操作 | 可选，0.1.4 |
| [Git](plugins/git/README.md) | 多平台/remote、分级写权限、逐次外发审批与持久审计 | 可选，0.2.8 |
| [Browser](plugins/browser/README.md) | 固定 AB release、站点账号、私有截图与 Cookie 捕获/恢复 | 可选，0.1.6 |
| [Chief](plugins/chief/README.md) | 项目调度、记忆、任务验收、人工接手、项目看板 | 0.3.8 |
| [Provider gateway](plugins/provider-gateway/README.md) | 内网模型路由、探测、排队与受控同步 | 默认关闭，0.1.6 |

Chief 独立运行在 DSH 内，不依赖 Pi Durable 或 DS-Bot。模型与登录由 DSH 提供。
`plugins/chief` 是 Chief 的唯一维护目录，后续开发、修复与发布均在本仓库进行。
本仓库不包含 DSH 宿主，不提供模型凭据，也不绑定 IM。

## 安装

需要已安装的兼容 DSH、Node.js 24+、pnpm 和 Git。建议先用独立 profile 验证。

```sh
git clone https://github.com/hanlinxuy/dsh-workbench.git
cd dsh-workbench
pnpm install --frozen-lockfile
pnpm build
pnpm test
pnpm check
pnpm pack:chief
```

再按 [安装与升级](docs/installation.md) 将 `dist/` 中生成的包安装到目标 DSH profile。
`main` 根目录是源码集合；`release/core` 与 `release/workbench` 的根目录才是可安装套装，不再依赖 `&path:`。

## 文档

- [安装、升级与回滚](docs/installation.md)
- [Chief 使用说明](plugins/chief/README.md)
- [两项目验收步骤](docs/acceptance.md)
- [0.2.9 P0 交付与验收](docs/p0-0.2.9.md)
- [能力归属与工具预算](docs/capability-ownership.md)
- [0.2.8 机制索引与远端 Desktop 验收](docs/issue-sweep-0.2.8.md)
- [ChatGPT 套餐 provider](docs/chatgpt-provider.md)（上游插件安装与验收）

## 开发流程

使用 [plugin-harness 开发 skill](dev/plugin-harness/SKILL.md)：`dev/<topic>` 分支 → 独立 profile → 验收 → 主线。
本仓库主线为 `main`；内网可用 `master`。正式环境安装与开发回归分开，不自动升级。

## 开发与兼容性

代码采用 MIT；第三方宿主和依赖遵循各自许可证。仓库包含自建插件、第三方插件 submodule 和通用文档。
本版在 DSH Desktop `0.2.2-rc.1` 的远端 Mac 独立 profile 完成真实模型与 GUI 验收。DSH 插件接口仍可能变化，升级宿主须重新验证。
Windows 有 CI 与随包 PowerShell 实际执行验证；公司受限 Windows Desktop 的完整现场验收仍未覆盖。

提交前运行 `pnpm test` 和 `pnpm check`。不要提交凭据、个人会话、运行时记忆或内网资料。

原生执行、已有插件重复登记迁移与 PowerShell 7 检测/安装入口，见 [基础设施说明](docs/native-infrastructure.md)；本轮证据见 [0.2.1 隔离验收](docs/acceptance-native-20261110.md)。
