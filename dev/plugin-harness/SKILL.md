---
name: plugin-harness
description: Develop and regress DSH Workbench plugins in isolated profiles, test a pinned development branch, and promote verified commits to the repository mainline. Use for plugin changes and release validation, not ordinary Chief project tasks.
---

# DSH plugin harness

这是开发 skill 与辅助脚本，不是 DSH 运行时插件。保留 DSH 原界面；不用它替换模型或 IM。

## 分支与隔离

- 从实际主线创建 `dev/<topic>`。查询远端默认分支，不能假定叫 master；本公开仓库目前为 main。
- 开发 profile 安装开发分支的**固定提交**；正式 profile 只安装已验收的主线提交或发布包。
- 脚本只管理 `$HOME/.local/state/dsh-workbench-harness/<name>` 下由它新建且有 marker 的目录。
  不接受任意 DSH_HOME，也不修改已有 Desktop / Web profile。不要把模型凭据、登录 URL 或会话日志提交进 Git。
- 脚本当前面向 macOS/Linux，使用 ps 和 SIGTERM；Windows 尚未验证。

## 运行

在 Workbench 根目录运行。`DSH_BIN` 可指定目标宿主的 CLI 路径，默认使用 PATH 中的 dsh；
Node 版本由 PATH 决定。ChatGPT provider 当前建议 Node 24；模型配置在新 profile 单独完成。
脚本不自动复制凭据或创建软链接。

```sh
pnpm harness init chief-fix
pnpm harness install chief-fix 'github:OWNER/REPO#DEV_COMMIT&path:/plugins/chief'
pnpm harness start chief-fix 19453
pnpm harness status chief-fix
pnpm harness stop chief-fix
```

初始化拒绝覆盖已有目录。先验证端口空闲；start 只表示已启动子进程，需核对 status 和该目录私有 host.log 确认宿主就绪。
从 host.log 取得完整登录 URL，在浏览器打开；不要将它输出到公开报告。
stop 为正常终止请求，等待 status 显示不再运行后再安装或升级。
安装命令调用 `dsh plugin --profile web add`，并检查直接依赖确为 bundle 且已登记；普通依赖或漏登记会失败。套装优先使用 `release/core` / `release/workbench` 的固定提交，避免宿主子目录解析差异。
Git prepare 的授权按具体插件说明处理；不要关闭所有构建限制。

未推送的改动可先 `pnpm build && pnpm test && pnpm check && pnpm pack:chief`，
再安装生成的 tgz 进行快速验证。最终验收需与记录的 Git 提交一致：提交到开发分支后，
经用户授权推送并以固定 Git 提交重新安装，核对实际包版本与内容。

## 验收门槛

按改动选择真正有关的场景。Chief preset 改动至少覆盖：

- 全新 profile 点击 Chief 管家，首条消息前顶部显示 Chief 管家；实际 Chief 工具可调用。
- 记录 Chief ID、消息标记、控制权及任务状态；正常停止、重启同一 profile 后核对 ID 和历史不变，再实际调用工具。
- 若修复历史会话迁移，保留原 ID 与日志；失败时不能伪造成功的 preset 事件或丢弃旧状态。
- 项目调度改动还需验证结果回收、人工接手只影响当前项目、明确交回及重启恢复。

记录运行时与插件版本、测试提交、通过项、失败项和未验证范围。单测通过不能代替界面与真实模型验收。
遇到失败先保持开发分支和隔离实例，不自动升级正式 profile。

## 合入与正式安装

用户已授权提交推送且验收通过时，将**同一测试提交**合入实际主线；不夹带未验证源码。
若合并冲突改变代码，重新验收。文档记录测试提交及对应主线提交。
正式 profile 的安装是独立步骤：按用户本次授权处理，不能因测试通过自动操作已有环境。
保留上一版固定提交/包与状态备份，按 [安装和回滚](../../docs/installation.md) 操作。
