# Desktop / Git 0.1.0 开发验收记录

验收日期：2026-11-08。开发分支：dev/agent-desktop-plugin。
环境：macOS ARM64、DSH 0.2.1-rc.5、Node 26.5.1、pnpm 11.18.0。
使用新建 desktop-git-001 profile，不更改已有 profile 或接入 IM。

## 已完成

- Desktop 固定依赖 agent-desktop 1.2.0；检查 npm 包中的原生程序/helper，实际 version 确认。
- 在自己创建的 Swift/AppKit 测试窗口，完成 snapshot → fill → click → 新 snapshot 读回 Saved 标记。
- Git 在临时本地仓库完成精确文件暂存、commit、fetch、推送到本地 bare remote，独立比较目标 ref 与 HEAD。
- 验证 localWrite=false 拒绝本地写入、external 分类即使 push=true 仍拒绝推送、remote URL 变化被拒绝。
- GitHub/GitLab 本地模拟 API 验证 issue/comment 路径与请求体、分页、写权限拒绝和不跟随重定向。
- 全仓库 33 项测试通过；Chief 构建一致性检查通过。
- Git 宿主探针通过：普通项目可见 workbench_git，Chief 保持管理限制，实际工具调用 catalog/status 成功。
- tgz 安装已成功，Desktop postinstall 使用发布包内原生程序，无全局安装。

## 宿主回归

初次宿主测试时本机锁屏，Desktop 返回 window_without_accessibility_element；系统确认 screenLocked=true。
用户解锁后，在同一独立 profile 重启并重跑：项目工具可见、Chief 管理限制、Git catalog/status、
Desktop version/snapshot/fill/click/新 snapshot 读回全部通过。只操作本次创建的 AppKit 测试窗口。

固定 Git 提交安装与重启结果在发布验证后补充。

## 验证边界

没有向外网发 issue/comment，没有连接公司内网服务。平台 API 为本地契约测试；
Windows/Linux 未实测。宿主探针属于真实工具执行，不是模型自主规划验收。
独立 DSH profile 不隔离 OS 桌面；测试只操作本次创建的测试窗口。

等待解锁期间正常停止新增 profile 和测试窗口；解锁后仅恢复这些测试进程。原有环境保持不变。
