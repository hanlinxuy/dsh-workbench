> 0.2.3 更新：套装不再依赖或登记 OPS；PowerShell 检测与 WinGet 安装由 Workbench 独立实现。已有独立 OPS 不会被迁移器卸载，仍由用户单独管理。

# Workbench 套装：安装、开关与回滚

## 选择

| 能力 | 完整套装 | Core 内网套装 |
| --- | --- | --- |
| Chief 0.3.6 | 开启 | 开启 |
| Browser / agent-browser 0.41.2 | 开启 | 开启 |
| Desktop / agent-desktop 1.2.0 | 开启 | 开启 |
| Git 0.2.1 | 开启，自动识别当前仓库 | 开启，自动识别当前仓库 |
| dsh-x-memory 0.1.1 | 开启 | 开启 |
| dsh-context 0.83.1 | 开启 | 开启 |
| dsh-ops 0.5.2 | 默认关闭，可选 | 默认关闭，可选 |
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

0.2.2 起，在「插件 → Workbench / Workbench Core → 环境与迁移」可检测并迁移受支持的独立组件，保留配置、启停状态和数据。其他旧 bundle/插件仍需先停用，避免重复注册。详见 [设置页验收与使用](acceptance-settings-20261110.md)。
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

## 常用插件一起安装

0.2.0 起 Core 与完整套装都固定依赖 dsh-x-memory、dsh-context、dsh-ops，直接复用上游发布包与组件 ID，不 fork、不复制源码。各组件仍可在 Plugins 单独开关；OPS 0.5.2 使用统一配置入口，采集面板、TUI、下载拦截沿用上游默认关闭。

X Memory 管理工作区知识，Chief 的目标、约束、验收、阻碍、下一步仍存放在 Chief 私有 Markdown/Git 中。每次派单把该项目六字段快照交给 Worker，不向 Worker 开放 Chief 的记忆写权限。

若现有 profile 已单独登记这三个 bundle，先在独立 profile 验证迁移：避免同一个组件同时由独立 bundle 和套装重复插入。已有记忆与配置不需要删除。不要把“安装新版套装”当作自动迁移许可。

GitLab MR 读操作可用，写操作默认禁止。内部平台可显式允许创建/评论；合并还需仓库目标分支白名单，并读取实际 MR 的目标分支及源 SHA。外网 MR 写入仍拒绝。Browser 本轮没有实现 eval；只支持既有页面导航、快照与交互。

0.2.0 套装兼容目标为 DSH Desktop / Web 0.2.2-rc.1（OPS 最新版要求该宿主系列），套装声明对应 peer dependency。旧 DSH 0.2.1 用户继续使用 0.1.5 的固定发布提交，先在独立 profile 验证宿主升级。独立插件不因套装要求而统一改写版本边界。

## 0.2.1 原生执行与已有配置迁移

新装 OPS 默认关闭，优先保留 DSH 原生工具。已有独立 X Memory / Context / OPS / ChatGPT 的 profile 使用[离线迁移命令](native-infrastructure.md)，保留配置、启停与原数据，移除重复登记。该文档也包含 pwsh7 检测与显式安装入口。

## 0.2.7：修复与可选模型网关

新增 `workbench-provider-gateway`，默认关闭。启用前配置固定回环端口和可信后端，复用“内网连接”的账号、请求头、模型刷新和手动调用测试。详见 [网关说明](../plugins/provider-gateway/README.md)。没有自动复制登录态、启用网关或发布共享凭据。

发布必须通过 `pnpm check`：固定组件的每个分发文件必须与当前源码一致，版本也必须一致。`provenance.json` 的 versions、commits、sha256 分别给出组件版本、固定提交与文件校验值。历史 0.1.5 套装已知落后源码，不再作为 MR/Browser 修复的安装目标；升级到已验收 0.2.7（宿主需 0.2.2-rc.1）。
