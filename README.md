# DSH Workbench

个人维护的 DeepSeek Harness（DSH）插件与使用指南。保留 DSH 原界面，补充项目管理能力。

Community plugins and practical guides for DeepSeek Harness. Not an official DeepSeek project.

## 一次安装

推荐 [Workbench 套装](docs/workbench-suite.md)：Chief、Browser、Desktop、受限 Git，以及 X Memory、Context、OPS 默认组件一起安装，ChatGPT 安装但默认关闭。在 DSH「添加插件」粘贴：

```text
git+https://github.com/hanlinxuy/dsh-workbench.git#release/workbench
```

内网用 `#release/core`，完全不带 ChatGPT。正式部署将发布分支换成该发布分支的验收提交。各插件仍可独立安装。

## 插件

| 插件 | 能力 | 状态 |
| --- | --- | --- |
| [ChatGPT provider](docs/chatgpt-provider.md) | ChatGPT 官方授权、DSH 模型提供方 | 上游 submodule，0.1.18 |
| [Desktop](plugins/desktop/README.md) | 固定 agent-desktop release、原生应用观察与操作 | 可选原型，0.1.0 |
| [Git](plugins/git/README.md) | 多平台/remote 配置、独立写权限、外网 issue/comment 限定 | 可选原型，0.1.1 |
| [Browser](plugins/browser/README.md) | 固定 AB release、网页操作、独立登录资料与账号切换 | 原型，0.1.0 |
| [Chief](plugins/chief/README.md) | 自然语言项目调度、持久化记忆、任务验收、人工接手、项目看板 | 原型，0.3.5 |

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

再按 [安装与升级](docs/installation.md) 将 `dist/independent-chief-0.3.5.tgz` 安装到目标 DSH profile。
`main` 根目录是源码集合；`release/core` 与 `release/workbench` 的根目录才是可安装套装，不再依赖 `&path:`。

## 文档

- [安装、升级与回滚](docs/installation.md)
- [Chief 使用说明](plugins/chief/README.md)
- [两项目验收步骤](docs/acceptance.md)
- [ChatGPT 套餐 provider](docs/chatgpt-provider.md)（上游插件安装与验收）

## 开发流程

使用 [plugin-harness 开发 skill](dev/plugin-harness/SKILL.md)：`dev/<topic>` 分支 → 独立 profile → 验收 → 主线。
本仓库主线为 `main`；内网可用 `master`。正式环境安装与开发回归分开，不自动升级。

## 开发与兼容性

代码采用 MIT；第三方宿主和依赖遵循各自许可证。仓库包含自建插件、第三方插件 submodule 和通用文档。
Chief 适配过 DSH `0.2.1-rc.5` 的本机 Web profile，DSH 的插件接口仍可能变化。
Windows 和原生 Desktop 未在本公开版本做端到端验证；不保证任意版本可用。

提交前运行 `pnpm test` 和 `pnpm check`。不要提交凭据、个人会话、运行时记忆或内网资料。

原生执行、已有插件重复登记迁移与 PowerShell 7 检测/安装入口，见 [基础设施说明](docs/native-infrastructure.md)；本轮证据见 [0.2.1 隔离验收](docs/acceptance-native-20261110.md)。
