# ChatGPT + Chief 隔离验收（2026-11-07）

范围：本机独立 DSH_HOME / Web profile，未连接 IM，未修改已有 Desktop 或其他 profile。
ChatGPT provider 0.1.18（`8eed501602fc3b6f8f5a0714556aa1703bbd91ee`），
Chief 0.3.2（`3c28fb1b5bac7a1e69cb8afc25bacf78dabcf7fa`），DSH 0.2.1-rc.5。

## 已验证

- 两个插件均经 `dsh plugin add` / pnpm Git 固定提交安装；Chief 使用 `&path:/plugins/chief`。
- 官方独立授权成功，模型目录返回 8 个可用模型；使用账号实际返回的模型进行真实请求。
- Chief 调用 `chief_project list/register/dispatch/read/audit/review` 成功。
- 两个公开源码项目（本仓库和上游 provider）并行只读 README，子会话分别返回用途及真实标题，Chief 回收报告并持久化 accepted 验收。
- 自然语言切换 Workbench、项目会话直接回复接手标记、`/home` 返回并清空草稿、`/resume Workbench` 交回均成功。
- Workbench 的控制权变化不影响另一个项目；首次重启后两份结果及控制权仍保留；凭据文件权限 0600。
- 使用正确 Chief 专属 preset 后，再次重启保持同一 Chief ID，未再次迁移会话。
- 上游 Node 24 测试 260/260；本仓库测试 27/27，客户端构建一致性检查通过。

## 发现的问题与限制

1. **首次入口/preset 问题**：首次测试会话显示 Standard mode，而非 Chief 管家。
   当时 Chief 工具可用，但重启初始化将它迁移为新 Chief，浏览器仍显示旧会话；旧会话失去管理工具。
   从左侧重新点击 Chief 管家后恢复。正确 preset 下第二次重启未重复迁移。
   尚未定位首次 preset 被替换的精确时序，不能声称该界面问题已修复。
   首次发消息前确认顶部显示 **Chief 管家**；若为 Standard mode，重新点击入口并等待加载完成。
2. Chief 的 `read` 读取派发任务报告，不是任意最新对话历史。询问人工接手后的标记时，
   专属 Chief 正确说明无法通过现有工具核实最新对话，没有伪称读过。当前不承诺完整人机对话同步。
3. Node 26.5.1 的代理测试 254/260，6 项因 Undici ProxyAgent 回调兼容失败；使用 Node 24。
4. 此轮直接接手发生在自然语言切换之后，未把它冒充“无切换直接打开项目时的自动检测”独立验收。
5. 未验证 Windows、Desktop、新账号所有模型、自动 token 刷新、额度耗尽、长任务中断恢复。
6. 本次是功能验证及定向源码审阅，不是完整安全审计；ID token 签名校验限制见安装指南。

结论：provider 可与 Chief 做真实工具调用、任务分发及回收；保留隔离试用，不把本轮作为无条件生产发布门槛。
原有方案保持可用；没有为本次集成修改上游插件或 Chief 源码。
