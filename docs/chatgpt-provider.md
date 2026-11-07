# ChatGPT provider：安装与 Chief 配合使用

本仓库复用 [ckanner/dsh-plugin-chatgpt](https://github.com/ckanner/dsh-plugin-chatgpt)，不另写登录或模型适配器。
`plugins/chatgpt` 为 Git submodule，固定上游 0.1.18 的提交 `8eed501602fc3b6f8f5a0714556aa1703bbd91ee`；
Chief 独立维护，两个插件通过 DSH 的模型提供方接口组合。

## 独立 profile 安装

已验证环境：macOS、DSH 0.2.1-rc.5、Node **24.22.2**、pnpm **11.18.0**。
建议使用 Node 24：本次 Node 26.5.1 + Undici 6 代理路径的上游测试有 6 项失败
（`UND_ERR_INVALID_ARG` / invalid `onError`）；Node 24 下 260 项全部通过。

```sh
export DSH_HOME="$HOME/.local/state/dsh-chatgpt-demo"
mkdir -p "$DSH_HOME/profiles/web"
cat > "$DSH_HOME/profiles/web/pnpm-workspace.yaml" <<'YAML'
packages:
  - .
nodeLinker: hoisted
autoInstallPeers: false
allowBuilds:
  "dsh-plugin-chatgpt@https://codeload.github.com/ckanner/dsh-plugin-chatgpt/tar.gz/8eed501602fc3b6f8f5a0714556aa1703bbd91ee": true
  esbuild: true
YAML

dsh plugin --profile web add 'github:ckanner/dsh-plugin-chatgpt#8eed501602fc3b6f8f5a0714556aa1703bbd91ee'
dsh plugin --profile web add 'github:hanlinxuy/dsh-workbench#0ffb7a5&path:/plugins/chief'
# 如需代理，填本机实际监听的 HTTP 代理地址；不需要则省略。
# export DSH_CHATGPT_PROXY_URL=http://127.0.0.1:PORT
dsh --profile web --host 127.0.0.1 --port 19452 --no-open
```

先确认该端口空闲；整个安装和启动过程应使用同一 `DSH_HOME`。
`dsh plugin add` 内部使用 pnpm，并登记 DSH bundle；只运行裸 `pnpm add` 不会自动完成 bundle 配置。
pnpm 11 对 Git prepare 有构建授权限制，上面仅允许已审阅的固定来源和 esbuild。
不要用关闭所有构建限制的方式解决安装失败。升级提交时需重新审阅并更新 allowlist。

打开宿主打印的完整登录 URL。在 **Settings → Models → ChatGPT → Sign in with ChatGPT**
完成官方登录和授权，然后在模型选择器选择账号实际提供的模型。点击左侧 **Chief 管家**开始管理项目。
Chief 0.3.3 已修复首次点击入口时的 preset 校正与重启换会话问题；见 [修复回归](chief-preset-acceptance.md)。
项目子会话需要可用模型；本次 Chief 派发沿用了当前 ChatGPT 模型。

本地登录 URL、OAuth 回调 URL、token 文件均不得提交到 Git 或发到公开日志。
默认私有凭据目录是 `$DSH_HOME/chatgpt-subscription`，与 Chief 状态分离。
不需要读取现有 Codex 或其他 DSH profile 的凭据。

## 源码与边界

- 使用官方授权入口、PKCE、state、nonce 和持久化 host ID；请求 `chatgpt.tokens.use.direct` 范围。
- provider 路由为 `chatgpt`，通过 Models / Responses API 适配 DSH；请求使用 `store:false`、`stream:true`。
- token 文件以 0600 保存，目录 0700；UI 仅返回登录状态，代理使用插件自己的 dispatcher。
- 审阅发现 ID token 校验包括 issuer、audience、nonce、expiry，但**没有本地 JWKS 签名校验**。
  当前依赖 TLS 下的 PKCE token exchange；这是一项审阅限制，不把本次检查描述成完整安全审计。
- 保留官方默认服务地址；不把 token 转发到未知网关。账号模型和额度由服务端决定，不承诺无限使用。

官方机制：[Sign in with ChatGPT](https://developers.openai.com/siwc/token-sharing-open-source)、
[Models and inference](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference)。

## 验收与回滚

安装后先验证登录、模型目录和一次工具调用，再给 Chief 登记两个不含秘密的项目，派发只读 README 任务。
检查子会话真实工具记录、结果回收以及 Chief 汇总，不以一句“已完成”代替证据。
然后验证自然语言切换、人工接手、`/home`、`/resume`，并重启同一隔离 profile 核对状态。

本轮具体结果见 [验收记录](chatgpt-acceptance.md)。自动刷新、额度耗尽、长时间断线等路径需另做专项测试。

回滚时停止这个独立宿主即可；原 profile 不需修改。需要删除测试状态时先保留必要证据，
通过 Settings 的 Sign out 清除该安装的本地登录，再自行归档或删除测试目录。

## submodule 开发

```sh
git submodule update --init plugins/chatgpt
```

根 pnpm workspace 排除 `plugins/chatgpt`，避免改写上游依赖。审阅或测试上游时进入该目录单独安装，
遵循上游构建命令和许可证。更新 submodule 必须固定新提交并重新验收，不自动追踪浮动 HEAD。
