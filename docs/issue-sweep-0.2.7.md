# Workbench 0.2.7 验收与 Issue 对照

## 修复

- #1：GitLab MR 创建、评论、合并入口已存在；显式 action 权限、内网限制、目标分支白名单及合并前实际 SHA 检查继续保留。
- #2：按 Issue 提供的文档备选处理，不开放 eval。README 明确 snapshot/DOM 之外的值可能不可读，不能把 confirm=true 当作宿主批准；拒绝路径有回归测试。未实现任意 JS 或秘密结果专用审计。
- #3：Worker 每次派单接收本项目记忆快照，任务验收标准优先，不可反写 Chief 存储。
- #4：使用仓库根发布分支，不再依赖易被丢弃的 &path 参数。独立安装器还处理部分宿主 plugin add 只转发 pnpm、未登记 bundle 的行为：先验证元数据与 patch 存在，再登记，拒绝普通源码根。
- #5：同进程 writer guard + SQLite 单写者租约，close 后释放；Windows/macOS/Linux CI 通过。
- #6：Push 源与目标都明确为 refs/heads/<branch>；真实离线裸仓库验证当前在 main 时推另一分支，远端得到该分支提交而非 HEAD。
- #7：本地盘符、UNC、file URL 在 SCP 之前识别；带 hostname 的 file URL 仍按该主机校验。跨平台 CI 包含 Git 测试。
- #8：损坏 Markdown 不再拖垮整个 Chief。看板报告具体文件路径，受影响项目停止派单和写记忆，其他项目继续；修复后重启加载，不覆盖损坏文件。
- #9：fill/type/select 的 value 是数据，通过 -- 分隔传递；负数和连字符文本允许。原生 CLI 已确认 -5 通过参数解析；未操作用户应用。
- #10：AB/AD 子进程仅继承明确的系统路径、临时目录、区域设置、桌面会话与代理变量，不再继承任意宿主 API key/token。用执行器捕获测试确认测试秘密不传递。
- #11：默认是“读取 + 创建 Issue”，不是“只读”。显式 apiWrites（包括空数组）、localWrite:false、remote push:false 为管理员上限；开关不能突破。catalog 明示来源及有效权限。外网 Push/MR 写仍禁止。
- #12：构建核对固定组件的全部分发文件与当前源码，版本也必须一致；provenance 增加组件版本。旧 0.1.5 不追改历史，使用新发布包；0.2.1 宿主用户需要先升级宿主，不能把 0.2.7 宣称为其兼容包。
- #13：新增默认关闭的独立 provider-gateway。实现固定回环端口、SSO 单飞/单次重登、头部三层、模型发现回退、SSE/断连取消、限速与 Retry-After；复用内网设置页，使用宿主 configEditor 同步指定 provider。共享池通过可选适配器接入；不实现多人凭据发布服务。

## 验证

- 本地完整测试和 `pnpm check` 通过；开发分支 CI 的 Linux 全量测试、Windows/macOS/Linux Chief + Git + 网关测试通过。
- 新独立 profile 从固定 Git 包安装，验证 bundle 登记；默认网关关闭且没有监听。
- 独立 DSH 0.2.2-rc.1 启用网关后，设置 API 识别适配器，连接测试通过，发现模型通过宿主配置 API 写入指定测试 provider。
- 实际设置 UI：添加 x-team 虚构请求头并掩码保存；点击“发送测试请求”得到调用成功。上游是回环模拟 HTTP 服务，不是真实模型或内网认证。
- 无外部 Issue/评论/Push 测试请求；发布与 Issue 回填是用户明确要求的仓库维护。
- 本机正式 Desktop 未升级，未修改正式配置、会话、凭据或权限。

## 内网后续验收

配置真实 SSO 适配器、模型后端和可选池协议；验证原生模型选择、真实流式推理和 Windows Desktop 权限。上下文长度、多模态能力不由一次文本探测推断。网关不改动其余 provider 的配置值，但宿主编辑器可能规范化 YAML 格式，因此不承诺其他块的字节格式不变。

最终本地完整测试为 95 项通过。独立宿主正常重启后 Chief 会话 ID 保持一致，已保存请求头仍仅返回掩码状态，网关 `/v1/models` 再次返回 200。验收完成后关闭独立宿主和模拟上游，确认监听端口释放。
