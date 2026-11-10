# MR、Browser、Worker 记忆及 0.2.2 套装验收

验收日期：2026-11-10。实现提交 `9b6569f`，DSH 分页历史适配 `fbaa940`，恢复错误清理 `1e010b0`；套装源提交 `cc29b40`。

## 版本与隔离范围

- DSH Web **0.2.2-rc.1**，macOS arm64，Node 24.22.2，pnpm 11.18.0。
- Chief 0.3.5、Git 0.2.0、Browser 0.1.1；Core / 完整套装 0.2.0。
- 固定上游 npm release：X Memory 0.1.1、Context 0.83.1、OPS 0.5.2。完整套装额外安装 ChatGPT 0.1.18，默认关闭；Core 不安装 ChatGPT。
- 只新建 harness DSH_HOME 和 Web profile，未修改正式 Desktop、Mini 或 IM。原仓库已有未提交工作保留，收拢工作在独立 worktree 完成。

实际从 Git 包根提交安装并核对文件：

| 套装 | 固定提交 |
| --- | --- |
| Core | `abfce4f980bce2b09e86f2d8be04ee4666c9d996` |
| 完整套装 | `a564bc3ecbcb5310d9d29f88314f8f46523e40c9` |

## 自动测试与真实模型

本机 68 项测试与生成物一致性检查通过。[CI](https://github.com/hanlinxuy/dsh-workbench/actions/runs/42750721286) 全套及 Windows/macOS/Linux Chief 测试通过。

真实 DeepSeek 模型通过 Chief 自然语言登记两个一次性项目，写入不同的六字段记忆，同一轮派发，两个 Worker 并行执行：

- **GitLab MR**：仅请求本机 HTTP fixture，完成 list/get/comments、创建后读回、评论后读回、合并后读回。合并核对实际目标分支与 SHA。外网 MR 合并与 push 返回策略拒绝；未向真实平台发送 issue、comment 或其他写入。
- **Browser**：通过套装工具与本机 Edge 完成本地表单，实际读取到 `HELLO_BROWSER_B`；eval 和 javascript: 导航均被拒绝，最后关闭该工具浏览器。
- **Worker 记忆**：两份派发快照分别包含各自 goal/priority/constraints/criteria/blockers/nextSteps；MR Worker 实际调用 X Memory 保存并读回独立知识标记。Chief 项目记忆与 X Memory 的工作区知识用途分开。
- **结果与验收**：Chief 通过 read 读取完整报告、audit 核对调用，再 review 写入结论。重启后真实模型再次调用 list/read，读回两份报告、阻碍和下一步，没有重发任务。

测试题干曾直接出现另一个项目的标记词，所以 Worker 声称“整个提示看不到该词”不能作为隔离证据。已要求 Chief 更正并持久化：验证的是六字段注入快照归属正确；不把模型自述等同于独立证明。

## 原生界面、接手与重启

- Chief 原生会话显示 Chief 管家 preset。
- Plugins 中 Core 0.2.0 的七个组件显示 Running，包括 X Memory、Context 和 OPS。
- 在 Browser Worker 的原生聊天输入框发送接手消息，模型回复 `TAKEOVER_022_OK`；只有 Browser 项目变成 user，MR 仍归 chief。
- 停止后从最终固定 Git 提交安装并重启：Chief/Worker ID、任务 request ID、单项目控制权保留；重启前后的项目 memory 和 acceptance 对象完全一致。
- `/resume Browser验收` 明确交回，`/home` 返回原 Chief；随后模型实际读回两项目结果并报告控制权均为 chief。
- 完整套装在另一个全新 profile 安装、启动，Chief 初始化成功，三个上游版本核对一致，ChatGPT 默认关闭。

## 本次发现并处理的问题

1. DSH 0.2.2 不再提供旧 `sessionController.inspect`。任务已完成却无法回收。现优先使用 `events` 分页读取，固定 cursor，支持跨页 turn，保留旧宿主 fallback；真实重启回收成功。恢复成功时清理之前的 inspection 错误。
2. 同路径同版本 tgz 重打后 pnpm 可能沿用旧缓存。最终验证改为固定 Git 提交，并比对实际安装文件；不以安装退出码作为新代码已加载的证据。
3. pnpm 首次禁止 AB/Desktop postinstall 会使下载完成但 bundle 未登记；DSH 重试会保留这个未启用状态。本轮只对新建空测试 profile 授权这两个精确依赖的构建，移除未登记套装后重新 add，登记与启动成功。已有用户 profile 应先备份，不能直接套用清理操作。

## 未验证范围

真实模型 Git 操作为本机 GitLab 模拟服务，不能等同于公司真实 GitLab 联调。Windows 覆盖 CI 的插件/SQLite 回归，未运行 Windows Desktop 界面。OPS、Context 已确认随宿主加载；本轮没有逐项验收它们全部上游功能。Browser eval 仍未提供，不将 confirm=true 当作授权实现。两个项目是针对性一次性验收目录，不是完整真实业务项目。
