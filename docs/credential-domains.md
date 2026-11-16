# 服务凭据与对象存储

Workbench 设置中的服务凭据按身份、代码平台、模型网关、存储、专利分组。目录由操作员/内网适配器配置在 `workbench-settings.config.services`，页面只读目录元数据并向 DSH 原生 credentials 保存、清除值；仅在用户点击单项查看时经原生鉴权临时显示一个 ref，不提供批量明文接口，也不另建凭据后端。

```yaml
enabledPresets: [intranet-core, data-compute]
services:
  - id: company-primary
    title: 主账号
    domain: identity
    fields:
      - { key: employeeId, ref: COMPANY_EMPLOYEE_ID, secret: false, label: 工号 }
      - { key: password, ref: COMPANY_PASSWORD, secret: true, label: 密码 }
      - { key: proxyPassword, ref: COMPANY_PROXY_PASSWORD, secret: true, optional: true, label: 代理密码覆盖 }
    proxy:
      url: http://proxy.example.invalid:8080
      noProxy: [.example.internal, localhost]
```

`enabledPresets` 是操作员启用的能力集合，不是模型可改的参数，也不会随当前聊天切换自动变化。默认归属：identity/code/model → intranet-core；storage → data-compute；patent → patent。未启用的目录分区隐藏，原凭据保留。可信宿主服务 `workbenchCredentials.resolveService(id)` 在未启用时拒绝解析；不同域不得共用 ref。内网真正的业务工具必须在对应原生 preset 内注册，不能因为凭据已填写就全局注册。Workbench 不替内网虚构专利/算力 API 工具。

专利实例的五个字段可声明为 GRANT_TYPE/CLIENT_ID/CLIENT_SECRET/USERNAME/PASSWORD，各使用独立 PATENT_ 前缀 ref；`resolveService` 按字段点名缺失项，optional 字段可留空。服务目录是白名单，页面不能写任意 ref。

`deriveProxy(identityId, targetURL)` 仅供可信宿主适配器调用。noProxy 命中直接返回 direct=true，不读取代理口令；否则在内存中以工号/密码生成 URL，proxyPassword 已配置时覆盖密码。派生 URL 不落库，不在 HTTP 设置接口返回；适配器必须避免记录 URL。页面仅显示账号@主机:端口。

## 对象存储

启用 data-compute 后，页面出现“对象存储”。逐行添加名称、端点、桶，再填写 Token。索引只含随机稳定 id/label/endpoint/bucket；值写入 `WORKBENCH_STORAGE_<ID>`。桶名可以含点、斜杠、非 ASCII；不编码进 ref。

`workbenchStorage.resolve(endpoint,bucket)` 先精确匹配，再尝试同端点显式 `bucket: '*'`；已有精确行但缺值时直接报错，不能兜底。端点和桶都不匹配时点名目标。删除行会保留独立的待清理凭据，页面可单独清除；运行时不再使用孤儿。索引修改使用宿主 configEditor，凭据使用宿主 credentials；重启后可恢复。

当前未接入内网算力业务，不能统计真实“纯存储会话”比例。内网接入后应从业务工具调用记录统计，再决定是否拆分独立 storage preset；不要把页面保存 Token 次数当成业务使用次数。
