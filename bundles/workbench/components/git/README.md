# Workbench Git

可选 DSH 插件：通用 Git remote + GitHub/GitLab API。平台实例、仓库和 remote 都由配置增减；
不要求内网只有一台 Git 服务。同一仓库可配置多个 remote，各有独立 fetch/push 权限。

## 安装与配置

需要本机 Git、DSH、Node 24+、pnpm 11+。插件不替换 Git 或凭据管理器。

**Windows 安装提示（issue #4）：** DSH Desktop 0.2.1-rc.5 已报告丢失 Git 安装来源的子目录参数。该环境优先在仓库运行 `pnpm pack:git`，再通过 `dsh plugin --profile <实际-profile> add <输出的-tgz-绝对路径>` 安装；不要假定下面的 Git 子目录安装在该版本可用。完整流程和实际插件加载验收见[安装指南](../../docs/installation.md)。

```sh
dsh plugin --profile web add \
  'github:hanlinxuy/dsh-workbench#main&path:/plugins/git'
export DSH_GIT_CONFIG='/absolute/path/to/private/git-config.json'
```

从 [config.example.json](config.example.json) 创建私有配置，在启动 DSH 的环境中设置路径。
也可在 `workbench-git` 插件配置的 `configFile` 指定文件，或直接配置 platforms/repositories。
启动时加载一次，改完重启相应 profile。工具没有修改配置或增删 remote 的接口。
配置不得放在模型能够随意改写的工作目录；保护文件的办法由内网部署策略决定。

- `platforms.<id>`：平台实例；`kind` 为 github/gitlab/git，`network` 明确为 internal/external。
- `hosts`：允许的主机名（包括 API 主机）；不根据域名后缀自动猜测内外网。
- `apiBase`：完整 API 根地址。GitHub Enterprise 通常带 `/api/v3`，GitLab 带 `/api/v4`。
- `tokenEnv`：凭据环境变量名，不是凭据值；通用 Git 沿用系统 SSH/credential helper。
- `apiWrites`：支持 `issue_create`、`comment_create`、`mr_create`、`mr_comment`、`mr_merge`；省略或空数组为只读，各动作须独立授权。MR 写入仅限 internal GitLab。
- `repositories.<id>.mergeTargetBranches`：MR 合并目标分支的精确白名单，默认 `[]`（禁合并）；例如 `["main", "release/1.x"]`，不支持通配符。
- `repositories.<id>`：固定绝对路径；本地写权限 `localWrite` 默认 false。
- `remotes.<name>`：已有 remote 的精确有效 URL、平台 ID、fetch/push 开关，均默认关闭。
- `platform`/`apiRepo`：该仓库使用哪个 API 平台及 `owner/repo`（GitLab 可有多层 group）。

新增内网 Git 服务，只需增加平台配置和 remote 映射。现阶段 API 适配器是 GitHub/GitLab；
其他服务先使用 `kind: git` 的通用 Git 功能，issue/comment API 需要对应适配器。
删除配置中的平台/仓库/remote 后，下次启动即不可通过此工具访问；不会删除磁盘仓库或 Git remote。

## 权限行为

| 操作 | 条件 |
| --- | --- |
| status/diff/log/branches | 仓库已配置 |
| stage/commit/switch | localWrite=true |
| fetch / remote_head | 对应 remote.fetch=true，URL/主机匹配 |
| push | remote.push=true **且平台为 internal** |
| 平台读取 | 有 API 适配器及仓库映射 |
| 创建 issue/发表评论 | apiWrites 明确包含对应动作 |
| GitLab MR 读取/普通评论读取 | GitLab API 适配器及仓库映射；不要求写权限 |
| 创建 MR / MR 普通评论 | internal GitLab 且 apiWrites 包含 mr_create / mr_comment |
| 合并 MR | internal GitLab、apiWrites 包含 mr_merge、显式 target_branch 在仓库 mergeTargetBranches 内，且读取到的实际 MR 分支匹配 |
| 删库、改权限、上传代码、GitHub PR 创建/合并等 API 写入 | 无此工具入口 |

外网 push 即使误配 true 仍被拒绝。外网 API 仍仅允许显式授权的 issue/comment 写入；所有 MR 写入仅限 internal。没有通用 HTTP 请求工具。
Git 会先检查 get-url 展开后的地址（含 pushInsteadOf/pushurl），与配置不符就拒绝。
HTTP API 和 Git HTTP 不跟随重定向，避免检查一个地址却请求另一个。
插件不自动重试写入；发生超时先核对结果，避免重复发 issue/comment。

这些限制作用于 workbench_git 工具。它不是整机网络防火墙，也无法阻止另一个 shell、浏览器
或用户自写程序发请求。内网部署沿用现有出口策略，给模型最小凭据；Git 仓库配置、SSH 配置和 hooks
属于操作员信任范围。发布 issue/comment 仍须有用户任务授权，配置允许不代表用户已要求发送。

## 使用

先让模型调用 catalog，再使用仓库 ID。示例：

- “查看 workbench 的状态和差异，不修改。”
- “仅暂存 src/main.ts 并提交这次修复；不要推送。”
- “将同名本地分支 推送到 workbench 的 company remote 的 feature/fix 分支。”
- “在 workbench 创建一条 issue，内容是……。”

