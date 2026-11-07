# ChatGPT 套餐与 Codex 接入评估

状态：设计评估，未实现登录或模型调用插件，未验证用户账号额度。核对日期：2026-11-07。

## 能否接入

可以设计为独立 DSH 模型提供方插件，保留 DSH 的会话、工具循环和 Chief 控制权。
当前检查的 DSH 提供 `@deepseek-ai/dsh-llm-pi-ai`，其文档说明支持 provider 路由、
受支持 provider 的 OAuth 登录及凭据刷新。应先核对目标版本已安装 provider 的功能，
避免仅为了一个已有 provider 再写一套适配。
本机安装的 pi-ai 文档已列出 OpenAI Codex（legacy）OAuth provider；这只证明有实现入口，
不代表已验证它的当前授权、账号可用性或与新官方授权流程的兼容性。

这不意味着任意 ChatGPT 登录 token 都能当作 API key 使用。
OpenAI 当前公开了 **Sign in with ChatGPT / ChatGPT plan usage**：开源、本地应用可以
请求用户授权，为符合条件的 Responses 请求使用其 ChatGPT 套餐。
实际支持的模型、额度和授权由账号/工作区决定，不保证特定模型或无限使用。

官方依据：[Overview](https://developers.openai.com/siwc/token-sharing-open-source)、
[Registration and sign-in](https://developers.openai.com/siwc/token-sharing-open-source/sign-in)、
[Models and inference](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference)。

## 推荐方向：DSH provider

- 登录与模型协议独立成插件，不耦合到 Chief。
- 走官方授权流程，持久化每台安装的 host ID，处理 PKCE、state、nonce、授权范围和刷新。
- 凭据放宿主私有 credential store，模型配置只存引用。
- 查询已授权账号的模型目录，再发 Responses 请求；此授权流程要求 `store:false`、`stream:true`。
- 流式完成、工具调用、取消、额度耗尽和失败均转换为 DSH 对应事件。
- 不把套餐额度耗尽静默切换成付费 API key；用户应明确选择计费路径。

这里是工程建议，不是已实现或已验证的插件。

## 另一种方案：Codex 执行后端

通过 `codex app-server` 驱动 Codex 的 thread/turn/approval/event，适合要复用 Codex 完整执行能力的场景。
它需要维护 DSH 与 Codex 两套会话映射和审批流程，不能当作无状态 LLM API 简单替换。
对于“DSH 原界面 + DSH 工具 + Chief 管理项目”的目标，优先评估 provider 方式。

官方 [App Server](https://learn.chatgpt.com/docs/app-server) 支持深度客户端集成，
并建议本地/开源应用向 Sign in with ChatGPT 迁移。商用或远程托管场景需要另行核对其接入要求。
