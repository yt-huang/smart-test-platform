# Delta Spec: ai-testing-engine

## ADDED Requirements

### Requirement: 私有化 AI 引擎
平台 SHALL 基于 Midscene.js + 内网私有化部署的视觉模型（Qwen3-VL / UI-TARS）提供 AI 执行通道；含业务数据的截图 MUST NOT 发送至外部模型 API。

#### Scenario: 视觉驱动跨端执行
- **WHEN** 一条用例以自然语言描述操作与断言
- **THEN** AI 引擎在 Web / Android / iOS 任一目标上通过截图定位元素并执行，无需元素选择器

### Requirement: AI 用例生成人工审核制
AI 生成的接口/功能用例 MUST 进入"待审核"状态，经人工评审通过后方可入库；未经审核的 AI 用例 MUST NOT 进入回归门禁链路。

#### Scenario: 未审核用例被隔离
- **WHEN** AI 批量生成 50 条用例
- **THEN** 全部处于待审核队列，审核通过前不参与任何门禁执行

### Requirement: 视觉自愈与评审
平台 SHALL 在 UI 变更导致定位失败时尝试视觉自愈，自愈变更 MUST 生成前后 diff 供人工确认后生效。

#### Scenario: 自愈可追溯
- **WHEN** 一个按钮文案变更导致用例失败
- **THEN** 平台给出自愈建议（旧定位 vs 新定位 diff），人工确认后更新用例并记录审计日志

### Requirement: 失败智能归因
平台 SHALL 对失败用例聚合日志、trace、截图生成归因建议（产品缺陷 / 环境问题 / 用例问题 / 数据问题），并统计归因采纳率。

#### Scenario: flaky 自动隔离
- **WHEN** 某用例在无相关代码变更时间歇失败率超过 5%
- **THEN** 平台将其隔离出门禁套件、标记为 flaky，并创建修复任务

### Requirement: AI 能力度量
平台 SHALL 度量并展示：AI 生成用例占比、审核通过率、误报率、自愈成功率、归因采纳率。

#### Scenario: 试点验收有据可依
- **WHEN** P3 阶段结束评审
- **THEN** 上述五项指标均有报表支撑，作为是否扩大 AI 应用范围的决策依据
