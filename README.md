# DSH Workbench

个人维护的 DeepSeek Harness（DSH）插件与使用指南。保留 DSH 原界面，补充项目管理能力。

Community plugins and practical guides for DeepSeek Harness. Not an official DeepSeek project.

## 插件

| 插件 | 能力 | 状态 |
| --- | --- | --- |
| [Chief](plugins/chief/README.md) | 自然语言项目调度、持久化记忆、任务验收、人工接手、项目看板 | 原型，0.3.2 |

Chief 独立运行在 DSH 内，不依赖 Pi Durable 或 DS-Bot。模型与登录由 DSH 提供。
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

再按 [安装与升级](docs/installation.md) 将 `dist/independent-chief-0.3.2.tgz` 安装到目标 DSH profile。
本仓库根目录是插件集合，不是可直接安装的单个 DSH 插件；不要把根 GitHub URL 当作 Chief 包。

## 文档

- [安装、升级与回滚](docs/installation.md)
- [Chief 使用说明](plugins/chief/README.md)
- [两项目验收步骤](docs/acceptance.md)
- [ChatGPT 套餐 / Codex 接入评估](docs/chatgpt-provider.md)（设计说明，尚未实现）

## 开发与兼容性

代码采用 MIT；第三方宿主和依赖遵循各自许可证。仓库只包含自建插件源码和通用文档。
Chief 适配过 DSH `0.2.1-rc.5` 的本机 Web profile，DSH 的插件接口仍可能变化。
Windows 和原生 Desktop 未在本公开版本做端到端验证；不保证任意版本可用。

提交前运行 `pnpm test` 和 `pnpm check`。不要提交凭据、个人会话、运行时记忆或内网资料。
