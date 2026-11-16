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
