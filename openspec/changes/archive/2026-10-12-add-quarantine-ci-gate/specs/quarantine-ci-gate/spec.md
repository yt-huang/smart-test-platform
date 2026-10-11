## ADDED Requirements

### Requirement: 提交隔离快照与真实执行
平台 SHALL 在创建运行或矩阵事务内冻结已隔离且属于本次审批集合的用例 ID，继续执行全部用例并保留原始结果。MUST NOT 允许客户端改写冻结集合，MUST NOT 以当前隔离状态追溯改变历史门禁。

#### Scenario: 首次触发隔离
- **WHEN** 同一提交和实际环境的失败触发 EWMA 隔离
- **THEN** 本次首次失败仍阻塞，下一次提交的隔离失败成为警告且仍有真实失败证据

#### Scenario: 人工释放与审批编辑
- **WHEN** 创建后人工释放隔离或修改用例
- **THEN** 已提交任务保持原审批及隔离快照；新任务使用新状态

### Requirement: 保守门禁与终态冻结
平台 SHALL 公开明确的 PENDING/PASSED/WARN/BLOCKED gate 与一致计数，只将已冻结隔离的显式 FAILED 用例作为警告。MUST 将缺失结果、SKIPPED、TIMED_OUT 与基础设施故障保留为阻塞，首次终态冻结判定及导出结果快照。

#### Scenario: 隔离失败伴随清理故障
- **WHEN** 隔离用例失败且 Agent 清理未成功
- **THEN** 原任务保持失败，门禁 BLOCKED，基础设施错误不被隔离隐藏

#### Scenario: 取消后的晚到完成
- **WHEN** 任务取消或超时后 Agent 补传结果
- **THEN** 门禁与门禁 JUnit 保持阻塞且一致

#### Scenario: 历史任务无快照
- **WHEN** 读取本功能部署前保存的任务
- **THEN** 使用明确 strict-legacy-v1 策略、空隔离集合，并按真实结果保守判定

### Requirement: 双份报告与矩阵聚合
平台 SHALL 同时保留原始 JUnit 与独立门禁 JUnit，后者以 skipped 标记隔离失败并保留失败原因，基础设施错误以 error 输出，节点与计数一致。矩阵 SHALL 在全部目标终态后按 BLOCKED > WARN > PASSED 聚合，活跃导出 MUST 返回409；所有报告需登录。

#### Scenario: 只读用户下载警告报告
- **WHEN** VIEWER 下载原始和门禁报告
- **THEN** 原始报告仍包含真实 failure，门禁报告以 skipped 记录隔离失败且可定位原原因

### Requirement: 明确 CLI 策略与门户呈现
CLI SHALL 提供显式 --gate，PASSED/WARN 为0、BLOCKED为1、畸形或不一致 gate 为2；默认仍按原结果退出。门户 SHALL 显示真实门禁状态、阻塞与隔离原因，并保留原始结果和原报告，禁止推断缺失 gate 为通过。

#### Scenario: 同一失败的两个 CI 策略
- **WHEN** 已隔离的失败分别用默认 CLI 和 --gate 执行
- **THEN** 两次均真实执行并保留 FAILED，默认退出1，--gate 警告退出0并下载门禁 JUnit

#### Scenario: 数据矛盾
- **WHEN** API 返回 WARN 却有阻塞错误或矩阵 gate 与目标不一致
- **THEN** CLI 退出2，不给流水线虚假成功
