# Workbench Browser

独立 DSH 插件，使用 **agent-browser 0.41.2 官方 npm release**，不 fork、不依赖全局安装。
安装插件会同时安装 AB；不自动下载 Chromium，不安装浏览器扩展。

## 安装

需要 Node 24+、pnpm 11+、兼容的 DSH（验收版本 0.2.1-rc.5）。先使用独立 profile。

**Windows 安装提示（issue #4）：** DSH 0.2.1-rc.5 已有丢弃 GitHub 安装地址中子目录参数的报告。优先在仓库执行 `pnpm pack:browser`，再安装生成的 `.tgz`，不要假定下面的 GitHub 子目录安装命令在该环境可用。完整打包、安装步骤与限制见[安装指南](../../docs/installation.md)。

```sh
export DSH_HOME="$HOME/.local/state/dsh-browser-demo"
dsh plugin --profile web add --allow-build=agent-browser \
  'github:hanlinxuy/dsh-workbench#main&path:/plugins/browser'
```

正式使用把分支换成已验收的提交 SHA。`--allow-build=agent-browser` 只允许这个依赖的安装脚本。
0.41.2 npm 包内已有 macOS、Linux（含 musl）和 Windows 二进制；其 postinstall 在文件缺失时才尝试下载对应 release。
仓库开发安装将该脚本明确设为 false，已验证 Node launcher 可直接使用包内二进制。

若之前因 pnpm 拦截脚本安装失败，宿主可能已写入 dependency、尚未登记 bundle。
先 `dsh plugin --profile web remove dsh-workbench-browser`，再执行上述完整安装命令。
检查 profile/package.json 的 `dsh.profile.bundles` 含 `dsh-workbench-browser`；仅有 node_modules 不算安装完成。

## 浏览器与登录

使用本机 Chromium 系浏览器的可执行文件；例如 macOS Edge：

```sh
export DSH_BROWSER_EXECUTABLE='/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'
export DSH_BROWSER_HEADED=1
dsh --profile web --host 127.0.0.1 --port 19454 --no-open
```

其他系统填自己的浏览器路径。未指定时由 AB 寻找兼容浏览器；缺失时按 AB 官方安装流程单独准备。
将上述环境变量放入实际启动 DSH 的环境；浏览器登录窗口由 `DSH_BROWSER_HEADED=1` 开启。

在普通项目会话说：“使用浏览器打开网站，账号叫 work，我先手动登录。”
登录后相同 account 会复用 Cookie、localStorage 等浏览器资料。
切账号说：“关闭 work，切到 test，先确认当前登录身份，再继续任务。”

- `account` 对应独立持久化浏览器资料，不是网站用户名；关闭不等于网站登出。
- 数据在 `$DSH_HOME/workbench-browser/accounts/<account>/`，不进入项目 Git。
- 同一个 account 共享浏览器与活动页面，命令串行；并行且不同上下文的任务应使用不同 account。
- 不会自动接管日常 Chrome/Edge。第一版支持在专属浏览器登录并复用；尚无 CDP 接管 UI、截图工具、下载/上传和密码库适配。
- 不要在聊天或工具参数中放密码；宿主会保留工具轨迹。优先手动登录，内网可另接现有凭据系统。

## 工具与 Chief

`workbench_browser`：open、snapshot、click、fill、select、press、text、url、wait、back、close、version。
`target` 是 URL / snapshot ref / CSS selector / 按键，随动作变化；fill/select 使用 `value`。
工具直接启动插件本地的 AB，参数不经过 shell；每次操作后读取页面验证实际结果。

Chief 仍负责统筹，保持原有工具限制；浏览器由普通项目会话使用。
第一版没有额外界面，不改 Chief 或 DSH 原界面。

## 受控取值的能力边界（issue #2）

**本版采用 issue #2 的文档能力边界备选，不实现 eval。** `eval` / `evaluate` 在启动 AB、创建账号目录或读取网页之前拒绝；即使传入 `confirm: true` 也不会执行。任意其他未列出的 action 同样拒绝。不提供表达式参数、白名单表达式执行器或启用 eval 的配置开关。

