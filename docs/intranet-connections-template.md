# 内网连接设置模板

入口：插件 → Workbench / Workbench Core → 内网连接。企业账号与模型、Git 平台分成两张卡片，编辑后保存；密码与 Token 不回显，空白保留旧值。保存和测试独立，保存成功不代表验证通过。

## 数据与边界

模板只负责 UI、本地保存和适配器调用。当前宿主 profile 下 `.workbench-private/connections.json` 保存工号、密码、MaaS Token 与平台 Token；POSIX 目录 0700、文件 0600。这是私有明文文件，不是系统钥匙串；Windows 部署应由内网凭据存储替换或落实当前用户 ACL。不要把该目录纳入 Git、普通配置导出或日志。页面只收到“已保存”布尔值，秘密只交给宿主侧适配器。Git 平台移除在点击保存后生效。

无适配器时允许保存，测试和模型按钮禁用；不会发送任何外部请求。MaaS/SSO/代理/Git 认证协议由内网实现，模板不猜 URL 或认证头，不自动变更用户模型选择。

## 内网适配器

在 Workbench settings 加载前，由内网插件注册 Cordis 服务 `workbenchIntranet`：

```js
const adapter = {
  name: '企业 MaaS',
  demo: false,
  async test(credentials) {
    // credentials = {employeeId, password, maasToken,
    //   git: [{id, label, url, token}]}
    // 用现有内部协议验证，禁止打印 credentials。
    return {connected: true} // 只能在实际验证通过后返回 true
  },
  async models(credentials) {
    // 1. 用 MaaS Token + 工号发现可用模型。
    // 2. 把上游端点与鉴权保留在宿主侧。
    // 3. 使用现有内网代理，绑定 DSH provider 与模型。
    // 4. 返回供 UI 展示的 ID 和名称。
    return [{id: 'model-id', name: '模型名称'}]
  },
}
ctx.provide('workbenchIntranet', adapter)
```

`test` 应涵盖页面声明支持的连接；多平台的逐项诊断可由内网 agent 扩展返回协议。适配器拒绝时模板只显示通用失败信息，不回传可能包含 Token 的上游异常。

## MaaS 与 DSH HTTPS Host

沿用现有内网方案：浏览器 → 当前 DSH 已认证设置接口 → 内网适配器 → MaaS；模型调用由 DSH provider → 当前宿主的模型代理路由 → MaaS 返回的上游端点。

代理应在 DSH 已有 HTTPS Host 上注册命名空间路由，复用其鉴权和生命周期；不再起一个对外 HTTP 服务，不关闭 TLS 校验。通过所部署 DSH 的实际 provider/connection API 接入；此模板不假定内部 MaaS API、证书或路由路径。浏览器只显示模型名，不获得上游密钥。刷新列表后的 provider 注册是否需要重载，由内网适配器按宿主版本实现。

## 隔离演示

仅在独立 profile 的 patch 中设置：

```yaml
- id: workbench-settings
  config:
    intranetDemo: true
```

页面显示“演示模式，不连接内网”。测试返回演示结果，刷新得到两个示例模型；不会注册真实 provider、建立代理或验证真实账号。使用虚构工号与凭据。正式环境默认不开启该模式。

## 内网交接验收

- 接入真实凭据存储；保存后重新打开和重启仍识别已配置，响应与日志均无明文秘密。
- 实测账号/Token 失效、无模型权限、MaaS 超时与代理流式输出取消。
- 一个模型在 DSH 中真实调用成功，核对实际模型路由；列表刷新成功不能替代此项。
- Git 连接保持既有外网只读/issue/comment 策略，配置 Token 不等于授权 push。
