# Workbench Desktop

可选 DSH 原生桌面插件，固定依赖 **agent-desktop 1.2.0 官方 npm release**。
不 fork、不要求全局安装、不依赖 Browser 插件，也不更换 DSH 界面。

## 安装

```sh
dsh plugin --profile web add --allow-build=agent-desktop \
  'github:hanlinxuy/dsh-workbench#main&path:/plugins/desktop'
```

正式部署将 main 换成验收提交。安装依赖自动带上发布包中的原生程序/helper，插件直接运行包内程序。
macOS 的辅助功能权限授予启动 DSH 的应用；使用截图才需要屏幕录制权限。
工具 permissions/status 可查询权限，guide 返回与固定二进制匹配的官方平台说明。
插件不会自动弹出授权、修改权限或升级 agent-desktop。

## 能力

`workbench_desktop` 支持：

- version/status/permissions/guide/apps；windows/snapshot(app)。
- get(ref,property)，click/check/uncheck(ref)。
- fill/type/select(ref,value)，press(app,value)。

先观察指定 app，再使用返回的完整 `@snapshot:eN` ref，最后重新读取界面确认结果。
网页任务继续用 Browser。第一版未封装截图、坐标点击/拖拽、剪贴板和应用启动/退出。

默认使用上游的语义操作模式。若确有物理输入需求，操作员可以在 profile patch 中设置：

```yaml
- id: workbench-desktop
  config:
    headed: true
```

只有显式配置才启用 headed；模型不能通过工具参数自行打开。切换可能影响焦点、鼠标和键盘。
不承诺所有应用都可后台操作；无无障碍树或未实现语义动作时，上游会返回明确错误。

数据放在 `$DSH_HOME/workbench-desktop/`，按 DSH session 分离 refs/state。
**独立 profile 隔离配置和记录，不隔离操作系统桌面。**多个项目不能同时操作同一窗口；
插件内部串行执行单次命令，但不锁定整个多轮任务。沿用应用本身的登录态。

Chief 保持原有管理工具限制；普通项目会话可用桌面工具。没有给 Chief 添加直接桌面操作权限。

## 本机回归

`test/Fixture.swift` 是一个独立 macOS 测试窗口，不读写用户文档。
编译后保持程序运行，`test/host-probe/scenario.js` 验证 snapshot → fill → click → 再读取 Saved 文本。
`test/host-probe` 是仅用于测试 profile 的宿主探针，与 Chief/Git 插件配合验证工具可见性与实际派发。
测试探针不应安装到正式 profile。

```sh
swiftc plugins/desktop/test/Fixture.swift -o /tmp/WorkbenchDesktopFixture
/tmp/WorkbenchDesktopFixture
# 另一个终端中运行仓库测试或宿主探针；完成后退出刚启动的测试进程。
```

macOS 锁屏时无法正常读取窗口；权限 granted 不等于当前桌面可访问。
Windows/Linux 发布文件随上游包提供，本机不声称已验证这两个系统。
