# add-quarantine-ci-gate — CLI implementation

阶段状态：**implemented**。本报告记录实现者实际完成的代码和检查；独立验收、真实浏览器执行、Codespaces 部署与最终集成由主控另行提供证据。

## 输入与执行身份

- 输入提交：`13395bc120426bee8f1bf50d9d1c86c98af560c6`；规格：`openspec/changes/add-quarantine-ci-gate/design.md` Contract v1 与对应 delta spec。
- 工作目录：`C:/Users/admin/.codex/worktrees/platform-runtime/ai-test`；分支：`codex/gate-cli`。
- 实现 Agent：Codex 子 Agent `/root/gate_cli`；执行工具：`functions.exec` 的 PowerShell `exec_command` 与 `apply_patch`。Provider 为当前 Codex/OpenAI 执行环境；会话说明的模型家族为 GPT-6，工具没有独立返回具体模型 ID，记录为未知。没有把本实现记作 Kimi 执行。
- 已读取 `AGENTS.md`、`.agents/skills/saas-multi-agent/SKILL.md`、`references/runtime.md`、交接模板与指定规格。
- 授权写入范围：`cli/**`、本报告。未修改 backend、frontend、共享规格或主控验收脚本；没有 push，没有操作既有 8080 服务或用户进程。
- 2026-10-12 恢复时保留已有三个未提交源码改动，输入提交未变。

## 实现行为

`run` 和 `matrix` 都接受一次无值 `--gate`。默认行为继续按原状态返回 PASSED 0、FAILED/TIMED_OUT/CANCELLED 1，并下载原 `/junit`。显式 gate 模式等待 PENDING，PASSED/WARN 返回 0，BLOCKED 返回 1；API、参数、缺失/非法/矛盾 gate 与导出错误返回 2，没有 raw 成功回退。

gate 校验覆盖 policy、非负安全整数、正 total、用例计数守恒、状态与计数、终态与原始状态、原始 summary，以及唯一非空冻结用例 ID。WARN 必须为 raw FAILED、blocking/infra 为 0，且原 failed 与 quarantinedFailures 相等。无 infra 时 gate 分类与原统计一致；有 infra 时允许晚到完成补原统计，但门禁保持 BLOCKED。历史 `strict-legacy-v1` 不允许隔离用例或隔离失败。轮询中 policy、total、冻结 ID、矩阵目标身份保持提交快照一致。

矩阵按逐目标计数汇总、BLOCKED > WARN > PASSED 优先级和活跃 PENDING 判定，检查去重 ID 的稳定顺序；公开原始目标汇总计数存在时也核对。CLI 保留原始状态、原报告 URL、每个目标 URL，并输出 gate policy、通过/隔离失败/阻塞失败/基础设施错误计数；WARN 有明确的计数警告。

`--gate --junit FILE` 使用 `/gate-junit`，用固定版本 `saxes@6.0.0` 做 XML 解析，在写文件前检查结构与计数。拒绝畸形 XML、HTML/JSON 错误页、DOCTYPE、未知或非法嵌套节点、冲突 outcome、缺少/不安全计数、与 gate 矛盾的失败/跳过/错误节点；不覆盖原有文件。run 使用 testsuite，matrix 使用 testsuites，逐目标 suite 标签与 JSON 目标一致。按后端已确认映射核对 `tests=total+infra`、`failures=blocking`、`skipped=quarantined`、`errors=infra`，隔离 skipped 保留 `Quarantined failure:` 标识。导出文本保持原样，caseId/原始状态/失败信息不会被改写。

输出继续遮蔽 configured token、Bearer、常见秘密赋值和 URL 内凭据，并补充 encoded token 与响应 ID、轮询超时文本的遮蔽。所有请求仍使用 `redirect: error`。新增依赖已写入 CLI package 与 lockfile；直接调用前须在集成目录实际运行 `npm ci --prefix cli`。

## 实际检查

| 实际命令 | 环境与结果 |
| --- | --- |
| `node --version` | `D:/codesoft/nodejs/node.exe`：v22.11.0，退出 0；满足项目 Node 22+ 要求 |
| `npm --version` | 10.9.0，退出 0 |
| 基线 `npm test --prefix cli` | 退出 0；23 tests、23 pass、0 fail、0 skipped |
| `npm install --prefix cli --save-exact saxes@6.0.0` | 退出 0；新增 2 packages、audited 3 packages、0 vulnerabilities |
| `npm ci --prefix cli` 后再执行 `npm test --prefix cli` | lockfile 安装成功，联合命令退出 0；最终仍为 42/42 pass、0 fail，确认新依赖可从提交的 lockfile 复现安装 |
| 最终源码 `npm test --prefix cli` | 退出 0；42 tests、42 pass、0 fail、0 cancelled、0 skipped、0 todo；保留原有 23 项，新增 19 项 |
| `git diff --check` | 退出 0；仅 Git 的 LF/CRLF 转换提示，没有差异空白错误 |

新增测试从业务与失败场景覆盖：隔离的 APPROVED 用例仍提交（DRAFT 不提交，客户端不覆盖 gate）；原始 FAILED 与 gate WARN 的双策略；strict legacy；取消/超时/清理故障及晚到原证据；PENDING 轮询和客户端 deadline；policy/count/raw/terminal/矩阵目标与冻结 ID 畸形响应；有效与故障 JUnit；token 污染和重定向。

其中 3 次真实 Node CLI 子进程使用随机端口本地 HTTP **测试 fixture**，实际观测 gate run 退出 0、默认 raw run 退出 1、gate matrix 退出 0，鉴权与 junit 路由正确。真实 HTTP gate 导出跨源重定向测试观测到目的端请求数为 0、CLI 退出 2、没有输出报告文件。其余 API/report 数据也是 synthetic fixture，不计作实际 Agent、浏览器或部署验收。

## 限制与交接

本分支没有运行真实 Chromium/Firefox、EWMA 隔离触发、人工释放、历史报告哈希、服务重启或 Codespaces 测试。CLI 不从错误文案猜基础设施判定；门禁快照来源与真实执行完整性由后端和主控真实验收核实。XML 验证针对 Contract v1 的平台导出格式，并非通用 JUnit 格式转换器。

提交 SHA 由本报告所在提交及实现者交接返回提供；人工投入与费用不可观测，记录未知。实际 CLI 单次最终测试命令 wall time 为约 0.76 秒；跨会话任务总用时不可可靠归因。独立验证未由实现者自评替代，状态仍为 implemented。
