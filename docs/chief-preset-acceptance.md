# Chief 0.3.3：preset 与会话恢复回归

日期：2026-11-07。开发提交：`0ffb7a5`，开发分支 `dev/chief-preset-harness`。
环境：macOS、DSH 0.2.1-rc.5、Node 24.22.2、pnpm 11.18.0、ChatGPT provider 0.1.18。

## 原因与修复

全新 Web profile 自动打开第一个工作区时，宿主 createInWorkspace 会将已有空白会话按默认 preset 复用，
Chief 因而变成 Standard mode。旧的 Chief 初始化见到 preset 不符便新建会话，导致重启后原页面失去管理工具。

现在 Chief 入口先调用 open 接口，在绑定的会话内恢复专属 preset，再打开原生聊天页面。
启动时也在原会话内恢复，不再因 preset 不同创建替代会话；历史与 Chief ID 保持不变。
迁移使用宿主 recompose 和持久化 agent-preset/selected 事件，不为修复制造用户消息或模型回合。
只作用于配置绑定的 Chief，不改项目会话 preset。宿主修复失败时不记录成功事件。

## 实际回归

使用 harness 创建全新状态目录，只复用此前隔离测试的本地授权，未复制会话。

- 初始宿主默认页复现 Standard mode；第一次点击左侧 Chief 管家后，在首条消息前显示 Chief 管家。
- 真实模型调用 Chief list、登记与记忆工具，保存验收标记 `PRESET_STABLE_033`。
- harness 正常停止并重启：Chief ID 与第一次记录一致，previousChiefSessionIds 为空。
- 刷新原页面后显示 Chief 管家；模型复述原标记并调用 list 读回原登记。
- 将同一修复提交推到开发分支，用 pnpm Git 固定提交重新安装。
  安装包全部 files 条目与已测试源码逐字节一致；重启再次保留同一 Chief ID 与专属 preset。
  Git 安装后的真实模型再次调用 list，正确返回原标记和 1 个既有登记，未创建新任务。
- 单元测试 29/29，通过 preset 原地迁移、历史保留、幂等恢复及失败不伪造事件等检查；构建一致性通过。
- harness 实测 init、tgz/Git install、start、status、stop；skill 格式校验通过。

## 边界

没有修改原 Desktop、旧测试 profile 或接入 IM。初始宿主自动恢复的默认页面仍可能显示 Standard mode；
这是宿主默认导航，点击 Chief 专用入口会先校正再打开。修复不修改 DSH 宿主的全局默认 preset。
本轮聚焦 preset 与重启，没有重新执行长任务、额度耗尽、Windows 或旧版本全部迁移矩阵。
已有旧版本曾创建的历史替代会话不会被自动删除或合并。

开发 skill：[plugin-harness](../dev/plugin-harness/SKILL.md)。正式 profile 升级为独立步骤，本轮未执行。
