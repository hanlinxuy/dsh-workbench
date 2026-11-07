# 安装、升级与回滚

先安装 DSH，并确认 `dsh --help` 和 `dsh plugin --help` 可运行。
本仓库不分发 DSH 二进制、宿主源码或账号配置。

## 独立 Web 验证

在仓库根目录完成 README 的构建与打包步骤后，用一个未被其他宿主使用的目录：

```sh
export DSH_HOME="$HOME/.local/state/dsh-workbench-demo"
dsh plugin --profile web add "$PWD/dist/independent-chief-0.3.2.tgz"
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
从早期 Standard preset 的 Chief 升级时，会保留旧 Chief 并创建专属 preset 的新 Chief。
项目会话和记忆继续沿用，旧 Chief ID 记录在 `previousChiefSessionIds`。

## 回滚

停止宿主后重新安装旧包。普通同 preset 升级不应删除会话或覆盖项目台账。
若回退到没有专属 Chief preset 的旧版本，需在停机状态下将 `state.json` 的
`chiefSessionId` 指回对应的 `previousChiefSessionIds`，并同步指向新 Chief 的 `route.sessionId`。
保留全部历史；不要在运行中修改状态文件。

## 分发方式

源码仓库使用 pnpm workspace，插件独立打包。当前支持 clone → pack → DSH plugin add。
暂未发布 npm 包。已验证 pnpm Git 子目录安装 Chief（DSH 0.2.1-rc.5 / pnpm 11.18.0）：

```sh
dsh plugin --profile web add 'github:hanlinxuy/dsh-workbench#3c28fb1b5bac7a1e69cb8afc25bacf78dabcf7fa&path:/plugins/chief'
```

引号不可省略，避免 shell 解释 `&`。固定提交便于回滚；配合 ChatGPT provider 的独立安装步骤见 [ChatGPT 指南](chatgpt-provider.md)。
