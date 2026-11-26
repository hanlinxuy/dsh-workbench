# 本地模型网关

可选插件，默认关闭，不注册任何模型工具。复用 Workbench「设置 → 内网连接」：保存企业账号、MaaS Token、自定义请求头，测试连接、刷新模型、手动测试一次模型请求。

- Node 24 原生 HTTP/Fetch，无第三方运行依赖。只监听固定 `127.0.0.1` 端口；冲突直接报错。
- `/v1/models` 聚合发现（五分钟缓存，失败回退）；`/<backend>/v1/chat/completions` 允许新模型名称透传。聚合 `/v1/chat/completions` 对未知或歧义模型返回 400，提示选择后端路由。
- SSO token 仅内存缓存，登录单飞，401 最多重登/重试一次；429 不重放完成请求，后续请求遵守 Retry-After。按账号限速；共享账号的后端用相同 `accountKey`，其 requestsPerMinute 必须一致。
- SSE 按块透传；客户端断开中止上游。上游超时若发生在发送响应头之前，返回 HTTP 504。流已开始时中断该流，客户端可重新发起请求。没有关闭 TLS 验证选项。

## 安装与配置

随 Workbench 0.2.7 套装安装，默认关闭。独立安装可用发布分支 `git+https://github.com/hanlinxuy/dsh-workbench.git#release/provider-gateway`。

在插件配置中填入可信的后端地址与引用，然后启用；勿将密码或 token 放进配置：

```yaml
host: 127.0.0.1
port: 8790
gatewayTokenRef: WORKBENCH_GATEWAY_TOKEN
limits:
  interactiveReserve: 0.3
  queueTimeoutMs: 30000
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

在 DSH 原生模型设置创建一个 OpenAI Completions provider，baseURL 设为 `http://127.0.0.1:8790/primary/v1`。`providerEntryId` 是 pi-ai 配置条目的实际 ID（不要假设各 profile 一样）。确认模型同步后通过宿主 `configEditor.edit` 同步指定 provider 的 models，保留已有 baseURL、名称和其他 provider；写前备份，写后回读。没有配置同步目标时只显示发现结果。不要手工正则重写 YAML。宿主可能规范化目标配置文档格式，因此保证其他 provider **配置值**不变，不承诺其 YAML 字节格式不变。

必填 `gatewayTokenRef` 要求请求携带 `x-gateway-token`（或 `Authorization: Bearer`）；DSH provider 可把 apiKeyEnv 指向同一引用。登录成功不等于模型调用成功；“测试连接”只检查 models 接口，“发送测试请求”才发一次真实完成请求，不从一次探测推断上下文/多模态上限。

## 共享池适配

可注入 `workbenchGatewayPool`，实现 `borrow(backend,model,signal)` 与 `list()`。borrow 返回 `{headers,key_source}`，由内网节点保管并组合 token 与 tenant key；未配置时不出借/借用任何凭据。借用返回 401 后回退本机凭据。`GET /pool` 仅返回 account/team/key_source/left_s/models/state 和缺 tenant key 的 warning，绝不返回 header/token/key。v1 不实现多人账号管理、凭据发布接口或中心化 vault 服务。

## 验证边界

运行 `node --test plugins/provider-gateway/*.test.js`。测试使用注入的 fetch/login/clock/credential source；监听生命周期和流式断连另用回环服务器验证。Windows 行为由 CI 验证，不等同于公司 Windows 实机与 SSO 服务验收。

## 排队与共享池

请求头 `x-workbench-source` 可指定 `interactive`（默认）或 `background`。同一账号合并限速；后台最多使用 `1 - interactiveReserve` 的额度。前台优先，每两次前台后让已到期的后台请求推进；同档保持 FIFO。取消立即移出队列，超时返回 `queue_timeout`。429 的 Retry-After 对整个账号队列生效，不重放原请求。受令牌保护的 `GET /metrics` 返回各档排队数、最久等待、平均等待、取消/超时和累计发送数，不含请求正文。

可复用 `dsh-workbench-provider-gateway/pool` 导出的 `createMemoryPool` 作为内网适配器的参考实现。默认禁用，只有操作员设置 `setLending(true)` 后才能 `publish`。每条明确给出 token、可选 tenantKey、账号/团队/后端/模型和 ttlSeconds（默认上限 1200 秒，应小于身份 token 剩余寿命）。`setLending(false)` 立即清空；`close()` 或进程重启也清空；不会持久化或自动续期。节点可以提供 teamKey，必须对借方显示团队计费 warning。`key_source=none` 不尝试用不完整凭据调用上游，而回落本机并给响应添加 warning。用户发布/续期界面由内网池适配器提供，Workbench 不自行发布账号。

