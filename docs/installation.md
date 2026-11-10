# 安装、升级与回滚

先安装 DSH，并确认 `dsh --help` 和 `dsh plugin --help` 可运行。
本仓库不分发 DSH 二进制、宿主源码或账号配置。

## 独立 Web 验证

在仓库根目录完成 README 的构建与打包步骤后，用一个未被其他宿主使用的目录：

```sh
export DSH_HOME="$HOME/.local/state/dsh-workbench-demo"
dsh plugin --profile web add "$PWD/dist/independent-chief-0.3.3.tgz"
dsh --profile web --host 127.0.0.1 --port 19451 --no-open
```

打开 DSH 打印的完整登录 URL，而不是只打开端口地址。该 URL 属于本地登录信息，不要公开。
在 DSH 中自行配置模型。Chief 本身不持有或分发模型密钥。
不同版本 CLI 可能不同；以目标宿主的 help 为准。不能同时运行两个写入相同状态目录的宿主。

## 已有 Desktop / profile

确认实际 Desktop 使用的用户、DSH_HOME 与 profile 名，停止运行中的任务并正常退出宿主。
备份该 profile 与 Chief 状态目录，然后用目标宿主的插件安装方式添加打包产物，再启动。
不要照抄 Web profile 名去安装 Desktop。首次用两个只读项目按验收文档回归。

## 升级

保留上一版 tgz 和状态备份，停止宿主，安装新版 tgz，再启动同一 profile。
0.3.3 起在绑定的原 Chief 会话内恢复专属 preset，保留会话 ID 和历史，不再为 preset 不匹配新建替代会话。
首次点击 Chief 入口也会校正被宿主按 Standard mode 复用的空白会话。
更早版本已发生的迁移记录仍保留，不删除历史会话。

## 回滚

停止宿主后重新安装旧包。普通同 preset 升级不应删除会话或覆盖项目台账。
若回退到没有专属 Chief preset 的旧版本，需在停机状态下将 `state.json` 的
`chiefSessionId` 指回对应的 `previousChiefSessionIds`，并同步指向新 Chief 的 `route.sessionId`。
保留全部历史；不要在运行中修改状态文件。

## Git 安装与子目录兼容性

在 DSH「插件 → 添加插件」粘贴一条地址即可：

```text
git+https://github.com/hanlinxuy/dsh-workbench.git#release/workbench
```

内网使用 `#release/core`（不包含 ChatGPT）。正式部署将发布分支换成**该分支的**验收提交；不能换成 `main` 的源码提交。发布分支只包含对应套装，自带 bundle 元数据，不依赖 `&path:` 解析。

Issue #4 报告 Windows DSH 0.2.1-rc.5 的子目录参数被丢弃，但用户也报告内网 GUI 使用 `git+https://…&path:` 成功。本机检查的 DSH 包保留原始 spec，因此不能把所有版本/入口一概归因于宿主归一化。Workbench 采用包根发布分支，消除这一安装歧义；没有修改 DSH 自身解析器。

CLI 需要把整个 Git 地址引起来；未经引号包裹的 `&` 会被部分 shell 当成命令分隔符。已有 `&path:/plugins/chief` 等独立插件安装仍保留，但受影响环境可用打包产物：

```sh
pnpm install --frozen-lockfile
pnpm pack:core
# 完整套装用 pnpm pack:suite；Chief 用 pnpm build && pnpm pack:chief
dsh plugin --profile <实际-profile> add <tgz-绝对路径>
```

安装时只放行固定的 agent-browser / agent-desktop 构建。Windows 需要 Node 24+ 与 Git 在 PATH 中。

### 成功判据

- 安装的包名必须为 `dsh-workbench-core` / `dsh-workbench-suite`，不是源码根包 `dsh-workbench`。
- profile `package.json` 的 `dsh.profile.bundles` 必须包含该包；仅 `pnpm add` 并不等于登记插件。
- 启动后 Chief state / board 可读取；重新启动保留 Chief 会话及项目状态。
- 看到 `declares no dsh.bundle` 或 `installed as a plain dependency` 就视作失败，不继续派任务。

Harness 安装会检查登记结果并以非零状态拒绝“普通依赖装好了、插件却没登记”的情况。

### 发布维护

源码仍只维护在 `plugins/*`。更新固定组件提交并生成、提交套装后，运行 `pnpm release:bundles`，得到 `release/core` 与 `release/workbench` 的包根分支及提交。验证固定提交，再推送；该命令本身不推送，也不修改 profile。
