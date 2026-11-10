# 本地模型网关

可选插件，默认关闭，不注册任何模型工具。复用 Workbench「设置 → 内网连接」：保存企业账号、MaaS Token、自定义请求头，测试连接、刷新模型、手动测试一次模型请求。

- Node 24 原生 HTTP/Fetch，无第三方运行依赖。只监听固定 `127.0.0.1` 端口；冲突直接报错。
- `/v1/models` 聚合发现（五分钟缓存，失败回退）；`/<backend>/v1/chat/completions` 允许新模型名称透传。聚合 `/v1/chat/completions` 对未知或歧义模型返回 400，提示选择后端路由。
- SSO token 仅内存缓存，登录单飞，401 最多重登/重试一次；429 不重放完成请求，后续请求遵守 Retry-After。每后端有发送队列和限速。
- SSE 按块透传；客户端断开中止上游。没有关闭 TLS 验证选项。

## 安装与配置

随 Workbench 0.2.7 套装安装，默认关闭。独立安装可用发布分支 `git+https://github.com/hanlinxuy/dsh-workbench.git#release/provider-gateway`。

在插件配置中填入可信的后端地址与引用，然后启用；勿将密码或 token 放进配置：

```yaml
host: 127.0.0.1
port: 8790
providerEntryId: llm-pi-ai
providerRoute: intranet
providerBackend: primary
backends:
  primary:
    baseURL: https://models.example.internal/v1
    requestsPerMinute: 40
    fallbackModels: [model-a]
    auth:
      kind: sso
      loginURL: https://login.example.internal/token
      accountRef: WORKBENCH_ACCOUNT
      passwordRef: WORKBENCH_PASSWORD
      accountField: username
      passwordField: password
      tokenPath: access_token
      tokenTTLMs: 600000
```

SSO 示例仅支持显式配置的 JSON 登录协议；公司协议不同，由内网插件提供 `workbenchGatewayLogin({backend, auth, credentials, signal}) -> {token,ttlMs}`，不猜测接口。`static` 使用 `headersFromRefs: {authorization: 'Bearer {{WORKBENCH_MAAS_TOKEN}}'}`；`none` 不加鉴权头。

三个 WORKBENCH 引用读取本机“内网连接”，其他引用使用 DSH 原生 `credentials.resolve`。凭据来源可替换，运行时不读取任意环境变量。自定义头使用 UUID 索引逐项保存，避免 `x_a` 与 `x-a` 同名映射；秘密值默认掩码，空白保留，删除条目即移除。缺失值跳过并显示“待清理”。合并顺序是固定头 → 自定义头 → 自动鉴权；勾选“覆盖自动鉴权”会红色提示并停止自动登录。

在 DSH 原生模型设置创建一个 OpenAI Completions provider，baseURL 设为 `http://127.0.0.1:8790/primary/v1`。`providerEntryId` 是 pi-ai 配置条目的实际 ID（不要假设各 profile 一样）。刷新模型通过宿主 `configEditor.edit` 同步指定 provider 的 models，保留已有 baseURL、名称和其他 provider；写前备份，写后回读。没有配置同步目标时只显示发现结果。不要手工正则重写 YAML。宿主可能规范化目标配置文档格式，因此保证其他 provider **配置值**不变，不承诺其 YAML 字节格式不变。

可选 `gatewayTokenRef` 要求请求携带 `x-gateway-token`（或 `Authorization: Bearer`）；DSH provider 可把 apiKeyEnv 指向同一引用。登录成功不等于模型调用成功；“测试连接”只检查 models 接口，“发送测试请求”才发一次真实完成请求，不从一次探测推断上下文/多模态上限。

## 共享池适配

可注入 `workbenchGatewayPool`，实现 `borrow(backend,model,signal)` 与 `list()`。borrow 返回 `{headers,key_source}`，由内网节点保管并组合 token 与 tenant key；未配置时不出借/借用任何凭据。借用返回 401 后回退本机凭据。`GET /pool` 仅返回 account/team/key_source/left_s/models/state 和缺 tenant key 的 warning，绝不返回 header/token/key。v1 不实现多人账号管理、凭据发布接口或中心化 vault 服务。

## 验证边界

运行 `node --test plugins/provider-gateway/*.test.js`。测试使用注入的 fetch/login/clock/credential source；监听生命周期和流式断连另用回环服务器验证。Windows 行为由 CI 验证，不等同于公司 Windows 实机与 SSO 服务验收。
