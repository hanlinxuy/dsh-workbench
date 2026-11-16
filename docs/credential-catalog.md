# 服务凭据目录

在 Workbench settings 行的 `config.services` 声明服务。元数据只含 ref，不含值；值由 DSH `credentials.set/resolve/describe` 保存和读取。设置 → 服务凭据逐项保存，默认仅显示状态；用户可显式查看单项 20 秒。

```yaml
- id: workbench-settings
  config:
    enabledPresets: [intranet-core]
    services:
      - id: primary
        title: 主账号
        domain: identity
        preset: intranet-core
        fields:
          - {key: employeeId, label: 工号, ref: IDENTITY_PRIMARY_ACCOUNT, secret: false}
          - {key: password, label: 密码, ref: IDENTITY_PRIMARY_PASSWORD, secret: true}
      - id: gitlab-a
        title: GitLab A
        domain: code
        fields:
          - {key: token, label: 访问 Token, ref: CODE_GITLAB_A_TOKEN, secret: true}
```

可用域：identity、code、model、storage、patent。多个实例用不同 service id 和不同 ref；不允许两个域共享 ref。`enabledPresets` 是此模板的显式启用清单，不代表自动跟踪当前聊天的 preset。缺失、空值、占位符、未授权 ref 分别返回 missing/empty/placeholder/unauthorized。配置在插件重新加载后生效，凭据轮换下一次操作即生效。

内网适配器通过 `ctx.get('workbenchCredentials')` 获取同一目录的 resolve/status 方法。旧“内网连接”配置没有自动迁移，也不会因这个模板被删除；迁移仍须另行验收。

设置端点使用 DSH 原生 `connection.fetch`，由宿主会话鉴权，不另外开免密回环服务器。本机独立 web profile 验证：只有伪造 `x-requested-with`、无宿主 cookie 的请求返回 401。凭据接口不注册成模型工具。

单项查看通过原生鉴权的 settings 路由 `reveal(ref)`，仍受目录 ref 白名单限制；不注册模型工具、不支持批量读取。
状态接口始终不含值。用户点击“查看 20 秒”才请求一个 ref，响应 Cache-Control:no-store；临时视图在超时、窗口失焦、页面隐藏或卸载时清除。
missing / empty / placeholder（含 changeme）/ unauthorized 分别返回原因；页面给对应处理提示。没有“查看全部”或明文日志。
