# 站点卡和本地知识

Browser 可从操作员指定的 `siteCardsDirectory` 读取唯一 JSON 真源。工具动作 `site_list` / `site_read(site)` 在首次调用时使用宿主当前工具清单核对 requires.tools，并按配置 enabledPresets 隐藏未启用能力。没有外发闸门的 egress 卡拒绝加载。

每个站点一个 JSON 文件，必填：site、version、access(web/api/hybrid)、login(sso-cookie/site-account/oauth/none)、actions(read/write-local/egress)、requires.tools、requires.presets、entry、identity、success、pits、forbidden。web/hybrid 另需 steps 数组；纯 API 可以不写步骤。success 必须说明业务结果如何查回，不把 HTTP 200 当完成。

只记录流程和常量；不写 Cookie、临时 ref、session id 或一次性签名 URL。加载器扫描秘密和临时状态形态，报文件与行号，重复 site 报两个来源路径。它是格式检查，不代表可以检测所有秘密；审查仍需核对内容。

可从 `dsh-workbench-browser/site-cards` 导入 loadSiteCards、renderSiteCard、deploySiteCards。先以实际 profile 工具清单校验，再渲染；产物是带版本、源 SHA256 的 UTF-8/LF Markdown，front matter 字段使用 JSON 引号（合法 YAML 标量）。部署写入独立 site-<id>/SKILL.md，不用软链接。重复部署无变更；已有产物不同则按内容哈希备份后覆盖。只改源文件，部署目录不作为第二真源。

## 可选本地知识

配置 Browser `knowledge: {enabled: true, index: <私有 index.json>, maxAgeDays: 30, topK: 5, fallbackSources: [<源地址>]}` 才注册 workbench_knowledge；默认不注册、不占工具预算。索引构建和查询分开，人工更新索引，不定时抓取、不自动上传。

索引格式：`{version:1,documents:[{id,title,body,sourceRef,indexedAt}]}`。body 是完整正文，indexedAt 是 ISO 日期。search(query) 返回完整命中项，read(id) 一次取正文；每条有来源、时间和 stale 标记。未命中明确说明，删除/损坏返回 unavailable 和预设回源地址；不会凭空生成答案或自动访问外网。索引是派生物，放 profile 私有状态目录，不放 Git，不放凭据。回源仍遵循原网站授权与外发规则。
