# Delta Spec: device-access

## ADDED Requirements

### Requirement: Android 设备接入
Agent SHALL 通过 ADB 完成 Android 设备枚举、安装、日志采集，并以 scrcpy server（H.264 硬编）作为主投屏通道，保留 minicap 作为降级通道。

#### Scenario: 问题机型降级
- **WHEN** 某机型 scrcpy 投屏初始化失败
- **THEN** Agent 自动降级到 minicap 通道，设备打兼容标签，事件上报告警

### Requirement: iOS 设备接入
平台 SHALL 通过常驻 Mac 节点完成 WDA 构建与证书托管，Agent 经 go-ios 完成 iOS 设备安装、日志与性能采集。

#### Scenario: 证书过期预警
- **WHEN** WDA 签名证书距过期不足 14 天
- **THEN** 平台向管理员推送轮换提醒，iOS 设备入维护前的回归不受影响

### Requirement: 浏览器容器池
Web 执行 SHALL 使用容器化浏览器节点，每个会话 MUST 使用独立一次性容器。

#### Scenario: 会话隔离
- **WHEN** 一个 Web 会话结束
- **THEN** 其容器被销毁，下一会话在全新容器中启动，无 Cookie/存储残留

### Requirement: 设备状态机
设备状态（离线/空闲/占用中/清机中/维护中）SHALL 由 Agent 上报事实、平台裁决；任何状态回池前 MUST 通过清机校验。

#### Scenario: 清机失败隔离
- **WHEN** 清机后的截屏基线比对失败
- **THEN** 设备置为维护中并告警，人工恢复前不参与调度

### Requirement: 单 Agent 容量保护
单个 Agent 挂载设备数 SHALL 有上限（默认 50 台可配），超限注册 MUST 被拒绝并提示扩容。

#### Scenario: 超限拒绝
- **WHEN** Agent 注册上报第 51 台设备
- **THEN** 平台拒绝该设备登记并通知管理员新增 Agent
