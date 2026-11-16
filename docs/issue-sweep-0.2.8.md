# Workbench 0.2.8：机制索引与验收

本版覆盖 #14–#41 的通用插件机制。源码与最终 preflight 固定在 `16f7bad`；运行包与 `c694d0b` 的生成产物逐字节一致，后续提交只修正验收事件关联并补文档。既有 Desktop 不升级，不接 IM，不向真实代码平台发送写请求。

## 运行环境与证据

- 编码在开发工作树；最终安装、构建、测试、真实模型和 GUI 验收在远端 Mac 的独立 DSH_HOME / Electron userData 完成。
- 官方 DSH Desktop **0.2.2-rc.1**，签名校验通过；使用它自带的 Electron Node **24.21.0** 和原生插件安装器。原有 Desktop **0.2.0-rc.2** 保持运行。
- 原生安装正常退出；唯一 tgz 文件名带源码提交。安装后比较组件、设置脚本与 provenance，不以安装提示代替内容验证。
- 完整 preflight：**144 tests / 143 passed / 1 skipped / 0 failed**；跳过的是 macOS 无法运行的 Windows 二进制专项。结构守卫、生成产物、实际宿主 SDK schema、真实模型 NDJSON 关联、人工 GUI 核对均通过。
- [固定提交 CI](https://github.com/hanlinxuy/dsh-workbench/actions/runs/43809307597)：完整测试与生成检查、macOS/Windows/Linux 回归、Windows 实际执行固定 PowerShell **7.6.6** 全绿。受限企业 Windows 的完整 Desktop GUI 尚未验证。
- 真实模型：Chief 在两个真实项目注册、并行派发、读取完整报告、audit、review accepted，并持久化阻碍/下一步。任务提交相隔 18ms，执行约 8.9s / 14.8s，存在重叠区间。
- 人工接手 Bot 后，MLX 单独完成 Browser / Desktop 调用，Bot 没有被追加任务；`/resume` 后 Chief 再派 Git status 成功。GUI 自然语言切换项目、`/home` 返回并清空草稿、`/resume` 交回均实际操作。
- 正常重启后 Chief ID、项目 session ID、控制权、结果和记忆保留。真实模型回合确认 `workbench_git`、`workbench_git_write`、`workbench_knowledge`、`workbench_output` 调用与结果；外网 Push 返回 **Push is disabled for this remote**，没有真实 Push。
- 私有原始 NDJSON、完整报告、截图保存在验收目录，不进公开仓库。测试桥只装在带 marker、回环令牌鉴权的独立 profile，不随发布包分发。

## Issue → 实现 → 验收

| Issue | 已交付机制 | 主要证据与入口 |
| --- | --- | --- |
| #14 | PowerShell 显式路径优先、宿主实际解析、无 WinGet 指引、损坏路径不静默回退 | `bundles/settings/powershell.js`；`bundles/test/powershell.test.js` |
| #15 | 固定可选 Windows x64 PowerShell 包；设置中接入原生 pwshPath | Windows CI 实际 7.6.6；[原生基础设施](native-infrastructure.md) |
| #16 | catalog 数据驱动多服务/实例、原生凭据、ref 白名单、分类错误、单项限时查看 | `catalog.test.js`；实际 UI 保存/单项查看/20 秒隐藏，重启状态保留 |
| #17 | L2 默认预览、原生逐次审批、持久写日志、未知结果不重放 | Git approval / write-journal / MR 测试；确认参数不能扩大操作员权限 |
| #18 | L0/L1/L1b preflight、exports/rows 守卫、原生 SDK 与事件关联 | `scripts/preflight.mjs`；实际 Desktop NDJSON；[开发说明](../CONTRIBUTING.md) |
| #19 | 按风险拆分读/交互/写工具，描述与动作数量预算，可关闭行 | 描述单项 1300 / 总计 8200；16 动作负例；原生禁用与重启验证 |
| #20 | 按站点捕获 Cookie、域/过期过滤、身份绑定恢复、不回传值 | Browser sessions 测试；真实 AB + 隔离浏览器 + 本地 HTTP fixture 的捕获/恢复读回 |
| #21 | site → account 独立路由、缺少账号明确失败、不退回 primary | Browser 路由测试；账号凭据独立 catalog 字段；配置改变重启生效 |
| #22 | 默认不出借的共享池参考适配器、双凭据、TTL、元数据状态、401 本地回落 | pool/runtime 测试；[网关说明](../plugins/provider-gateway/README.md) |
| #23 | user-confirmed / auto-reviewed 真实证据授权，精确 head/target，merge 状态白名单与回读 | merge-authorization / mr 测试；无真实远程合并 |
| #24 | 本文统一索引、依赖与部署边界 | 下方接入说明及逐项链接 |
| #25 | identity/code/model/storage/patent 域，操作员能力集，代理派生/覆盖/noProxy | catalog 测试；[凭据域](credential-domains.md) |
| #26 | (endpoint,bucket) 索引、独立 token、明确缺项、孤儿与清理 | storage 测试；原生保存→重启→移除→清理验证 |
| #27 | 两请求可达性探测、手动成本预览、三请求能力探测、缓存/取消/未知模态 | probes 测试；原生服务与 UI fixture 验证 live、413 capped、image 保持 unverified |
| #28 | 单一站点卡、流程/常量/状态分离、requires 与泄漏/重复审计 | site-cards 测试；[站点约定](site-cards.md) |
| #29 | 前台 human 来源 + 每次原生确认、正文分级、无人值守拒绝、元数据审计 | egress 测试；不做真实外发；外部 Vision 同样必须通过闸门 |
| #30 | 设置沿用宿主会话鉴权，网关所有 HTTP 路由强制令牌、可轮换 | 无宿主会话 401；原生网关无/旧令牌 401、新令牌 200；私有文件权限 |
| #31 | 配置内 argv 调原生 subprocess，业务断言优先于 HTTP 200，截图单列人工项 | 原生 site_verify 的 200 + entries.count=1；0 条/500 负例单测 |
| #32 | 错题复发计数、第三次晋升规范、主线 CI 守卫 | [错题集](engineering/mistakes.md)、[规范](engineering/conventions.md) 与自动检查 |
| #33 | 原生 spillStore、结构化/文本脱敏、头尾摘要、会话句柄、完整分页、保留预算 | 原生 1,253,227 bytes → 8,207 bytes 摘要；316 页全文；重复去重与重启回读 |
| #34 | 按账号排队、前台额度、后台上限、全队列 429 退避、取消/超时与指标 | scheduler/runtime 测试，不自动重试生成请求 |
| #35 | 原生 configEditor 定点同步、先预览再确认、备份、竞争检查与回读 | index.test.js 保留其它 provider、默认模型及目标鉴权字段 |
| #36 | Node 内置/系统/显式 PEM 信任合并、严格校验、不提供关闭校验 | 目标 Node 自签 CA 拒绝→显式信任后成功；Git/浏览器信任各自配置 |
| #37 | 固定回环端口、本实例身份、冲突诊断、Chief 单写者租约 | gateway 端口竞争、Chief 同进程/跨进程租约与崩溃恢复测试 |
| #38 | Desktop snapshot 限定 ref、值与 CLI 选项分离、权限/锁屏/截图边界 | Desktop 参数与错误测试、真实模型 AD 1.2.0 版本调用；不宣称桌面沙箱 |
| #39 | 站点真源版本/hash、确定性渲染、产物修改备份、依赖与四类审计 | site-cards 测试；生成技能不复制个人或公司材料 |
| #40 | 可选内网视觉旁路、图片大小/超时护栏、外发审批、文本结果与临时清理 | 原生 PNG→本地模拟后端→文本；元数据与删除验证；非真实模型识别准确率测试 |
| #41 | 可选本地知识完整正文/来源/时间、过期/未命中/损坏回源 | 原生 read/search 与真实模型；未启用时不注册工具 |

## 这一轮实际抓到并修掉的问题

1. 原生工具 schema 的嵌套对象要求未被替身测试覆盖：加入实际 SDK 检查。
2. Electron 启动 AB 子进程丢失 Node 模式：仅在该宿主传递相应环境标志。
3. 非 Git 目录的真实错误被笼统包装：保留 stderr/退出码并脱敏 URL 凭据。
4. JSON 转义换行绕过文本脱敏：先解码字符串、脱敏、重新编码，再交给原生存储；测试口令不会落入新 spill。
5. 验收器假定 result 顶层含 callId：对接 Desktop 实际 `message.toolCallId`，并加入真实事件形状用例。没有降低匹配门槛。

## 接入和能力边界

- 默认套装行为仍由原生插件配置控制。新 Knowledge/Vision/网关须操作员显式配置；不猜内网服务 URL、不自动启用共享额度。
- 凭据 `enabledPresets` 是操作员维护的能力集；不会随聊天中切换 Agent preset 自动授予权限。专利、对象存储业务请求及公司共享池服务由内网适配器实现，本版提供目录/索引/可信服务接口。
- `auto-reviewed` 要由可信宿主适配器提供与 head/target 绑定的审查证据，不能由模型自行填写“审查通过”。
- DSH 0.2.2 的事件导出走实际 sessionController；没有恢复上游 CLI `--json`，也不替上游作跨版本协议承诺。升级宿主须重跑原生 schema/L1。
- 本机凭据状态也要求宿主鉴权；不为“页面自举”增加匿名凭据接口。单 ref 查看只有用户界面入口，不注册模型读凭据工具。
- 大输出仅包裹 Workbench 的字符串结果；其它宿主工具继续由原生 spill-policy 管理。脱敏覆盖已知格式，不能识别任意无标签秘密。
- 源站自检中的截图始终标记人工核对；视觉模拟后端不能证明真实 OCR/图片理解质量。CI Windows 也不能代替公司受限 Windows 的现场验收。
- 卸载随包 PowerShell 前先清除指向该包的宿主 pwshPath；`bundledPwsh:false` 隐藏接入入口，安装时要省下载应排除 optional dependencies。运行时开关不会撤销已经下载的包。

详细部署： [套装](workbench-suite.md)、[安装回滚](installation.md)、[凭据目录](credential-catalog.md)、[内网模板](intranet-connections-template.md)、[大输出](output-retention.md)。
