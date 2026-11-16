# 站点卡和本地知识

Browser 可从操作员指定的 `siteCardsDirectory` 读取唯一 JSON 真源。工具动作 `site_list` / `site_read(site)` 在首次调用时使用宿主当前工具清单核对 requires.tools，并按配置 enabledPresets 隐藏未启用能力。没有外发闸门的 egress 卡拒绝加载。

每个站点一个 JSON 文件，必填：site、version、access(web/api/hybrid)、login(sso-cookie/site-account/oauth/none)、actions(read/write-local/egress)、requires.tools、requires.presets、entry、identity、success、pits、forbidden。web/hybrid 另需 steps 数组；纯 API 可以不写步骤。success 必须说明业务结果如何查回，不把 HTTP 200 当完成。

只记录流程和常量；不写 Cookie、临时 ref、session id 或一次性签名 URL。加载器扫描秘密和临时状态形态，报文件与行号，重复 site 报两个来源路径。它是格式检查，不代表可以检测所有秘密；审查仍需核对内容。

可从 `dsh-workbench-browser/site-cards` 导入 loadSiteCards、renderSiteCard、deploySiteCards。先以实际 profile 工具清单校验，再渲染；产物是带版本、源 SHA256 的 UTF-8/LF Markdown，front matter 字段使用 JSON 引号（合法 YAML 标量）。部署写入独立 site-<id>/SKILL.md，不用软链接。重复部署无变更；已有产物不同则按内容哈希备份后覆盖。只改源文件，部署目录不作为第二真源。

## 可选本地知识

配置 Browser `knowledge: {enabled: true, index: <私有 index.json>, maxAgeDays: 30, topK: 5, fallbackSources: [<源地址>]}` 才注册 workbench_knowledge；默认不注册、不占工具预算。索引构建和查询分开，人工更新索引，不定时抓取、不自动上传。

索引格式：`{version:1,documents:[{id,title,body,sourceRef,indexedAt}]}`。body 是完整正文，indexedAt 是 ISO 日期。search(query) 返回完整命中项，read(id) 一次取正文；每条有来源、时间和 stale 标记。未命中明确说明，删除/损坏返回 unavailable 和预设回源地址；不会凭空生成答案或自动访问外网。索引是派生物，放 profile 私有状态目录，不放 Git，不放凭据。回源仍遵循原网站授权与外发规则。

## 可执行站点验收

站点卡增加 `verify` 契约，`site_verify(site)` 使用宿主 subprocess；不接收模型提供的命令。
采用 argv 数组避免 shell 字符串解释。裸 `node` 使用宿主 Node；裸 `python/python3` 由宿主的原生 subprocess PATH 解析，也可显式设置 Browser 的 pythonPath。

```json
{"verify":{"argv":["node","bin/portal.mjs","verify"],"expects":["home_status=200","entries>=1","OK: records"],"artifacts":["本次首页列表截图"]}}
```

expects 支持精确输出行和 `key>=number` / `<=` / `>` / `<` 数字断言。退出码、输出完整性与全部断言均通过才是 machine-passed；200 但 entries=0 失败。失败包含输出尾部。截图始终标 manual/需人看，缺截图不伪造自动失败或自动通过。`offline:true` 明确 skip。
修改 expects 等同修改验收契约，PR 描述必须说明改变了哪项业务判据。只看 HTTP 200 或 PASS 文案不能证明站点可用。

## 可选视觉旁路

Browser 配置 `vision.enabled:true` 后才注册 `workbench_vision`。配置例：

```yaml
vision:
  enabled: true
  baseURL: http://vision.internal/v1
  model: your-vision-model
  tokenRef: INTRANET_VISION_TOKEN
  maxBytes: 5242880
  timeoutMs: 30000
  maxTokens: 1024
```

输入是 PNG/JPEG 路径和问题，或由可信 workbenchImages.resolve 适配器提供的 image: 句柄。
只将图片发给旁路后端，工具返回纯文本、untrusted、model、bytes、sha256、尺寸（PNG）与 latencyMs。
超过字节上限/PNG 单边 8192 像素明确拒绝，要求先降采样；不静默截图或修改原文件。
普通图片不删除。只有配置了专用 temporaryDirectory 且调用 temporary:true 时才在 finally 清理该目录内的临时文件；不缓存图片。
外网地址需操作员显式 external:true，并启用 Git 提供的 workbenchEgress 服务；后台来源、未确认、拒绝均不会发请求。
外发确认展示图片路径、问题、大小和哈希，由操作者检查图片内容；不会声称文本扫描已检查图片里的秘密。没有跳过确认的开关。
internalHosts 仅由操作员补充内网主机名；它是部署边界配置，不是自动 DNS 网络分类器。
