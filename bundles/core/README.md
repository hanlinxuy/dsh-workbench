# Workbench Core 内网套装

保留 DSH 原界面，一次安装 Chief、Browser、Desktop 和 Git，不安装 ChatGPT provider。
Chief、Browser、Desktop、Git 默认开启。独立插件继续维护与发布。

在 DSH「添加插件」粘贴：

```
git+https://github.com/hanlinxuy/dsh-workbench.git#release/core
```

正式环境用已验收提交替换 `main`。需要 DSH、Node 24+、pnpm 与 Git。
安装器若要求构建授权，只允许 agent-browser、agent-desktop。CLI 等价命令：

```sh
dsh plugin --profile web add --allow-build=agent-browser --allow-build=agent-desktop \
  'git+https://github.com/hanlinxuy/dsh-workbench.git#release/core'
```

在 DSH 原生插件管理中分别开关 independent-chief、workbench-browser、workbench-desktop、workbench-git、chatgpt。
ChatGPT 关闭时不注册提供方、不显示登录入口；开启后自行完成官方授权。安装不会复制其他 profile 的登录态。
Chief 从左侧「Chief 管家」进入，项目看板在其子项中；使用宿主当前模型配置。
Git 初始仓库配置为空。须按独立 Git 文档配置允许访问的仓库与权限，默认不能 push。
Desktop 已开启，但 macOS 仍需要对应应用的辅助功能权限；Windows 未做真实机器验收。

内网不需要 ChatGPT 时，安装 `&path:/bundles/core`，其依赖中完全不包含 ChatGPT provider。
不要同时启用 Core、完整套装或同名独立插件，否则会重复注册工具。

升级前正常停止独立 profile，备份 profile 私有状态并记录旧固定提交/包。安装新固定提交后重启。
回滚重新安装旧包，并验证开关与 Chief 会话/记忆。若未来版本修改状态格式，遵循该版迁移说明；
本版只验证同格式升级回滚，不承诺任意旧版本都能读取新格式。

`components/` 是从仓库固定提交生成的发布副本，`provenance.json` 记录源提交及 SHA256。
维护原始 `plugins/*`，更新 `bundles/components.json` 后执行 `pnpm build:bundles`；不要直接修改副本。
没有 Git 子依赖，不需要关闭 pnpm 的 blockExoticSubdeps。

详细说明见仓库 `docs/workbench-suite.md`。
