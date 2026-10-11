# Delta Spec: test-management-platform

## ADDED Requirements

### Requirement: 测试资产线上化
平台 SHALL 提供用例、测试计划、执行记录、报告的线上统一管理（基于 MeterSphere 或等价方案），测试资产线上化率 MUST 达到 100%。

#### Scenario: 用例双向追溯
- **WHEN** 查看任意线上缺陷
- **THEN** 可追溯到关联用例、执行记录与需求条目

### Requirement: 统一报告格式
所有引擎（Playwright / Appium / Maestro / AI Agent）产出的结果 SHALL 归一为统一报告格式，包含步骤、证据与结论。

#### Scenario: 跨引擎报告一致
- **WHEN** 一次回归同时包含 Web、Android、iOS 用例
- **THEN** 产出一份聚合报告，按业务模块而非引擎类型组织

### Requirement: 缺陷双向同步
平台 SHALL 与现有缺陷系统（Jira / 禅道 / TAPD 之一）建立缺陷双向同步。

#### Scenario: 失败自动建单
- **WHEN** 回归中发现确认的产品缺陷
- **THEN** 平台在缺陷系统创建工单并回填执行证据链接，状态变更双向同步

### Requirement: 质量度量看板
平台 SHALL 提供质量看板，至少包含：通过率趋势、覆盖率、flaky 率、回归耗时、设备利用率。

#### Scenario: 发布决策依据
- **WHEN** 发版评审
- **THEN** 评审材料直接引用看板中的当前版本质量数据
