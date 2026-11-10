# 原生执行与套装迁移验收（2026-11-10）

实现 `57a8604`，发布快照 `af837c3`。Workbench Core/完整套装 0.2.1，Chief 0.3.6，Git 0.2.1。DSH Web 0.2.2-rc.1，macOS arm64，Node 24.22.2。只使用两个新建 harness profile；正式 Desktop、Mini、IM 均未操作。

## 固定 Git 安装

- Core：`fbcf03c02473ffd674e48d6fd2bcd20f0e44f5a8`
- 完整套装：`8ed3eda6f74d51e480abae71f9dda7f0b6ccd11b`

两个固定 Git 包根均实际安装并启动，Chief 均初始化成功。完整套装 OPS/ChatGPT 默认关闭。`pnpm exec dsh-workbench pwsh` 在 Mac 正确返回无需安装，没有改系统。

## 迁移

先在隔离 profile 通过 DSH 安装独立 X Memory 0.1.1、Context 0.83.1、OPS 0.5.2。设置 X Memory autoInject=false、Context disabled=true、OPS hidePwsh=false/hideOfficialTools=false，然后安装 Core，离线执行迁移。

使用真实宿主 `loadProfileDirectory` 和 `composeEntries` 比较迁移前独立组件与迁移后的组件：按 ID 对齐，显式 false 与缺省启用等价化后，三个组件的 name/config/disabled 全部一致；每个 ID 恰好一份。独立依赖保留，冗余登记移除。再次预览 changes=0。

单测同时验证私有备份原文、用户配置优先、disabled 状态、!!js 标签保留而不执行、要求停止标志、重复应用不变。Harness 接受已经迁移并由有效套装接管的独立依赖；没有套装时仍将未登记视为错误。

## 真实模型与宿主进程服务

Chief 登记一次性 Git 项目、记住三个标记、派发只读 status。Worker 实际通过 workbench_git(repository=current) 返回分支及未跟踪 README；Chief 读取报告、audit 后 review。调用没有改用 Shell 或网络。

Chief 记忆 Git 历史独立读回包含 Update/Review 提交，证明宿主 subprocess 不只是注入成功而是实际完成 Git 操作。

停止并重启：Chief/Worker ID、request ID、项目 memory、acceptance 对象不变；模型再次 list/read，完整读回目标、阻碍、下一步和已验收结果，没有派发新任务。

## 自动测试和边界

本机 70 项测试与生成物一致性检查通过。源实现的[三平台 CI](https://github.com/hanlinxuy/dsh-workbench/actions/runs/42759145111)通过；最终 harness 检查另随主线 CI 运行。

- Windows Chief/SQLite 测试在 CI，不等于 Windows Desktop/WinGet 安装实机验证。
- PowerShell Windows 安装复用固定 OPS 的显式 WinGet 入口；Mac 只验证非 Windows 不安装分支。
- 本轮原生 Git 回归是一次性本地仓库；外网写入限制由现有针对性测试复验，没有向平台发送写请求。
- 迁移不是 GUI 安装后的自动热迁移。需要退出目标 DSH，再执行明确的 profile 迁移命令；不自动改用户其他 profile。
- 迁移支持已审查的单组件布局；未知/旧多组件 OPS 布局需单独映射，失败时不写配置。
