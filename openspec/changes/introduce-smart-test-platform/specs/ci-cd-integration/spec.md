# Delta Spec: ci-cd-integration

## ADDED Requirements

### Requirement: 流水线原生集成
平台 SHALL 提供 Jenkins 与 GitLab CI 的原生集成（插件或 CLI），支持在流水线中触发测试、等待结果并按阈值失败。

#### Scenario: 门禁失败阻断
- **WHEN** 合并门禁套件出现确认失败（非 flaky）
- **THEN** 流水线失败，合并被阻断，PR 中可见失败摘要与报告链接

### Requirement: 门禁分级
平台 SHALL 支持门禁分级：PR 冒烟（<5 分钟）/ 合并门禁 / 发版全量回归（<30 分钟），各级套件范围可配置。

#### Scenario: 门禁渐进启用
- **WHEN** 一个新的门禁规则上线
- **THEN** 先以"仅告警"模式运行至少 2 周，信号可信后再转为阻断

### Requirement: 结果通知
平台 SHALL 将执行结果推送至飞书/钉钉，失败通知 MUST 包含失败用例、归因建议与报告链接。

#### Scenario: 通知可行动
- **WHEN** 一次夜间回归失败
- **THEN** 负责人收到的 IM 通知中可直接打开失败证据与归因建议，无需登录平台检索

### Requirement: 部署形态
平台各组件 SHALL 以容器化方式部署于公司 K8s，配置与用例资产纳入版本管理，支持环境重建。

#### Scenario: 环境可重建
- **WHEN** 测试平台所在集群发生故障
- **THEN** 可在 1 个工作日内从 IaC 与备份中重建平台并恢复最近状态
