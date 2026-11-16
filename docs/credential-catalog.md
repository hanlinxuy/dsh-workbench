# 服务凭据目录

在 Workbench settings 行的 `config.services` 声明服务。元数据只含 ref，不含值；值由 DSH `credentials.set/resolve/describe` 保存和读取。设置 → 服务凭据逐项保存，默认不提供明文回显端点。

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
