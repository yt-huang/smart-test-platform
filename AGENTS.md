# 项目协作约定

用户要求主动协调已接入的执行者：对适合拆分的开发工作，Codex 主控自行分配 Codex 与 Kimi 的职责，允许独立任务并行，不要求用户每次点名启用 Kimi。按 `.agents/skills/saas-multi-agent/SKILL.md` 与 `references/runtime.md` 执行真实调用。

先核验已有执行工具及模型配置元数据，复用已登录配置，不输出凭据。Kimi 当前已配置的默认别名为 `kimi-code/kimi-for-coding`；运行时重新核验实际配置，不以进程名或模型自述代替 provider 验证。不可用时明确具体原因，不冒充已经执行。

按实际独立工作分配职责，不为使用更多 Agent 重复实现。并行代码修改使用独立 worktree、明确文件负责人和接口版本；主控统一规格、验证和集成。实现者交付差异及真实检查结果；独立上下文验收不由原实现者自评代替。

后续其他 Agent 接入沿用 skill 的交接模板：记录工具/provider/model、输入提交、绝对工作目录、允许修改范围、验收场景、实际输出及退出结果。核验其真实执行能力后再分派，不把未连接执行者列为可用。

技术栈为 Java 21 / Spring Boot / PostgreSQL、React/Vite、Node/Playwright。不得生成假的成功执行、真机、投屏或 AI 接入状态。当前云端为 GitHub Codespaces，8080 默认私有；密码与令牌只从忽略提交的配置或已授权认证读取，不写入代码、交接、报告和日志。
