# Quarantine CI gate 后端实施记录

状态：implemented。2026-10-12 本机后端自动化检查已通过；独立验收、真实浏览器端到端调用及 Codespaces 部署由主控集成后验证。

## 执行身份与边界

- 执行者：Codex 原生协作子 Agent `/root/gate_backend_resume`，provider OpenAI；此调度未提供可独立核验的具体 model 元数据，记为 unknown。不将本执行者称为 Kimi。
- 输入提交：`13395bc120426bee8f1bf50d9d1c86c98af560c6`，Contract v1。
- 绝对工作目录：`C:/Users/admin/.codex/worktrees/platform-backend/ai-test`。
- 分支：`codex/gate-backend`。
- 文件负责人：本执行者只写 `backend/src/main/java`、`backend/src/test/java` 与本记录；未修改前端、CLI、Agent 或共享规格。
- 未推送，未启动 8080 服务，未读取或输出生产凭据。

## 已实施行为

创建运行时在事务内读取 `quality.quarantined`，将本次审批 ID 交集按计划顺序保存到内部 `_gateSubmission`。矩阵全部子运行共享同一提交时集合。客户端传入 gate、隔离 ID 或内部字段均不参与此集合。执行仍包含全部审批用例，首个失败触发的隔离只影响之后提交的任务。

公开 run、列表、dashboard recentRuns、matrix 与每个 variant 均提供 gate。运行使用 `quarantine-at-submission-v1`，历史无提交快照的运行使用 `strict-legacy-v1` 和空隔离集，矩阵使用 `aggregate-v1`。矩阵逐子运行求和，ID 稳定去重，任一目标活跃时保持 PENDING；全部终态按 BLOCKED、WARN、PASSED 优先级聚合。

完成消息保存内部 `_completion`：供应 case ID、明确提供 status 的 case ID、清理字段是否明确提供、cleanupOk、可选顶层 status 和 infrastructureErrors。仅供应且显式 FAILED 的冻结隔离用例可以计为 quarantinedFailures；缺失结果、缺失/空 status、SKIPPED、TIMED_OUT 计为 blockingFailures。缺少完整完成、取消、超时、断线、分配/启动失败或未确认清理均产生基础设施错误。顶层 done.status 可缺失；普通 FAILED + FAILED 用例允许 WARN，FAILED + 全部 PASSED 的矛盾完成保守阻塞。

可选 infrastructureErrors 必须是最多 20 个字符串组成的数组，每条最多 100 字符，且仅接受 `EXECUTOR_FAILED`、`CASE_VALIDATION_FAILED`、`EXECUTION_ABORTED`、`EVIDENCE_UPLOAD_FAILED`。缺字段兼容现有 Agent；null、错误类型、超界或未知 enum 被拒绝且不完成任务。结构化错误直接计入 infrastructureFailures，不读取 message 文案，不允许被隔离抵消。清理成功、完整显式结果、没有结构化基础设施错误的正常完成才参与 quality EWMA。

首次终态同事务保存 `_gate` 和 `_gateExport`；后者保存计划用例的导出状态、原始失败原因、日志及时间。晚到 done 保留原结果/summary 的补充和清理语义，但不改 gate 或门禁报告。历史终态在首次读取或晚到 done 修改前先冻结保守快照。旧 PASSED 只有 completionReceived 和完整、不同 ID 的全 PASSED 结果可证明正常完成；旧 FAILED 即使可见断言全 PASSED，仍因缺清理证明 BLOCKED。

新增登录后可读接口：

- `GET /api/runs/{id}/gate-junit`：终态 testsuite。
- `GET /api/matrices/{id}/gate-junit`：全部目标终态后 testsuites，每个目标独立 suite。

全部登录角色可读，活跃任务返回 409，未登录返回 401。原 JUnit 继续导出原始 failure。门禁 JUnit 真正 PASSED 为普通 testcase、隔离失败为 skipped 且保留失败原因、原状态与 caseId、普通阻塞为 failure、每条基础设施错误为独立带 error 的 testcase。`tests=total+infrastructureFailures`，`failures=blockingFailures`、`skipped=quarantinedFailures`、`errors=infrastructureFailures`，与实际节点对应。沿用现有 XML 1.0 字符过滤和 escaping。

原有创建/调度外部传输仍在 afterCommit 中执行，事务失败不发送任务；传输故障使用原有新事务恢复并冻结阻塞 gate。内部字段不公开。

## 实际检查

运行时：Microsoft OpenJDK `21.0.12.1+1-LTS`；Maven `3.9.9`，项目 Spring Boot `3.5.15`。

PowerShell，工作目录为上述目录的 `backend`：

```powershell
$env:JAVA_HOME = 'D:/code/ai-test/tools/java/jdk-21.0.12.1+1'
& 'D:/code/ai-test/tools/java/apache-maven-3.9.9/bin/mvn.cmd' -q test
```

首次现有测试回归退出 0：MatrixIntegrationTest 21、PlatformIntegrationTest 17，共 38 个，失败/错误/跳过均为 0。

新增测试第一次 `-q -Dtest=GateIntegrationTest test` 因 Java var 多变量声明编译失败，退出 1；修正后同命令 16 个测试中 1 个 fixture 错误（调用 initialize 将设备置 OFFLINE，后续测试仍尝试完成未分配任务），退出 1。将该恢复检查放到任务完成后，补充旧 FAILED 全 PASSED 的清理故障场景后，执行最终检查：

```powershell
$env:JAVA_HOME = 'D:/code/ai-test/tools/java/jdk-21.0.12.1+1'
& 'D:/code/ai-test/tools/java/apache-maven-3.9.9/bin/mvn.cmd' -q verify
```

退出 0。首次最终 Surefire：GateIntegrationTest 17、MatrixIntegrationTest 21、PlatformIntegrationTest 17，共 55 个测试；失败 0、错误 0、跳过 0，完成 jar 打包。`git diff --check` 退出 0。

主控只读检查提出历史 FAILED 在已经有新 `_completion`、却没有提交/导出快照时必须仍保守阻塞。补入独立 `LEGACY_NON_PASSED` 守卫，并增加历史 FAILED 晚到全 PASSED 和已存在完整新 completion 的测试；重新使用同一 `-q verify` 命令验证，退出 0：新增 gate 测试 18，共 56 个，失败/错误/跳过均为 0。

新增场景覆盖首个 EWMA flip/下一次 WARN、客户端快照注入、人工释放/审批编辑/删除、混合通过/隔离/阻塞计数、SKIPPED/TIMED_OUT/隐式 FAILED、缺结果、清理缺失/失败、四类显式基础设施错误、数组/enum/ID 负向验证、done envelope 矛盾、取消/执行超时晚到 done 冻结、排队超时/断线/启动恢复、严格历史兼容、矩阵共享集合/聚合/晚到冻结及所有角色与未登录 API 权限。现有用例继续覆盖真实事务锁、回滚无发送和 afterCommit 传输故障恢复。

## 限制与后续验证

本记录的完成消息是后端协议测试 fixture，不构成真实浏览器执行、真机或部署证据。这里使用 H2 PostgreSQL 模式并调用启动恢复方法验证保存内容；实际 PostgreSQL、进程重启和真实 Agent/CLI/门户链路需在集成版本验收。

兼容未提供 infrastructureErrors 的旧 Agent 时，仅凭完整 FAILED 结果和 cleanupOk=true 无法结构化区分真实断言失败与旧执行器用 FAILED 表示的启动/上传失败。当前 Agent 更新必须随此后端一起集成；不依据错误 message 猜测类型。
