# Delta Spec: security-multitenancy

## ADDED Requirements

### Requirement: 全链路传输加密
平台 SHALL 对用户门户、OpenAPI、Agent 连接与投屏通道强制 TLS/WSS；WebRTC 通道 MUST 强制 DTLS-SRTP。

#### Scenario: 无明文通道
- **WHEN** 审计平台全部对外端口
- **THEN** 不存在未加密的控制或数据通道（含裸 ADB TCP 5555）

### Requirement: RBAC 权限模型
平台 SHALL 提供管理员/测试/研发/只读四类角色，权限矩阵 MUST 覆盖全部功能入口与 API。

#### Scenario: 越权拒绝
- **WHEN** 只读角色尝试发起远程调试会话
- **THEN** 请求被拒绝并记入审计日志

### Requirement: 全量审计日志
平台 SHALL 记录会话发起、设备占用、远程 adb、证据下载等全部敏感操作，审计日志 MUST 保留不少于 180 天且支持按人/设备/时间检索。

#### Scenario: 操作可追溯
- **WHEN** 安全人员查询某台设备上月全部占用记录
- **THEN** 可列出每次占用的操作人、任务内容、时长与证据下载行为

### Requirement: 敏感用例受信路由
标记为敏感的用例 SHALL 被调度器强制路由到 provider=local 且带受信标签的设备，MUST NOT 调度到其他资源（含未来云真机）。

#### Scenario: 敏感不外出
- **WHEN** 敏感用例提交而受信池满载
- **THEN** 任务排队等待受信资源，绝不 fallback 到非受信设备

### Requirement: 多租户数据模型预留
用例、计划、设备、会话等核心表 SHALL 从首版携带 workspace 维度字段，当前部署 MUST 以单租户运行。

#### Scenario: 未来拆分不伤筋
- **WHEN** 未来引入第二个团队/租户
- **THEN** 仅需启用 workspace 隔离策略，无需数据迁移或表结构变更
