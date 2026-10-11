# Delta Spec: evidence-report

## ADDED Requirements

### Requirement: 完整证据链
每次执行 SHALL 产出截图、录像、设备日志、执行日志与性能采样；证据文件 MUST 经存储抽象层直传（首版本地磁盘卷，接口语义兼容 S3 预签名），平台只保存索引。

#### Scenario: 失败快速回放
- **WHEN** 一条用例失败
- **THEN** 提交人 3 分钟内可在报告页回放全部证据，无需登录 Agent 主机

### Requirement: 时间轴回放报告
报告页 SHALL 将截图/录像/日志/执行步骤四轨按时间轴对齐，失败步骤 MUST 自动定位。

#### Scenario: 一键跳转失败点
- **WHEN** 用户点击报告中的失败步骤
- **THEN** 录像跳转到对应时间点，同屏显示当时截图与日志上下文

### Requirement: 结构化结果与 CI 双向集成
执行结果 SHALL 产出 JUnit XML 与 Allure 结构化报告，CI 流水线卡片 MUST 可直跳平台报告页（带权限校验）。

#### Scenario: 流水线直跳
- **WHEN** Jenkins/GitLab 中一次回归完成
- **THEN** 流水线结果卡片链接到平台报告，点击后经权限校验打开

### Requirement: 设备指纹与兼容性聚合
报告 SHALL 携带实际执行设备指纹（机型/OS/分辨率/Agent ID），平台 MUST 提供按机型聚合的兼容性矩阵视图。

#### Scenario: 矩阵一屏可视
- **WHEN** 测试负责人打开兼容性矩阵页
- **THEN** Top 20 机型的主链路通过率一屏呈现，失败机型可下钻到证据

### Requirement: 证据保留策略
证据存储 SHALL 支持可配保留策略（默认 90 天热存后归档），存储用量 MUST 可预测并超限告警。

#### Scenario: 用量告警
- **WHEN** 证据存储用量超过配额 80%
- **THEN** 管理员收到告警，可触发归档或扩容流程
