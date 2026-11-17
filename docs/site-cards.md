# 站点卡与验收

Browser 可从操作员指定的 `siteCardsDirectory` 读取唯一 JSON 真源。工具动作 `site_list` / `site_read(site)` 在首次调用时使用宿主当前工具清单核对 requires.tools，并按配置 enabledPresets 隐藏未启用能力。没有外发闸门的 egress 卡拒绝加载。

每个站点一个 JSON 文件，必填：site、version、access(web/api/hybrid)、login(sso-cookie/site-account/oauth/none)、actions(read/write-local/egress)、requires.tools、requires.presets、entry、identity、success、pits、forbidden。web/hybrid 另需 steps 数组；纯 API 可以不写步骤。success 必须说明业务结果如何查回，不把 HTTP 200 当完成。

只记录流程和常量；不写 Cookie、临时 ref、session id 或一次性签名 URL。加载器扫描秘密和临时状态形态，报文件与行号，重复 site 报两个来源路径。它是格式检查，不代表可以检测所有秘密；审查仍需核对内容。

可从 `dsh-workbench-browser/site-cards` 导入 loadSiteCards、renderSiteCard、deploySiteCards。先以实际 profile 工具清单校验，再渲染；产物是带版本、源 SHA256 的 UTF-8/LF Markdown，front matter 字段使用 JSON 引号（合法 YAML 标量）。部署写入独立 site-<id>/SKILL.md，不用软链接。重复部署无变更；已有产物不同则按内容哈希备份后覆盖。只改源文件，部署目录不作为第二真源。

## 可执行站点验收

站点卡增加 `verify` 契约，`site_verify(site)` 使用宿主 subprocess；不接收模型提供的命令。
采用 argv 数组避免 shell 字符串解释。裸 `node` 使用宿主 Node；裸 `python/python3` 由宿主的原生 subprocess PATH 解析，也可显式设置 Browser 的 pythonPath。

```json
{"verify":{"argv":["node","bin/portal.mjs","verify"],"expects":["home_status=200","entries>=1","OK: records"],"artifacts":["本次首页列表截图"]}}
```

expects 支持精确输出行和 `key>=number` / `<=` / `>` / `<` 数字断言。退出码、输出完整性与全部断言均通过才是 machine-passed；200 但 entries=0 失败。失败包含输出尾部。截图始终标 manual/需人看，缺截图不伪造自动失败或自动通过。`offline:true` 明确 skip。
修改 expects 等同修改验收契约，PR 描述必须说明改变了哪项业务判据。只看 HTTP 200 或 PASS 文案不能证明站点可用。

## 移除旧能力

独立知识索引与视觉旁路已退出支持范围。旧 knowledge/vision 配置不再注册工具；不删除原有索引、文档或历史会话。Chief 项目 Markdown 记忆与宿主原生多模态继续保留。

## 截图与站点会话

`workbench_browser({action:"screenshot",site:"compute"})` 返回私有 PNG 路径、宽高、字节数和 SHA256；不把 base64 或图片转述放进上下文。使用宿主原生图片工具读取该路径。默认保存 7 天、总量 64 MiB，在下一次截图时清理最旧的自有截图；可通过 `screenshots.retentionDays/maxBytes` 调整。截图可能包含业务信息，不能放到公开仓库。

复用固定站点账号配置：

```yaml
accounts:
  employee: {}
sites:
  compute:
    account: employee
    allowedHosts: [compute.example.internal]
    cookieRef: COMPUTE_SESSION_COOKIE
```

先 `open(site:"compute", target:"https://compute.example.internal")` 并在对应账号完成登录，再 `capture(site:"compute")`。结果仅含 kept/dropped 与 invalid/domain/expired 原因计数，Cookie 值保存在宿主凭据中。`restore(site:"compute")` 必须在同站点页面执行，拒绝跨站点、账号错配和过期会话。恢复后仍需核对页面身份与业务数据，不能把写入 Cookie 当作登录成功。关闭浏览器保留账号，不等同注销。
