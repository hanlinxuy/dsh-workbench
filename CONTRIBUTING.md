# 贡献与验收

在开发分支和独立 DSH_HOME/profile 工作，不重启或修改用户现有宿主，不复制凭据目录链接。
遵循 [plugin-harness](dev/plugin-harness/SKILL.md)、[错题集](docs/engineering/mistakes.md) 与 [工程规范](docs/engineering/conventions.md)。

- L0：逻辑/参数/失败分类单测，不能证明宿主能挂载。
- L1：目标版本真宿主的真实模型回合；使用原生 sessionController.events 导出 NDJSON，断言 tool/call、对应 tool/result、turn/end。
- L1b：独立 GUI 的截图与点击回读；人工检查，不能以模型文字代替。
- L2：用户授权的正式安装；独立验收不会自动执行此步骤。

```sh
# 在测试机、已构建并固定提交的工作树运行
DSH_HOME=/absolute/owned-test-home \
DSH_TOOLS_MODULE=/absolute/target-host/dsh-tools/lib/index.js \
node scripts/preflight.mjs --plugin plugins/browser \
  --evidence /absolute/private/model-events.ndjson \
  --tool workbench_browser --contains 'version'
```

命令运行全量单测、包结构/exports 守卫、生成产物一致性、目标原生 SDK 注册和 L1 证据断言。
缺 NDJSON 或调用/结果不对应即失败；只想跑逻辑检查时显式 `--l0-only`，输出 L0-PASS，不能据此交付。
`--gui --gui-evidence <人工检查报告或截图路径>` 记录 L1b 产物；脚本不会假称自动看懂截图。
运行日志与 report.json 保存在独立 DSH_HOME/workbench-preflight；不提交私密模型轨迹。

UI 包保留 ./client；有 icon 资源/原有 ./icon 契约的包也必须保留 ./icon。
纯后台插件不需要虚构前端/图标导出。rows/x.js 不得与 rows/x/ 并存。
常驻工具描述（包括参数描述）单条不超过 1300 字符，合计不超过 8200；按风险拆工具、按能力域拆 loader 行。

当前验证宿主为 DSH Desktop 0.2.2-rc.1（Electron Node 24.21.0）：使用 connection、sessionController、tools、subprocess、credentials、configEditor、spillStore。
`desktop-probe` 是隔离测试专用、带随机令牌的临时桥，不是产品插件；禁止安装到正式 profile。
宿主没有承诺稳定的 `--json` CLI；这里依赖当前版本公开服务事件，并在升级时重跑原生注册与模型证据测试。
