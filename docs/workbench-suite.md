# Workbench 套装：安装、开关与回滚

## 选择

| 能力 | 完整套装 | Core 内网套装 |
| --- | --- | --- |
| Chief 0.3.4 | 开启 | 开启 |
| Browser / agent-browser 0.41.2 | 开启 | 开启 |
| Desktop / agent-desktop 1.2.0 | 开启 | 开启 |
| Git 0.1.2 | 开启，自动识别当前仓库 | 开启，自动识别当前仓库 |
| ChatGPT provider 0.1.18 | 安装，关闭 | 不安装 |

本机推荐完整套装，需要订阅模型时再打开 ChatGPT；内网推荐 Core，使用已有 vLLM 配置。
ChatGPT 是额外提供方，不替换或关闭 DeepSeek。套装不携带凭据、不绑定 IM。
Desktop 默认开，但系统权限不会自动授予。Windows 原生操作尚未实机验证。

## 一次安装

DSH 添加插件输入以下来源之一，正式环境将发布分支替换为该发布分支的验收提交：

```text
git+https://github.com/hanlinxuy/dsh-workbench.git#release/workbench
git+https://github.com/hanlinxuy/dsh-workbench.git#release/core
```

`main` 根目录不是插件包；上述发布分支的根目录就是套装。也可以继续独立安装 `plugins/chief`、`plugins/browser`、
`plugins/desktop`、`plugins/git`。独立插件与套装不要重复启用。

需要 Node 24+、pnpm、Git 与兼容 DSH。CLI 安装例子：

```sh
dsh plugin --profile web add --allow-build=agent-browser --allow-build=agent-desktop \
  'git+https://github.com/hanlinxuy/dsh-workbench.git#release/workbench'
```

UI 若弹构建确认，只放行上述两个固定依赖。没有 Git 子依赖，不关闭 pnpm 的 exotic-subdependency 保护。
网络代理由运行 DSH 的环境配置；ChatGPT 可用 `DSH_CHATGPT_PROXY_URL`。不写入实际代理地址或密钥。

## 分别开关

原生 Plugins 中切换 `independent-chief`、`workbench-browser`、`workbench-desktop`、
`workbench-git`、`chatgpt`。关闭状态写入该 profile 的配置，重启、同格式升级回滚后保留。
Chief 的 preset 与管理插件共用一个开关；关闭后入口和 preset 一并撤下，私有记忆保留。
ChatGPT 关闭时不注册 provider、不显示授权界面，启用后再自行登录。

Chief 左侧入口及项目看板保持原样。工具遵循各自的会话权限，套装不会扩大 Chief 的执行权限。
Git 按 [Git 文档](../plugins/git/README.md) 配置仓库：空配置自动识别当前工作区并允许只读访问；外网 push 默认禁止，
API 写入只可按策略开放 issue/comment。插件约束只覆盖插件入口，不是宿主 Bash 的全局防火墙。

## 更新与回滚

先在独立 profile 安装固定开发提交，通过后主线安装同一提交。使用
[plugin-harness](../dev/plugin-harness/SKILL.md) 管理隔离目录。
正常停止宿主后备份 profile 私有配置、Chief 状态/Markdown/Git 记忆；记录旧包或提交。
安装新包并启动，检查开关、Chief ID、项目 ID、目标、阻碍、下一步。回滚用旧来源重新安装，
保留状态；若有状态格式迁移，按该版本说明恢复配套备份。

从独立插件迁移时先禁用旧 bundle/插件，再启用套装，避免重复注册；不删除现有状态。
Core 与完整套装互换也需停用旧套装。此轮未自动迁移任何已有用户 profile。

## 维护方式

独立插件源码是唯一维护来源。套装 `components/` 是从 `bundles/components.json` 中固定 Git 提交生成的发布副本。
更新原插件并提交后，更新固定提交，运行 `pnpm build:bundles`、`pnpm test`、`pnpm check`。
`provenance.json` 为每个副本记录 SHA256。直接改副本会被 check 拒绝。
完整套装从 npm 安装预构建 ChatGPT 0.1.18；原来的上游 submodule 继续用于源码审查。

## 此版验收

macOS，DSH 0.2.1-rc.5，Node 24，独立 suite profiles：

- 完整套装一次安装，四个默认能力加载，ChatGPT provider 与前端默认不加载。
- 四项逐个关闭/开启，实际工具、提示词、preset、前端图随开关变化；ChatGPT provider 可注册/卸载。
- Git 空仓库配置阻止未授权写入，没有往外网发 issue/comment。
- Core 无 ChatGPT 依赖及运行入口。
- macOS Desktop 独立窗口实际 snapshot → fill → click → snapshot 回读成功；测试窗口已关闭。
- 0.1.0 → 0.1.1-test.0 → 0.1.0：同格式测试包升级回滚；开关、Chief/项目 ID、Markdown 目标/阻碍/下一步保留。
- 本轮为真实宿主集成验收，无模型调用；不重复宣称新的真实模型项目调度验收。

复现脚本：`bundles/test/check-live.mjs`，仅对新建 `suite-*` profile 使用；
`bundles/test/probe` 为开发探针，不包含在套装发布文件中，不安装到正式 profile。
Windows 实机、跨状态格式迁移、已有 standalone 自动迁移未在此轮验证。

2026-11-08 固定 Git 来源验收：
`56e2b340491be91f65da40f887a32af3a165f6be`，从 GitHub `&path:/bundles/workbench` 实际安装，
比对发布文件与组件 SHA256 后重跑开关、限制和 macOS 窗口操作，均通过。36 项自动测试和生成文件检查通过。
套装源码未在此记录之后改动；正式使用可固定此提交。测试 profile 已停止，现有环境未升级。

## 0.1.1 显示修正

套装及自建组件增加中英文名称和简短说明，组件使用包入口避免展示本机文件路径。Chief 前端与管理能力由套装主入口统一加载；浏览器、桌面和 Git 保持独立开关。ChatGPT 沿用上游元数据。发行默认仍关闭 ChatGPT，本机手动开启的状态保存在 profile，升级保留。

提交生成产物后运行 `pnpm release:bundles`，把两个套装拆成根目录可安装的 `release/core`、`release/workbench` 分支。验证分支固定提交后再推送它们；发布分支不手工编辑。这样用户仍只需在添加插件框粘贴 Git 地址，不经过 `&path:`。
