# Workbench 大输出

完整套装/Core 的环境行提供 workbenchOutput，复用目标 DSH 的原生 spillStore.saveText。
Git、Browser、Desktop、可选 Knowledge/Vision 的字符串输出在进入会话前先按凭据字段脱敏；超过 32 KiB 后保存全文，返回头尾摘要、字节/行数与 spill: 句柄。
原生 host 其他工具继续由 DSH 自己的 spill-policy 管理；本机制不替换宿主服务，也不改写其他工具的类型值。
独立插件没有安装 Workbench 环境行时继续使用宿主原生输出策略。

`workbench_output(handle, offset?, limit?)` 只读已存内容，offset 为字符偏移，nextOffset=null 表示读完；默认 limit=200，最多 2000，另受响应字节预算约束。长单行 JSON 也能分段取全。句柄绑定当前会话，重启可继续读；原生存储已清理时明确 spill_expired，不能重跑有副作用的动作取代回读。

环境行可配置：

```yaml
spill:
  maxInlineBytes: 32768
  headLines: 40
  tailLines: 40
  retentionDays: 30
  totalBudgetMiB: 256
```

原文先遮盖 token/password/API key、Authorization/Cookie、私钥段、URL 内用户名口令，再交给原生存储。
这属于已知格式脱敏，不宣称能识别任意无标签的秘密。模型不能通过工具读取凭据服务的原值。
索引在 profile 私有目录；原生文件名带日期；同会话相同脱敏内容按哈希复用。仅清理索引中本机制拥有的文件，不扫描别的 profile。
超保留期/总容量按最旧清理，日志记录数量与释放字节；超过整个预算的单条输出明确报错，不能无限保存。
底层进程有 2 MiB 的采集上限；达到上限会明确失败，不声称已有可读全文。溢出服务能保留的是实际完整采集的输出。