原因是当前插件尚未集成并验证真实宿主的**逐次审批**和**结果安全审计**；这不代表 DSH SDK 不具备相关能力。仅增加 `confirm: true`、提示词要求确认、插件自定义确认弹窗或 mock 审批均不足以满足此要求。

- 可用替代：`snapshot` 读取可交互页面结构，`text` 读取元素文本，`url` 读取当前 URL；无法从这些动作获得的 JS 状态或 DOM 属性，应明确报告暂不支持，而不是猜测结果。
- 不允许以 shell、原始 agent-browser CLI、CDP、其他工具或导航执行脚本作为旁路。`open` 仅接受 HTTP(S)，拒绝 `javascript:`、`data:`、`file:` 等协议；需要本地页面时由操作者提供 HTTP(S) 测试服务。
- **现有工具不是只读沙箱**：click/fill/select/press/open 等会产生页面或服务器副作用；正常 text/snapshot 结果可能含敏感信息，宿主仍可能保存工具输入输出。不能把“未开放 eval”宣传成浏览器整体只读，也不能声称现有宿主日志只记长度。
- 未来启用受控取值必须同时满足：只支持严格解析的取值白名单（不是对任意 JS 做正则黑名单），禁止赋值、调用、网络/存储及其他副作用；`confirm` 必须严格为布尔 `true`，且真实宿主对每一次调用单独批准，拒绝、超时、取消、无审批能力均不执行。审批必须绑定账号、页面 URL 和表达式，导航改变后重新批准；读取属性也可能触发 getter，不能仅因表达式“看起来只读”就宣称无副作用。
- 未来审计应记录表达式、URL、结果长度、耗时及成功/拒绝/失败状态，**不记录完整结果**；还须验证宿主的工具结果持久化路径，不能仅在插件日志中删结果就声称满足。表达式及 URL 本身也可能敏感，应限制与脱敏。上述均为未来启用条件，**本版没有 eval 执行或其专用审计实现**。

离线回归测试覆盖 eval/evaluate、确认标志与伪造批准、未知动作和脚本 URL 的拒绝，检查拒绝不创建账号目录、不回显表达式；不打开真实网页，也不声称 mock 测试验证了宿主批准。

## Site instructions

把站点操作说明放在对应项目的 `AGENTS.md` 或宿主可读的站点 skill，任务中要求先读取。
建议记录：入口 URL、登录身份检查位置、任务步骤、成功判据和提交后如何查回结果。
不要保存密码、Cookie 或 snapshot 的临时 ref。插件注入通用操作说明，站点规则仍由项目维护。
这版没有另外实现 skill 安装器；沿用 DSH 的项目规则/skill 机制。

## 内网准备

镜像这个插件及 `agent-browser@0.41.2` npm tarball，保留 lockfile integrity；同时准备目标机器可用的浏览器。
本版包已包含各平台二进制，正常安装不需访问 GitHub 下载它们。
如镜像裁剪了二进制，postinstall 会尝试外网下载，因此离线包验收必须先执行插件的 version，再启动浏览器。
发布包与浏览器都是独立供应项；升级 AB 应改固定版本并重跑下面的验收。

## 开发验收

```sh
pnpm install --frozen-lockfile
node --test plugins/browser/runtime.test.js
DSH_BROWSER_EXECUTABLE='/path/to/browser' node plugins/browser/test/live.mjs
pnpm pack:browser
```

`test/live.mjs` 创建本地测试站及临时浏览器资料，验证表单、登录持久化、两个账号隔离与切回，结束关闭并清理。
`test/host-probe` 是仅用于隔离 profile 的测试插件：与 Chief、Browser 一起安装后，检查项目工具可见、Chief 限制及真正的宿主工具派发。
它会创建测试会话并输出 `$DSH_HOME/browser-host-probe.json`；不要安装到正式环境。
详见 [验收记录](../../docs/browser-acceptance.md)。
