# 错题集

只记录可复现的工程错误，不记录私密会话或凭据。相同根因更新同一条的“复发”计数；第三次必须关联规范和自动守卫。这里的次数只计有证据的本仓事件，不推测历史发生次数。

## M-1：检测结果和执行器不一致

- 症状：设置页只探测 PATH，忽略 DSH 实际选择的 PowerShell。
- 根因：面板重新实现了另一套路径选择。
- 修法：直接探测宿主 executor 的 pwshPath；显式路径失效不回退。
- 教训：状态页显示实际执行器，不能以旁路探针代替。
- 复发: 1
- 证据：Issue #14，bundles/test/powershell.test.js。

## M-2：读取入口隐式写入配置

- 症状：刷新模型清单同时更改 provider.models。
- 根因：发现和同步被放进同一个 adapter.models 方法。
- 修法：发现只读；同步先预览，确认后备份并走 configEditor，最后回读。
- 教训：按钮语义和副作用必须一致。
- 复发: 1
- 证据：Issue #35，plugins/provider-gateway/index.test.js。

## M-3：请求成功冒充业务完成

- 症状：MR 合并 PUT 返回 200 即报告完成，未检查实际 merged 状态。
- 根因：传输成功被当成业务证据。
- 修法：合并前只接受 can_be_merged；合并后 GET 回读，未验证时报 outcome_unknown，不重放。
- 教训：写入验收必须采用独立读回。
- 复发: 1
- 证据：Issue #23，plugins/git/mr.test.js。

## M-4：同名本地包被缓存复用

- 症状：重新打包并覆盖同名 tgz 后安装，设置入口仍是旧版。
- 根因：本地包路径/版本标识未变化，包管理器复用了旧解析结果；仅看安装退出码未发现。
- 修法：验收包文件名带源提交，安装后比较实际文件与构建产物的 SHA256。
- 教训：安装成功不等于安装了目标提交。
- 复发: 1
- 证据：本轮隔离 profile 中新 catalog.js 缺失，改用 fa367c4 包名后逐文件一致。

## M-5：工具 schema 的替身测试漏掉原生限制

- 症状：Git 单测通过，Desktop 加载时因嵌套 authorization 对象缺 additionalProperties:false 而失败。
- 根因：单测的 defineTool 替身没有执行宿主的完整 schema 校验。
- 修法：修正 schema，并使用目标 Desktop 自带 SDK 运行 native-schema-preflight。
- 教训：替身测试不能证明原生注册成功。
- 复发: 1
- 证据：69c079e；dev/plugin-harness/scripts/native-schema-preflight.mjs。

## M-6：Electron 宿主子进程误当 GUI 启动

- 症状：Desktop 内执行 agent-browser --version 得到空输出。
- 根因：以 process.execPath 启动子进程却丢失 Electron 的 Node 模式。
- 修法：仅在 Electron 宿主中给该子进程显式传 ELECTRON_RUN_AS_NODE=1。
- 教训：实际 Desktop 运行时也需要验收，普通 Node 通过并不足够。
- 复发: 1
- 证据：ed374f8；hwstaff 官方 Desktop 0.2.2-rc.1 的 Node 24.21.0 复测。

## M-7：JSON 转义换行绕过文本脱敏

- 症状：原生知识工具返回的 JSON 正文中，测试 password 字段未被遮盖。
- 根因：只对序列化后的文本使用词边界正则，转义换行中的 n 与 password 连在一起。
- 修法：JSON 先解析，逐字符串及凭据字段脱敏，再编码；保留后续正文和合法结构。
- 教训：脱敏测试同时覆盖纯文本和真实工具的结构化包装。
- 复发: 1
- 证据：d4fda1e；bundles/test/spill.test.js；原生 1.25 MB 全文回读。

## M-8：验收器使用了替身事件的关联字段

- 症状：真实工具调用成功，但 preflight 找不到匹配结果。
- 根因：替身在 result.data 放 callId，Desktop 实际放在 message.toolCallId。
- 修法：按原生消息形状关联，保留旧导出兼容；新增原生形状成功/失败用例。
- 教训：以宿主原始事件做验收，不能仅拿自建事件证明解析器正确。
- 复发: 1
- 证据：16f7bad；dev/plugin-harness/evidence.test.js；最终原生 preflight PASS。