本地令牌必须存入 DSH 原生凭据库；没有有效引用则监听器拒绝启动。所有网关 HTTP 路由都鉴权，包括 pool/metrics；轮换原生凭据后立即生效，调用方更新自己的引用，不需要重启网关。设置页继续走宿主会话，不新增明文凭据读取端点。

## 两层探测

设置页“可达性测试”最多读取一次模型列表、发一次最小文本推理，缓存两分钟。
发现源标 live/declared；没有实际文本就不标文本能力已验证，所有未测模态与上下文上限保持 unknown。
“能力探测”必须先预览成本，再确认发送；最多三次请求（短输入、声明上限、约 75% 回退），可取消并保留部分记录，429 停止余下请求。
每请求最多 120 秒，按后台队列计算；已测结果缓存 24 小时。不会自动修改 provider 配置。

默认构造器只能估计 token 数；使用上游 usage.prompt_tokens 记录实测接收量，不把估计当真实上限。
内网如有精确 tokenizer，可提供 workbenchGatewayProbe.buildPrompt(size,marker)，返回 messages、expectedPromptTokens、verificationText；没有精确计数时 capped 保持 unknown。
收到 413 会记录明确 capped；后续较小输入成功不会抹掉已确认的上限拒绝。

## 适配器契约（本轮固定）

在网关加载前，由内网插件 `ctx.provide`；适配器自己的配置/UI 是站点协议，通用凭据和模型配置仍走 Workbench。

| 服务 | 入参 | 返回 | 失败与取消 |
| --- | --- | --- | --- |
| `workbenchGatewayLogin` 函数 | `{backend, auth, credentials, signal}`；credentials.get(ref) 返回字符串或 undefined | `{token: 非空字符串, ttlMs: 正数毫秒}`，省略 TTL 使用配置或 10 分钟 | 缺凭据/拒绝/格式错误抛不含秘密的 Error；必须把 signal 传给 I/O。共享登录限时 30 秒，网关关闭即取消；单个请求取消不取消其他请求共享的登录 |
| `workbenchGatewayPool.borrow` | `(backend, model, signal)` | 无匹配返回 undefined；可用返回 `{headers, key_source:'push'|'team'}`；缺凭据返回 `{key_source:'none',error:'missing-dual-credentials'}` | 异常终止本次请求，不自动重复借用；收到上游 401 后仅回退本机凭据。signal 使用本次请求超时/调用方取消/网关关闭的组合 |
| `workbenchGatewayPool.list` | 无 | 数组，仅 account/team/models/key_source/left_s/state/warning/uses 元数据 | 不返回 headers/token/key；可返回 Promise。适配器自身应给远端元数据读取设置超时，推荐读取内存快照 |

`headers` 仅在进程内传给上游，不写配置、日志或 `/pool`。`push` 表示本条借用同时有 token 与 tenant key，`team` 表示采用节点团队 key（会有提示），`none` 不发借用请求。授权借用范围、账号选择和凭据 TTL 由内网适配器负责；Workbench 不提供匿名池发布接口。适配器必须尊重 AbortSignal，不能无限等待或在取消后继续外发。未经适配器支持的协议不能靠改字段名宣称接入成功。

可直接运行的两个参考实现位于 `adapter-examples.js`，并有本地 HTTP 实测：

```js
import {createJSONLogin,createCredentialPool} from 'dsh-workbench-provider-gateway/adapter-examples'
export const inject=['credentials']
export function apply(ctx,config){
  const credentials={get:async ref=>(await ctx.credentials.resolve(ref))?.value}
  ctx.provide('workbenchGatewayLogin',createJSONLogin({
    url:config.loginURL,accountRef:'EMPLOYEE_ID',passwordRef:'EMPLOYEE_PASSWORD',
  }))
  ctx.provide('workbenchGatewayPool',createCredentialPool({credentials,entries:[{
    backend:'maas',account:'employee',team:'team',models:['your-model'],
    tokenRef:'MAAS_TOKEN',tenantKeyRef:'MAAS_TENANT_KEY',
  }]}))
}
```

SSO 例子的协议固定为 POST `{username,password}` → `{access_token}`，内网按真实协议替换；双凭据例子每次从本机凭据引用读取，不缓存或发布秘密。运行 `node --test plugins/provider-gateway/adapter-examples.test.js` 验证成功、拒绝、取消、轮换、缺字段及元数据不含秘密。
