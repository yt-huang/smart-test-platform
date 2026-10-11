# Contract v1

输入：已验证浏览器矩阵应用 ebe904d，交付归档 8632dba。职责：Codex 后端写 backend/src、docs/gate-backend-implementation.md；Codex CLI 写 cli、docs/gate-cli-implementation.md；真实 Kimi 写 frontend、docs/gate-kimi-implementation.md；主控维护本工件、真实验收脚本、CI/部署与交付；独立验收只写自身报告和忽略提交的证据。隔离 worktree，禁止互改。

## Gate API

所有公开 run、matrix 与 matrix.variants 均增加 `gate`：

```json
{"policy":"quarantine-at-submission-v1","status":"PENDING","total":2,"passed":0,"blockingFailures":0,"quarantinedFailures":0,"infrastructureFailures":0,"quarantinedCaseIds":[]}
```

gate.status 为 PENDING/PASSED/WARN/BLOCKED，计数为非负整数。total 为计划用例数（矩阵为全部子运行总和），terminal 时 passed+blockingFailures+quarantinedFailures=total；基础设施错误另计，不能被隔离抵消。活跃时计数之和允许小于 total。quarantinedCaseIds 为创建事务中已隔离且属于本次审批快照的用例 ID 集合，不接受客户端字段覆盖。矩阵在任何子任务非终态时为 PENDING，全部终态后按 BLOCKED > WARN > PASSED 汇总，计数逐子任务求和，ID 去重并保留稳定顺序。

创建 run/matrix 时读取现有 quality.quarantined；不跳过用例。首次失败触发的隔离只能影响之后提交的任务，不追溯改变触发任务。标记是用例级的，编辑用例不自动释放；人工释放只影响新提交。矩阵子运行共享同一提交时隔离集合。新运行 policy 为 quarantine-at-submission-v1；历史没有快照的运行使用 strict-legacy-v1、空隔离集并保守按真实结果判定。矩阵 policy 固定 aggregate-v1。

仅 Agent 明确提供的 FAILED 用例结果可因冻结集合而计入 quarantinedFailures。SKIPPED、TIMED_OUT、缺失结果均计入 blockingFailures。未收到完整有效完成、取消、排队/执行超时、断线、分配失败、清理失败均产生 infrastructureFailures>0 并 BLOCKED，即使所有可见失败用例已隔离。明确保存供应结果 ID 和 cleanupOk 等内部结构，不通过 message 文案猜测正常完成。

浏览器 Agent 的 done 增加 `infrastructureErrors` 字符串数组，实际执行器启动/外层失败、审批输入校验失败、中断、证据上传失败分别上报 EXECUTOR_FAILED/CASE_VALIDATION_FAILED/EXECUTION_ABORTED/EVIDENCE_UPLOAD_FAILED。后端校验最多20项、每项不超过100字符，任何显式错误均阻塞。旧 Agent 缺该字段兼容，但完整显式结果与 cleanupOk 仍必需。顶层 done.status=FAILED 可来自正常断言失败，不能单凭它推断基础设施错误。主控负责 Agent 与真实验证脚本，其他文件负责人不变。

有基础设施错误或 blockingFailures>0 为 BLOCKED；无阻塞且 quarantinedFailures>0 为 WARN；非空总数、全部真实 PASSED 为 PASSED。首次终态时冻结 gate 和 gate 导出使用的结果快照；晚到 done 可以补原始证据/清理，但不能把已取消/超时的门禁改成放行，也不能使 gate JSON 与 gate-junit 相互矛盾。公开文档不泄漏内部字段。

## Gate JUnit

GET `/api/runs/{id}/gate-junit`、`/api/matrices/{id}/gate-junit`，需现有登录；所有角色可读，活跃 409。分别导出 testsuite/testsuites，合法 XML，区分矩阵目标。

真正 PASSED 为普通 testcase；隔离失败为 `<skipped message="Quarantined failure: ...">` 并保留实际失败信息和 caseId/原始状态（例如 properties/system-out）；正常失败为 failure；基础设施错误必须有 error 且 errors>0。counts 与输出节点一致；人工释放/用例删除不改变历史 gate 报告。原始 junit 路由内容和失败状态保持原语义。安全 XML escaping 与鉴权证据语义沿用已有实现。

## CLI

`--gate` 是无值 flag，只允许一次，同时适用于 run/matrix。默认 exit 按原始状态兼容；显式 --gate 在 PENDING 时等待原任务，最终 PASSED/WARN 退出0，BLOCKED退出1；不存在/矛盾/非法 gate 数据退出2，不能默默回退或将畸形响应当通过。检查 policy、终态关系、正整数 total、计数和、状态计数、矩阵 gate 与各 variant 求和/状态一致。保持实际 run/matrix 状态与原报告 URL 输出，另输出 gate 状态与隔离/阻塞/基础设施计数；WARN 输出明确警告。`--gate --junit FILE` 下载 gate-junit，默认仍下载原 junit。现有参数、超时、秘密遮蔽、重定向拒绝均保持。

## Portal

复用现有 tokens/组件，不增独立 fake 数据。RunDetail 与 MatrixDetail 在真实原始结果下显示门禁卡：等待判定/通过/警告放行/阻塞，清晰区分隔离失败数、阻塞失败数、基础设施错误，说明冻结于提交且原始失败仍保留。无 gate 时显示“此历史报告未提供门禁判定”，不推断通过。矩阵每个目标显示 gate 状态。另提供“门禁 JUnit”按钮，活跃禁用，原 JUnit 保留。VIEWER 可读、不可写；桌面/手机无横向溢出，加载/错误/空状态沿用。

稳定性面板说明更新为同一非空 Commit、相同实际环境评分，已隔离用例仍执行；新提交的门禁将隔离失败作为警告，但取消/超时/资源故障阻塞；人工解除不修改历史。不要宣称告警通知或工单已经接入。

## Real acceptance

主控验收脚本使用可切换的实际本地 HTTP 页面和 Chromium；同一审批用例、同一 commit、同一浏览器版本按页面内容先成功后实际断言失败以触发 EWMA，不伪造 Agent 完成。第一次失败 BLOCKED，下一次失败原始 FAILED+gate WARN，实际 CLI --gate 0，默认原始 CLI 1；隔离用例继续有实际失败证据。真实人工释放后新失败 BLOCKED，旧 WARN JSON/JUnit 哈希不变。矩阵 Chromium/Firefox 中隔离失败允许 WARN，但缺失资源取消/超时 BLOCKED。程序化完成只用于后端边界测试，不能记成真浏览器。

部署到既有 Codespaces，真实调用、页面、权限、JUnit 节点/哈希、重启保留与完整 CI 都需实际检查。现场手机/通知服务未接入，继续如实记录。
