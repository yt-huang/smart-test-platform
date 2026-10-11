# Delta Spec: device-and-browser-resources

## ADDED Requirements

### Requirement: 执行目标统一抽象
平台 SHALL 将所有执行资源（自建真机、云真机、浏览器网格、模拟器）抽象为"执行目标（Execution Target）"，测试任务 MUST 仅以能力声明（平台/版本/品牌/浏览器）请求资源，由调度层路由。

#### Scenario: 声明式资源请求
- **WHEN** 一个任务声明 `platform=android, version>=13, brand in [xiaomi, huawei]`
- **THEN** 调度层在满足条件的空闲目标中分配，调用方不感知目标来自自建池还是云

### Requirement: 混合供给策略
平台 SHALL 支持"高频核心回归走自建机池、长尾兼容走商业云"的可配置路由策略，敏感业务用例 MUST 强制路由至内网自建资源。

#### Scenario: 敏感用例不出内网
- **WHEN** 一条标记为"敏感"的用例被调度
- **THEN** 它仅在自建机池执行，任何情况下不被路由到公有云真机

### Requirement: 自建机池运维基线
平台 SHALL 建立 10–20 台核心机型的自建机池（Sonic），包含设备健康监控、自动重置与占用锁机制；设备 SHOULD 按约 2 年周期折旧换新。

#### Scenario: 设备异常自动下线
- **WHEN** 一台设备连续 3 次心跳异常或执行失败率超阈值
- **THEN** 调度层将其标记下线并通知运维，不再承接新任务

### Requirement: 云真机用量可观测
平台 SHALL 记录商业云真机的每次调用时长与费用归集，月产出成本报告。

#### Scenario: 成本可归因
- **WHEN** 月度成本报告生成
- **THEN** 云真机费用可按业务线/项目维度拆分
