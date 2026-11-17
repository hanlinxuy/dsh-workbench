# 能力归属与当前 profile 工具预算

设置 → Workbench 环境显示已声明的提供者、重复/缺失项、实际加载的工具描述总字符数和未声明工具。选定提供者后保存原生配置，重启当前 profile 核对结果；不自动重启 Desktop。

`workbench-settings` 配置示例：

```yaml
capabilities:
  owners:
    browser: {providedBy: workbench-browser}
    desktop: {providedBy: workbench-desktop}
    git: {providedBy: workbench-git}
    credentials: {providedBy: workbench-settings}
    storage: {providedBy: workbench-settings}
    model-connections: {providedBy: workbench-settings}
  budget: 16000
  mode: warn
```

总预算统计宿主 `tools.definitions(scope, toolSet)`，包括第三方工具；设置页展示全局视图，每次构建模型提示时检查当前 agent 的实际视图。`warn` 在面板报警，`block` 在超预算时阻止构建该次模型提示；不悄悄删掉任务需要的工具。单条 1300 字符与静态合计 8200 的仓库检查继续保留，与实际 profile 预算不是同一口径。

内网插件通过同一服务声明能力，并把同一判据用于工具 admission、执行和 UI：

```js
export const inject=['workbenchCapabilities','tools']
export function apply(ctx){
  const registry=ctx.workbenchCapabilities
  ctx.effect(()=>registry.register({
    domain:'browser',plugin:'intranet-browser',label:'内网浏览器',tools:['intranet_browser'],
  }),'capability declaration')
  ctx.tools.register(definition,{when:()=>registry.allows('browser','intranet-browser')})
  // definition.execute 内调用 registry.assert('browser','intranet-browser')。
  // UI 从经过宿主鉴权的后端取得 allows/selected provider，未选中时隐藏操作入口。
}
```

Workbench Browser/Desktop/Git 已参与该机制；凭据、存储与模型连接的 HTTP 操作也在后台检查归属。配置可以先指定未加载的提供者，此时旧提供者停用并明确显示缺失，不静默切回旧实现。

该声明是合作协议，不能控制完全不参与协议的第三方插件。它们仍计入真实工具预算、列为“未声明归属”，应通过 DSH 原生插件管理停用。不要把未声明误报为已自动屏蔽，也不要按模糊工具名猜归属。

重复工具迁移顺序：先给唯一保留的适配器声明 domain/plugin/tools，选择 providedBy，重启核对模型工具和设置入口，再停用旧插件。业务协议仍属于内网适配器；Workbench 不接管其凭据内容或猜测公司接口。

设置页还展示最近模型步骤与本次启动峰值，避免只看全局工具而漏掉 preset 扩展导致的超限。设置页的全局总量是“已注册”工具清单（还未进入特定模型步骤，可能包含条件式工具）；真正的 `block` 闸门在提示构建时使用该步骤的 admitted toolSet。外部测试或脚本调用带 `when` 的工具，也必须先调用宿主 `tools.resolve({agent,modelSelection:agent.model.current(),signal})`，把返回的 toolSet 传给 execute，最后 dispose；不应绕过 admission 直接取 execute 函数。
