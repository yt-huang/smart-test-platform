# 真实执行与工具接入

资料基线：2026-10-11。工具首次接入或版本变化时检查实际能力，之后复用已核验配置。不要每个任务重复安装或全量读官方文档。

## Codex 原生多 Agent（默认）

使用当前环境实际提供的子 Agent 工具分派、通信和等待任务。在本环境可使用 collaboration 的 spawn_agent、send_message、followup_task 和 wait_agent；其他环境按真实暴露能力执行，不能凭空调用不存在的工具。内部任务无需创建用户可见的新聊天。

主控保留整体目标，给每个执行 Agent 相关代码与规则入口、输入版本、文件范围、验收条件和结果要求。实际分派后继续独立工作，再等待／检查返回；把可复现发现交回原实现 Agent 修复。验收使用独立上下文，输入规格、代码差异和实际检查证据，避免把实现者自评当结论。

优先使用“主控 + 实现 + 独立验收”，按需增加设计或第二实现者；角色按阶段复用，不要求同时启动固定数量的 Agent。前后端／模块边界独立时并行，不同 Agent 不同时改同一文件。并行代码实现优先隔离 worktree；主控保护用户已有改动并验证最终集成版本。

记录实际 Agent 标识／角色、可观测模型身份、差异与检查；未知模型元数据记未知。全 Codex 路径不依赖 Kimi。只有用户选择跨模型执行时才读下方相应接入方式。

## Kimi Code CLI

普通网页对话用于探索；CLI 能访问项目并运行命令。模型 API、独立 CLI 和 Codex 内部子代理分别记录。确认 kimi 可执行路径、版本和帮助；只读取需要的配置元数据，不输出凭据。

本次创建 skill 时，本机 Kimi Code 0.29.0 的帮助支持 `-m`、`-p` 和 `--output-format stream-json`。调用形状为：

```text
kimi -m SELECTED_ALIAS -p TASK_PROMPT --output-format stream-json
```

SELECTED_ALIAS 和 TASK_PROMPT 是说明性占位，实际执行使用已核验别名与任务输入。调用前核验该别名对应 Kimi provider／模型，进程名或模型自报名字不足以证明身份。[官方命令](https://www.kimi.com/en/help/kimi-code/cli-kimi-command)

由外部进程执行器在指定绝对工作目录中启动；用正常参数传递，不拼接不可信 shell 字符串。提示指向确定的 handoff 文件、项目规则入口及输入提交；不假定不同工具自动读取同名规则文件。收集 stdout JSONL、stderr、退出码、diff／提交和结果报告，给调用设置可落实的时长与权限边界。

当前 `-p` 为非交互执行且默认 auto 权限，不要同时添加 `--auto`、`--yolo` 或 `--plan`。项目约定的文件范围需要环境权限或变更检查配合，提示本身不强制隔离。若模型或登录缺失，准备可复用任务包并报告具体前置条件，不谎报执行成功。

`kimi acp` 是 ACP 服务，Kimi MCP 是客户端；不能把 ACP 当 MCP 服务。普通 shell 子进程足够完成起步阶段的外部调度，无需先搭建复杂编排平台。[ACP](https://www.kimi.com/en/help/kimi-code/cli-kimi-acp)

## Kimi 网页／API 协作

用户选择网页方式时，提供可复制的相关规格、代码上下文和结果要求；若未实际操作其网页会话，明确这是待用户发送的交接提示。收到真实返回后由协调者核对来源和差异，再按任务授权入库与检查。网页返回代码不等于仓库已经实现。

用户选择 API 时，核验实际 provider、模型及可用工具执行器；纯模型输出也需由执行器应用到仓库并运行检查。沿用已有认证方式，不在提示、日志或报告中放凭据。网页版、API 与 CLI 都记录真实输入、返回及落盘状态，不能用内部子代理冒充跨模型协作。

## OpenSpec

先检查当前项目是否已有集成。用户要求配置时，在实际业务项目接入，避免全局或已有配置被无关覆盖。以下为已核验 v1.14.1 用法；按安装版本生成的提示为准。

```text
openspec init --tools codex --profile core
```

上例用于全 Codex 路径；实际选择 Kimi 协作时才改为 `--tools codex,kimi`。保留项目已有工具集，不因角色拆分重复初始化。

Codex 集成使用 `.agents/skills/` 和 `$openspec-*`；Kimi 集成使用 `.kimi-code/skills/` 和 `/skill:openspec-*`。例如 Codex 的 `$openspec-propose`，Kimi 的 `/skill:openspec-apply-change`。这是 Agent 聊天技能调用，不是 shell 命令。[工具说明](https://raw.githubusercontent.com/Fission-AI/OpenSpec/v1.14.1/docs/supported-tools.md)

core 包含 explore、propose、apply、update、sync、archive。需要 verify 时，通过 `openspec config profile` 保留所需工作流并加入 verify，然后在项目运行 `openspec update`。未安装相应技能时不能直接假定可调用。

主规格在 openspec/specs；变更在 openspec/changes/CHANGE_ID，delta 为 specs/CAPABILITY/spec.md。使用标准 `### Requirement:` 与 `#### Scenario:` 标题；修改已有需求时提供完整更新后行为和场景。OpenSpec 工件验证与归档不构成程序质量门禁。[概念](https://raw.githubusercontent.com/Fission-AI/OpenSpec/v1.14.1/docs/concepts.md)、[命令](https://raw.githubusercontent.com/Fission-AI/OpenSpec/v1.14.1/docs/commands.md)

## 项目执行

输入提交、文档版本和代码基线要一致。单实现者可按项目规则更新进度；并行实现者各自输出结果，由协调者汇总共享工件。分支检查通过后仍需验证最终集成版本。

项目不存在真实检查命令时，先从配置和代码确认适当检查；不能凭空写命令并宣称已通过。缺业务项目时按用户所要求阶段产出规划，不运行示例目录的假实现。