支持已有仓库、已有分支切换、精确文件暂存和提交、fetch、显式分支 push。
0.1.1 起 log(branch) 真正读取指定本地/跟踪分支；remote_head(remote,branch) 查询服务端分支 SHA。
推送后使用 remote_head 核对实际远端，不能只凭空输出或本地跟踪分支声称成功。
不提供 clone、强推、reset、删除文件/分支、自动合并。diff 当前显示未暂存差异。
API 提供 repo_get、issues_list、issue_get、comments_list、issue_create、comment_create；列表每页 30 条，page 参数翻页。
GitHub issue 评论入口也可用于 PR 的普通讨论评论。GitLab MR 新入口（`number` 是项目内 MR IID，不是全局 ID）：

- `mr_list(repository,page)` → GET `/projects/:id/merge_requests`。
- `mr_get(repository,number)` → GET `/projects/:id/merge_requests/:iid`。
- `mr_comments_list(repository,number,page)` → GET `/projects/:id/merge_requests/:iid/notes`。
- `mr_create(repository,title,body,source_branch,target_branch)` → POST `/projects/:id/merge_requests`；body 映射 description，标题/正文非空，源/目标必须是不同的有效分支。
- `mr_comment(repository,number,body)` → POST `/projects/:id/merge_requests/:iid/notes`；仅普通 notes，不是逐行 review/discussions。
- `mr_merge(repository,number,target_branch)` → 先 GET 实际 MR，检查其 target_branch 精确匹配白名单及调用者目标、opened 状态、IID、head SHA，再 PUT `/projects/:id/merge_requests/:iid/merge` 并携带实际 SHA，拒绝源 head 已改变的合并。

MR 写入默认拒绝。操作员仅在私有配置中为 internal GitLab 增加所需 `apiWrites`；合并还需给指定仓库增加 `mergeTargetBranches`，例如 `["main"]`。工具参数不能修改这些策略；示例配置不默认启用 MR 写权限。自动发现的仓库仍为只读。

**并发边界：** GET 校验与 PUT 不是原子事务；GitLab 的 `sha` 只锁定源 head，不能原子锁定目标分支。目标分支保护及限制 MR 目标修改权限仍须由服务端策略保证；此工具不替代这些策略。遇到超时/网络错误不自动重试；先 `mr_get` 或 `mr_comments_list` 核实实际状态。写入后读取对象验证，合并后用 `mr_get` 确认 merged 状态，不能仅凭请求成功宣称完成。

Chief 维持管理工具限制，将 Git 任务派给项目会话；本插件不会修改 Chief preset 或其他 profile。
测试：`node --test plugins/git/*.test.js`。测试只写临时 Git 仓库及本地模拟 API；MR 测试完全 mock fetch，不发真实远程写请求。

## 代理（API 与 Git 分别生效）

API 使用 Node fetch，单独设置 HTTPS_PROXY 不会在所有 Node 启动方式下自动生效。
启动 DSH 前显式启用 Node 的环境代理支持（本次验证 Node 26.5.1）：

```sh
export NODE_USE_ENV_PROXY=1
export HTTPS_PROXY='http://127.0.0.1:49159'
export HTTP_PROXY="$HTTPS_PROXY"
export https_proxy="$HTTPS_PROXY"
export http_proxy="$HTTP_PROXY"
export NO_PROXY='localhost,127.0.0.1,.example.internal'
export no_proxy="$NO_PROXY"
# 在这些环境变量下启动独立 DSH profile
```

内网代理地址、直连域名按实际部署替换；大小写变量保持一致。
Git HTTP 还会读取系统/全局/仓库 proxy 配置，已有 URL 专用配置可能覆盖环境变量。
SSH remote 不使用 HTTP_PROXY，需由内网既有 SSH ProxyCommand/ProxyJump 配置处理。
不要关闭 TLS 校验；公司 CA 通过 Node/Git 各自的受信任证书配置安装。

可运行 `CLASH_PROXY_URL=http://127.0.0.1:49159 node plugins/git/test/proxy.mjs`：
本地 CONNECT 转发器记录目标主机，再转发给指定代理；仅 GET 公共仓库信息和 fetch 公共 Git 仓库。
同时用不可用代理作为负对照，确认请求没有静默直连。测试创建并清理自己的临时仓库，不改全局 Git 配置。

## 当前工作区自动读取

`repository` 留空或使用 `current`，自动识别会话工作目录的 Git 根目录与 origin。无需登记即可读取状态、日志、分支和 GitHub Issues。GitHub 优先沿用 GH_TOKEN/GITHUB_TOKEN 或已有 gh 登录；公共仓库可匿名读取。未知平台仍可读取本地 Git，API 适配可按域名配置。自动发现不授予写权限，已有仓库规则优先；外网 push 仍禁止。

设置页默认是“读取 + 创建 Issue”，不是纯只读。显式 `apiWrites` 是管理员上限（空数组拒绝所有 API 写入），设置页只能在其范围内放行；未指定 `apiWrites` 时可由设置页管理。`localWrite:false` 和 remote `push:false` 同样不可被开关覆盖。catalog 返回有效权限和 permissionSource。Push 的 branch 同时指定本地源分支与远端目标分支，不使用当前 HEAD。
