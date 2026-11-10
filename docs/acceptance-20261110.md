# Chief 初始化与套装安装回归（2026-11-10）

## 范围与版本

修复来源提交 `d9bc06e`；生成套装提交 `3bece8e`；CI 配置修复 `7c364f0`。
Chief 0.3.4，Core / 完整套装 0.1.5。本机 DSH 0.2.1-rc.5、Node 24.22.2、pnpm 11.18.0、macOS arm64。
只在新建隔离 DSH_HOME / Web profile 操作，没有更新已有 Desktop、模型登录或 IM。

## 已通过

- 本机完整测试 48 项；`pnpm check` 验证源代码与固定组件快照一致。
- [GitHub Actions](https://github.com/hanlinxuy/dsh-workbench/actions/runs/42747347041)：全套测试和生成检查通过；Windows、macOS、Ubuntu 各自执行 Chief 40 项测试通过。
- 生命周期测试覆盖 effect 重叠 setup、未等待卸载即重建、初始化失败释放、操作排空、跨进程租约拒绝、异常退出重开、保存失败后的清理。
- 新 profile 安装 Core tgz 后，bundle 登记成功，真实宿主 Chief state / open 正常；10 次并发 open 正常，`/home` 写入持久化路由。
- 同 profile 停止后升级为下表的固定 Git 提交，重启后 Chief ID 与完整 state 相同，open / `/where` 正常。
- 另一个全新 profile 从完整套装固定 Git 提交安装，登记成功，Chief state 正常；ChatGPT 安装但保持默认关闭。
- 两个测试宿主验收后正常停止，保留私有证据供复核；没有启动模型任务或连接 IM。

| 套装 | 实测 Git 包根提交（不带 path 参数） |
| --- | --- |
| Core | `d24a67faa2e0fc616658f074ba2a3b7a0f1d382b` |
| 完整套装 | `85a5de0ea61a123d0f78583493c7135ab13eefe3` |

## Issue #4 的边界

本机 CLI 实际保留了 `git+https://…&path:/bundles/core`，没有复现 Windows 报告的路径丢失。用户也报告内网 GUI 的 git+https 写法成功，因此不能仅据一条报告认定所有宿主都会丢路径。
这次以包根发布分支消除 Workbench 对 `&path:` 的依赖；没有改动 DSH 自身的 URL 解析器。
Harness 新增安装结果核验，普通依赖或漏登记视为失败。初次试装中构建未批准导致包下载但未登记，确实属于安装失败，未记为成功。

## Issue #5 的边界

同一 effect 重叠初始化/卸载重建的复现已修复。仍禁止不同控制器共享可写 store，不把直接重复 openStore 改成两个控制器共同写入。
Windows CI 验证的是实际 Node/SQLite 与插件 adapter 回归，不是 Windows DSH Desktop 界面。报告现场的具体 effect 重放触发路径仍未在 Windows 宿主上追踪；Windows 使用者应验证首次打开、重启与启停。

## 其余 Issues 与已有工作

本轮浏览了 #1–#5，优先交付 #4 / #5。原工作区已有的 GitLab MR 扩展（#1）、Browser 能力边界（#2）、Worker 记忆注入（#3）及相关文档未夹带进发布，也没有覆盖或删除。
先前 DSH 会话完成了本地代码修改，但没有发布修复；其记录不等于已验证套装。会话本身无需重置或删历史。本轮没有更改该会话状态。
