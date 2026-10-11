# Delta Spec: ci-integration

## ADDED Requirements

### Requirement: CLI 与 OpenAPI
平台 SHALL 提供 CLI（`platform run` 等）与 REST OpenAPI，支持以套件/计划/能力声明发起执行并轮询或回调获取结果。

#### Scenario: 一条命令跑冒烟
- **WHEN** 研发在本地或 CI 执行 `platform run --suite smoke`
- **THEN** 冒烟套件被调度执行，命令以退出码反映通过/失败

### Requirement: CI 插件与质量门禁
平台 SHALL 提供 Jenkins 与 GitLab CI 插件；PR 冒烟门禁 MUST 在 5 分钟内返回结果，主套件失败阻断合并。

#### Scenario: 冒烟门禁
- **WHEN** 一个 PR 触发冒烟流水线
- **THEN** 5 分钟内平台返回结果，失败时流水线红并附报告直跳链接

### Requirement: flaky 隔离联动门禁
被隔离的 flaky 用例 SHALL 继续执行并上报结果，但其失败 MUST NOT 阻断门禁；隔离的进入与退出事件 MUST 产生跟踪工单与通知。

#### Scenario: 隔离不卡合并
- **WHEN** 被隔离用例在 PR 流水线中失败
- **THEN** 门禁按警告处理不阻断合并，用例结果仍记录并计入 flake 看板

#### Scenario: 隔离退出须人工
- **WHEN** 某隔离用例连续多日通过
- **THEN** 平台不会自动将其移回门禁套件，须负责人在跟踪工单中确认修复或删除；隔离超过 14 天自动升级通知测试负责人

### Requirement: 质量度量看板
平台 SHALL 提供质量看板：通过率、flaky 率（告警线 3%）、回归耗时、设备利用率与 AI 用例占比，数据延迟 MUST ≤ 5 分钟。

#### Scenario: flake 率越线告警
- **WHEN** 套件 flaky 率超过 3%
- **THEN** 测试负责人收到飞书告警，看板可下钻到具体用例的分数曲线
